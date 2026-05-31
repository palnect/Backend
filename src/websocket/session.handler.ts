import { WebSocket } from 'ws';
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
      // Load learner profile for personalization
      const profile = await ProfileRepository.findByUserId(userId);

      // Initialize orchestrator context
      const context = await tutorOrchestrator.initContext(
        sessionId,
        userId,
        payload.subject,
        payload.topic,
        (payload.mode as TutoringMode) ?? 'explain',
        profile ?? {}
      );

      // Build personalized system prompt
      const systemPrompt = tutorOrchestrator.buildSystemPrompt(context);

      // Create Gemini Live session
      const geminiSession = await GeminiLiveProvider.createSession(
        sessionId,
        {
          model: 'gemini-3.1-flash-live-preview',
          systemInstruction: systemPrompt,
          responseModality: 'audio',
          voiceConfig: { voiceName: 'Aoede' },
        },
        {
          onAudioChunk: (data, mimeType) => {
            send(socket, 'ai_audio_chunk', { data, mimeType, sessionId });
          },

          onTextToken: (token) => {
            send(socket, 'ai_token', { token, sessionId });
            StreamBuffer.append(sessionId, token).catch(() => {});
          },

          onInputTranscript: (text) => {
            send(socket, 'partial_transcript', { text, role: 'user', sessionId });
            // Persist user message
            MessageRepository.create({
              session_id: sessionId,
              role: 'user',
              content: text,
              content_type: 'audio_transcript',
            }).catch((err) => log.error('Failed to persist user message', { err }));

            // Append to context
            ContextStore.appendMessage(sessionId, 'user', text).catch(() => {});
          },

          onOutputTranscript: async (text) => {
            send(socket, 'final_transcript', { text, role: 'assistant', sessionId });

            // Persist AI message
            MessageRepository.create({
              session_id: sessionId,
              role: 'assistant',
              content: text,
              content_type: 'audio_transcript',
            }).catch((err) => log.error('Failed to persist AI message', { err }));

            // Append to context
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

          onError: (err) => {
            log.error('AI provider error', { err, sessionId });
            send(socket, 'error', { message: 'AI error: ' + err.message, sessionId });
          },
        }
      );

      // Register session
      activeSessions.set(sessionId, geminiSession);
      socket.sessionId = sessionId;

      // Persist to Supabase
      await SessionRepository.create({
        id: sessionId,
        user_id: userId,
        subject: payload.subject,
        topic: payload.topic,
        status: 'active',
        mode: context.mode,
      });

      // Cache in Redis
      await SessionStore.setActive(sessionId, userId, {
        subject: payload.subject,
        topic: payload.topic,
        mode: context.mode,
      });

      log.info('Session started', { sessionId, userId, subject: payload.subject });

      send(socket, 'session_start', {
        sessionId,
        subject: payload.subject,
        topic: payload.topic,
        mode: context.mode,
      });

      // Send a warm-up greeting from the AI
      geminiSession.sendText(
        `Hello! I'm your Palnect tutor. Today we're going to work on ${payload.topic} in ${payload.subject}. ${
          profile?.level ? `I know you're at a ${profile.level} level, so I'll pitch things just right.` : ''
        } Shall we get started?`
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

  async handleAudioStreamEnd(socket: AuthenticatedWS, sessionId: string): Promise<void> {
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
      // Analyze input and potentially adapt the teaching strategy
      const decision = await tutorOrchestrator.analyzeAndDecide(sessionId, text);

      if (decision.shouldAdapt) {
        send(socket, 'mode_change', { mode: decision.mode, reason: decision.reason, sessionId });
        log.info('Orchestrator adapted mode', {
          sessionId,
          mode: decision.mode,
          reason: decision.reason,
        });
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
    // Signal Redis so the Gemini callback stops processing
    await InterruptionStore.signal(sessionId);
    await StreamBuffer.clear(sessionId);

    // Notify client
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
      // Close Gemini session
      const gemini = activeSessions.get(sessionId);
      if (gemini) {
        gemini.close();
        activeSessions.delete(sessionId);
      }

      // Flush stream buffer and persist
      const buffered = await StreamBuffer.flush(sessionId);
      if (buffered) {
        await MessageRepository.create({
          session_id: sessionId,
          role: 'assistant',
          content: buffered,
          content_type: 'text',
        });
      }

      // End session in Supabase
      await SessionRepository.end(sessionId);

      // Clear Redis state
      await SessionStore.remove(sessionId, userId);

      log.info('Session cleaned up', { sessionId, userId });
    } catch (err) {
      log.error('Session cleanup error', { err, sessionId });
    }
  },
};