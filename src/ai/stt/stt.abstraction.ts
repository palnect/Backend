/**
 * STT (Speech-to-Text) Abstraction Layer
 *
 * For Palnect, STT is handled natively by Gemini Live's built-in
 * inputAudioTranscription feature, which provides zero-latency in-stream
 * transcription without a separate STT call.
 *
 * This abstraction exists to support future providers (Deepgram, Assembly AI, etc.)
 * or fallback scenarios where Gemini Live is not available.
 */

export interface STTProvider {
  name: string;
  /**
   * Transcribe a complete audio buffer
   */
  transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>;
  /**
   * Stream transcription — calls onTranscript as partial results arrive
   */
  streamTranscribe(
    onTranscript: (text: string, isFinal: boolean) => void
  ): STTStreamSession;
}

export interface STTStreamSession {
  sendChunk(data: Buffer): void;
  end(): Promise<string>;
  abort(): void;
}

/**
 * Gemini-native STT — uses Live API's built-in transcription.
 * Partial transcripts flow through the WS session handler's onInputTranscript callback.
 * This provider is a no-op since Gemini handles it inline.
 */
export const GeminiNativeSTT: STTProvider = {
  name: 'gemini-native',

  async transcribe(_audioBuffer: Buffer, _mimeType: string): Promise<string> {
    // Handled by Gemini Live API internally
    throw new Error('Use GeminiLiveProvider for streaming STT');
  },

  streamTranscribe(onTranscript: (text: string, isFinal: boolean) => void): STTStreamSession {
    // Handled by Gemini Live API's onInputTranscript callback
    let buffer = Buffer.alloc(0);
    return {
      sendChunk(data: Buffer) { buffer = Buffer.concat([buffer, data]); },
      async end() { return ''; },
      abort() { buffer = Buffer.alloc(0); },
    };
  },
};

// Active STT provider — swap here to change providers
export const activeSTTProvider: STTProvider = GeminiNativeSTT;