import {
  AuthenticatedWS,
  WSMessage,
  WSSessionStartPayload,
  WSAudioChunk,
  TutoringMode,
} from '../types';
import { send } from './ws-server';
import { SessionStore, StreamBuffer, InterruptionStore, ContextStore } from '../db/redis/session-store';
import { SessionRepository, MessageRepository, ProfileRepository } from '../db/supabase/repositories';
import { tutorOrchestrator } from '../orchestrator/tutor-orchestrator';
import { GeminiLiveProvider, GeminiSession } from '../ai/providers/gemini-live.provider';
import { createChildLogger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = createChildLogger('ws:session');

// Active AI sessions map: sessionId → GeminiSession
const activeSessions = new Map<string, GeminiSession>();

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_BASE_DELAY_MS = 1000;

async function attemptReconnect(
  socket: AuthenticatedWS,
  sessionId: string,
  providerConfig: Parameters<typeof GeminiLiveProvider.createSession>[1],
  callbacks: Parameters<typeof GeminiLiveProvider.createSession>[2],
  attempt = 1
): Promise<void> {
  const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt - 1);
  await new Promise((r) => setTimeout(r, delay));

  try {
    log.info('Reconnecting Gemini Live session', { sessionId, attempt });
    const newSession = await GeminiLiveProvider.createSession(sessionId, providerConfig, callbacks);
    activeSessions.set(sessionId, newSession);
    send(socket, 'session_reconnected', { sessionId });
    log.info('Gemini Live session reconnected', { sessionId, attempt });
  } catch (err) {
    log.error('Reconnect attempt failed', { err, sessionId, attempt });
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      await attemptReconnect(socket, sessionId, providerConfig, callbacks, attempt + 1);
    } else {
      log.error('All reconnect attempts exhausted', { sessionId });
      send(socket, 'error', { message: 'Connection to AI lost. Please start a new session.', sessionId });
      activeSessions.delete(sessionId);
    }
  }
}

export const sessionHandler = {
  async handle(socket: AuthenticatedWS, msg: WSMessage): Promise<void> {
    const { type, payload, sessionId } = msg;

    switch (type) {
      case 'session_start':
        await this.startSession(socket, payload as WSSessionStartPayload);
        break;

      case 'session_end':
        if (sessionId) await this.endSession(socket, sessionId);
        break;

      case 'audio_chunk':
        if (sessionId) await this.handleAudioChunk(socket, sessionId, payload as WSAudioChunk);
        break;

      case 'audio_stream_end':
        if (sessionId) await this.handleAudioStreamEnd(socket, sessionId);
        break;

      case 'text_input':
        if (sessionId) await this.handleTextInput(socket, sessionId, (payload as { text: string }).text);
        break;

      case 'interruption':
        if (sessionId) await this.handleInterruption(socket, sessionId);
        break;

      default:
        send(socket, 'error', { message: `Unknown event type: ${type}` });
    }
  },

  // ─── Start Session ──────────────────────────────────────────────────────────

  async startSession(socket: AuthenticatedWS, payload: WSSessionStartPayload): Promise<void> {
    const userId = socket.userId!;
    const sessionId = uuidv4();

    try {
      const profile = await ProfileRepository.findByUserId(userId);
      const field = profile?.field ?? 'General';

      const context = await tutorOrchestrator.initContext(
        sessionId,
        userId,
        payload.topic,
        field,
        (payload.mode as TutoringMode) ?? 'explain',
        profile ?? {},
        payload.sourceContext,
      );

      const systemPrompt = tutorOrchestrator.buildSystemPrompt(context);

      const providerConfig = {
        model: 'gemini-3.1-flash-live-preview',
        systemInstruction: systemPrompt,
        responseModality: 'audio' as const,
        voiceConfig: { voiceName: 'Aoede' },
      };

      const streamCallbacks = {
        onAudioChunk: (data: string, mimeType: string) => {
          send(socket, 'ai_audio_chunk', { data, mimeType, sessionId });
        },

        onTextToken: (token: string) => {
          send(socket, 'ai_token', { token, sessionId });
          StreamBuffer.append(sessionId, token).catch(() => {});
        },

        onInputTranscript: (text: string) => {
          send(socket, 'partial_transcript', { text, role: 'user', sessionId });
          MessageRepository.create({
            session_id: sessionId,
            role: 'user',
            content: text,
            content_type: 'audio_transcript',
          }).catch((err) => log.error('Failed to persist user message', { err }));
          ContextStore.appendMessage(sessionId, 'user', text).catch(() => {});
        },

        onOutputTranscript: async (text: string) => {
          send(socket, 'final_transcript', { text, role: 'assistant', sessionId });
          MessageRepository.create({
            session_id: sessionId,
            role: 'assistant',
            content: text,
            content_type: 'audio_transcript',
          }).catch((err) => log.error('Failed to persist AI message', { err }));
          await ContextStore.appendMessage(sessionId, 'assistant', text);
          await SessionRepository.incrementMessageCount(sessionId);
        },

        onInterrupted: () => {
          send(socket, 'interruption', { sessionId, source: 'ai' });
          StreamBuffer.clear(sessionId).catch(() => {});
          log.debug('AI interrupted', { sessionId });
        },

        onTurnComplete: () => {
          send(socket, 'ai_turn_complete', { sessionId });
        },

        onError: (err: Error) => {
          log.error('AI provider error', { err, sessionId });
          send(socket, 'error', { message: 'AI error: ' + err.message, sessionId });
        },

        onUnexpectedClose: () => {
          log.warn('Gemini Live session dropped unexpectedly, reconnecting', { sessionId });
          send(socket, 'session_reconnecting', { sessionId });
          attemptReconnect(socket, sessionId, providerConfig, streamCallbacks).catch(() => {});
        },
      };

      const geminiSession = await GeminiLiveProvider.createSession(
        sessionId,
        providerConfig,
        streamCallbacks,
      );

      activeSessions.set(sessionId, geminiSession);
      socket.sessionId = sessionId;

      await SessionRepository.create({
        id: sessionId,
        user_id: userId,
        topic: payload.topic,
        field,
        source_material: payload.sourceContext,
        status: 'active',
        mode: context.mode,
      });

      await SessionStore.setActive(sessionId, userId, {
        topic: payload.topic,
        field,
        mode: context.mode,
      });

      log.info('Session started', { sessionId, userId, topic: payload.topic });

      send(socket, 'session_start', {
        sessionId,
        topic: payload.topic,
        field,
        mode: context.mode,
      });

      const learnerLabel = profile?.learner_type
        ? profile.learner_type.replace('_', ' ')
        : 'learner';

      geminiSession.sendText(
        `Hello! I'm Lexi, your Palnect tutor. Today we're working on "${payload.topic}"${field !== 'General' ? ` in ${field}` : ''}. As a ${learnerLabel}, I'll tailor things just right for you. Ready to dive in?`
      );
    } catch (err) {
      log.error('Failed to start session', { err, userId });
      send(socket, 'error', { message: 'Failed to start tutoring session' });
    }
  },

  // ─── End Session ────────────────────────────────────────────────────────────

  async endSession(socket: AuthenticatedWS, sessionId: string): Promise<void> {
    const userId = socket.userId!;
    await this.cleanupSession(sessionId, userId);
    send(socket, 'session_end', { sessionId });
    socket.sessionId = undefined;
  },

  // ─── Audio Chunk ────────────────────────────────────────────────────────────

  async handleAudioChunk(
    socket: AuthenticatedWS,
    sessionId: string,
    chunk: WSAudioChunk
  ): Promise<void> {
    const gemini = activeSessions.get(sessionId);
    if (!gemini || gemini.isClosed) {
      send(socket, 'error', { message: 'No active AI session', sessionId });
      return;
    }
    gemini.sendAudio(chunk.data, chunk.mimeType ?? 'audio/pcm;rate=16000');
  },

  // ─── Audio Stream End ───────────────────────────────────────────────────────

  async handleAudioStreamEnd(_socket: AuthenticatedWS, sessionId: string): Promise<void> {
    const gemini = activeSessions.get(sessionId);
    if (!gemini || gemini.isClosed) return;
    gemini.sendAudioStreamEnd();
  },

  // ─── Text Input ─────────────────────────────────────────────────────────────

  async handleTextInput(
    socket: AuthenticatedWS,
    sessionId: string,
    text: string
  ): Promise<void> {
    if (!text?.trim()) return;

    const gemini = activeSessions.get(sessionId);
    if (!gemini || gemini.isClosed) {
      send(socket, 'error', { message: 'No active AI session', sessionId });
      return;
    }

    try {
      const decision = await tutorOrchestrator.analyzeAndDecide(sessionId, text);

      if (decision.shouldAdapt) {
        send(socket, 'mode_change', { mode: decision.mode, reason: decision.reason, sessionId });
        log.info('Orchestrator adapted mode', { sessionId, mode: decision.mode, reason: decision.reason });
      }

      if (tutorOrchestrator.detectConfusion(text)) {
        send(socket, 'confusion_detected', { sessionId, input: text });
      }

      gemini.sendText(text);
    } catch (err) {
      log.error('Text input error', { err, sessionId });
      send(socket, 'error', { message: 'Failed to process text input' });
    }
  },

  // ─── Interruption ───────────────────────────────────────────────────────────

  async handleInterruption(socket: AuthenticatedWS, sessionId: string): Promise<void> {
    await InterruptionStore.signal(sessionId);
    await StreamBuffer.clear(sessionId);
    send(socket, 'interruption', { sessionId, source: 'user', acknowledged: true });
    log.debug('User interruption handled', { sessionId });
  },

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  async onDisconnect(socket: AuthenticatedWS): Promise<void> {
    const { userId, sessionId } = socket;
    if (userId && sessionId) {
      await this.cleanupSession(sessionId, userId);
    }
  },

  // ─── Cleanup ─────────────────────────────────────────────────────────────────

  async cleanupSession(sessionId: string, userId: string): Promise<void> {
    try {
      const gemini = activeSessions.get(sessionId);
      if (gemini) {
        gemini.close();
        activeSessions.delete(sessionId);
      }

      const buffered = await StreamBuffer.flush(sessionId);
      if (buffered) {
        await MessageRepository.create({
          session_id: sessionId,
          role: 'assistant',
          content: buffered,
          content_type: 'text',
        });
      }

      await SessionRepository.end(sessionId);
      await ProfileRepository.updateStreak(userId);
      await SessionStore.remove(sessionId, userId);

      log.info('Session cleaned up', { sessionId, userId });
    } catch (err) {
      log.error('Session cleanup error', { err, sessionId });
    }
  },
};
