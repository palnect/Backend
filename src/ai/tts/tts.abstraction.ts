/**
 * TTS (Text-to-Speech) Abstraction Layer
 *
 * For Palnect, TTS is handled natively by Gemini Live's audio response modality.
 * The model speaks its responses directly as PCM audio chunks (24kHz, 16-bit mono)
 * streamed through the WS session handler's onAudioChunk callback.
 *
 * This abstraction supports future providers (ElevenLabs, Azure TTS, etc.)
 * for scenarios where text-only AI responses need external TTS synthesis.
 */

export interface TTSProvider {
  name: string;
  /**
   * Synthesize text to audio buffer
   */
  synthesize(text: string, voiceId?: string): Promise<Buffer>;
  /**
   * Stream synthesis — calls onAudioChunk as audio data arrives
   */
  streamSynthesize(
    text: string,
    onAudioChunk: (data: Buffer, mimeType: string) => void,
    voiceId?: string
  ): Promise<void>;
}

/**
 * Gemini-native TTS — uses Live API's audio response modality.
 * Audio streams through onAudioChunk callback in GeminiLiveProvider.
 * This provider is a no-op since Gemini handles TTS inline.
 */
export const GeminiNativeTTS: TTSProvider = {
  name: 'gemini-native',

  async synthesize(_text: string, _voiceId?: string): Promise<Buffer> {
    throw new Error('Use GeminiLiveProvider with responseModality=audio for streaming TTS');
  },

  async streamSynthesize(
    _text: string,
    _onAudioChunk: (data: Buffer, mimeType: string) => void,
    _voiceId?: string
  ): Promise<void> {
    throw new Error('Use GeminiLiveProvider for streaming TTS');
  },
};

// Available voices for Gemini Live
export const GEMINI_VOICES = [
  { id: 'Aoede', description: 'Warm, natural female voice (default)' },
  { id: 'Charon', description: 'Deep, calm male voice' },
  { id: 'Fenrir', description: 'Energetic male voice' },
  { id: 'Kore', description: 'Clear, professional female voice' },
  { id: 'Puck', description: 'Friendly, upbeat voice' },
] as const;

export type GeminiVoiceName = (typeof GEMINI_VOICES)[number]['id'];

// Active TTS provider
export const activeTTSProvider: TTSProvider = GeminiNativeTTS;