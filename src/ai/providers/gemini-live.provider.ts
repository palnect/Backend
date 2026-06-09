import { GoogleGenAI, Modality } from '@google/genai';
import { config } from '../../config';
import { AIProviderConfig, AIStreamCallbacks } from '../../types';
import { createChildLogger } from '../../utils/logger';
import { InterruptionStore } from '../../db/redis/session-store';

const log = createChildLogger('ai:gemini-live');

export type GeminiSession = Awaited<ReturnType<typeof createGeminiSession>>;

/**
 * Creates a persistent Gemini Live API session for a tutoring conversation.
 * Uses gemini-3.1-flash-live-preview for lowest latency realtime dialogue.
 */
export const createGeminiSession = async (
  sessionId: string,
  providerConfig: AIProviderConfig,
  callbacks: AIStreamCallbacks
) => {
  const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

  let isInterrupted = false;
  let isClosed = false;

  const liveSession = await ai.live.connect({
    model: config.gemini.model,
    config: {
      responseModalities: [providerConfig.responseModality === 'audio' ? Modality.AUDIO : Modality.TEXT],
      systemInstruction: {
        parts: [{ text: providerConfig.systemInstruction }],
      },
      ...(providerConfig.responseModality === 'audio' && {
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: providerConfig.voiceConfig?.voiceName ?? 'Aoede',
            },
          },
        },
      }),
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // Minimal thinking level for lowest latency
      thinkingConfig: { thinkingBudget: 0 },
    },
    callbacks: {
      onopen: () => {
        log.debug('Gemini Live session opened', { sessionId });
      },

      onmessage: async (response) => {
        if (isClosed) return;

        try {
          const content = response.serverContent;
          if (!content) return;

          // Check for interruption signal from Redis (client-side interrupt)
          const interrupted = await InterruptionStore.check(sessionId);
          if (interrupted) {
            isInterrupted = true;
            await InterruptionStore.clear(sessionId);
            callbacks.onInterrupted?.();
            return;
          }

          // Handle Gemini-native interruption (VAD detected)
          if (content.interrupted) {
            log.debug('Gemini VAD interruption detected', { sessionId });
            callbacks.onInterrupted?.();
            return;
          }

          // Process all content parts in a single event (can contain multiple)
          if (content.modelTurn?.parts) {
            for (const part of content.modelTurn.parts) {
              if (isInterrupted) break;

              // Audio output
              if (part.inlineData?.data && part.inlineData?.mimeType) {
                callbacks.onAudioChunk?.(part.inlineData.data, part.inlineData.mimeType);
              }

              // Text token
              if (part.text) {
                callbacks.onTextToken?.(part.text);
              }
            }
          }

          // Input transcription (user speech → text)
          if (content.inputTranscription?.text) {
            callbacks.onInputTranscript?.(content.inputTranscription.text);
          }

          // Output transcription (AI speech → text)
          if (content.outputTranscription?.text) {
            callbacks.onOutputTranscript?.(content.outputTranscription.text);
          }

          // Turn complete
          if (content.turnComplete) {
            isInterrupted = false;
            callbacks.onTurnComplete?.();
          }
        } catch (err) {
          log.error('Error processing Gemini message', { err, sessionId });
          callbacks.onError?.(err as Error);
        }
      },

      onerror: (error) => {
        log.error('Gemini Live session error', { error, sessionId });
        callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      },

      onclose: () => {
        const wasIntentional = isClosed;
        isClosed = true;
        log.debug('Gemini Live session closed', { sessionId });
        if (!wasIntentional) {
          callbacks.onUnexpectedClose?.();
        }
      },
    },
  });

  return {
    /**
     * Send audio chunk from user (raw PCM base64, 16kHz)
     */
    sendAudio: (data: string, mimeType = 'audio/pcm;rate=16000') => {
      if (isClosed) return;
      liveSession.sendRealtimeInput({ audio: { data, mimeType } });
    },

    /**
     * Send text input from user
     */
    sendText: (text: string) => {
      if (isClosed) return;
      liveSession.sendRealtimeInput({ text });
    },

    /**
     * Signal end of audio stream (flushes VAD buffer)
     */
    sendAudioStreamEnd: () => {
      if (isClosed) return;
      liveSession.sendRealtimeInput({ audioStreamEnd: true });
    },

    /**
     * Close the Gemini session
     */
    close: () => {
      if (!isClosed) {
        isClosed = true;
        try {
          liveSession.close();
        } catch {
          // Already closed
        }
      }
    },

    get isClosed() {
      return isClosed;
    },
  };
};

/**
 * Provider abstraction — swap Gemini for any future AI provider here
 */
export interface AIProvider {
  createSession: (
    sessionId: string,
    providerConfig: AIProviderConfig,
    callbacks: AIStreamCallbacks
  ) => Promise<GeminiSession>;
}

export const GeminiLiveProvider: AIProvider = {
  createSession: createGeminiSession,
};