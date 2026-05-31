import { WebSocket } from 'ws';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url?: string;
  provider: 'email' | 'google';
  created_at: string;
  updated_at: string;
}

export interface LearningProfile {
  id: string;
  user_id: string;
  subjects: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  learning_style: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  goals: string[];
  weak_topics: WeakTopic[];
  total_sessions: number;
  total_minutes: number;
  streak_days: number;
  created_at: string;
  updated_at: string;
}

export interface WeakTopic {
  topic: string;
  subject: string;
  score: number;
  last_tested: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface TutoringSession {
  id: string;
  user_id: string;
  subject: string;
  topic: string;
  status: 'active' | 'paused' | 'ended';
  mode: TutoringMode;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  messages_count: number;
  summary?: string;
}

export type TutoringMode =
  | 'explain'
  | 'quiz'
  | 'simplify'
  | 'motivate'
  | 'practice'
  | 'review';

export interface SessionMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  content_type: 'text' | 'audio_transcript';
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WSEventType =
  | 'auth'
  | 'auth_success'
  | 'auth_error'
  | 'session_start'
  | 'session_end'
  | 'audio_chunk'
  | 'audio_stream_end'
  | 'text_input'
  | 'ai_token'
  | 'ai_audio_chunk'
  | 'ai_turn_complete'
  | 'partial_transcript'
  | 'final_transcript'
  | 'interruption'
  | 'mode_change'
  | 'confusion_detected'
  | 'error'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSEventType;
  sessionId?: string;
  payload?: unknown;
  timestamp?: number;
}

export interface WSAudioChunk {
  data: string; // base64
  mimeType: string;
  chunkIndex: number;
}

export interface WSAuthPayload {
  token: string;
}

export interface WSSessionStartPayload {
  subject: string;
  topic: string;
  mode?: TutoringMode;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface ConversationContext {
  sessionId: string;
  userId: string;
  subject: string;
  topic: string;
  mode: TutoringMode;
  messages: ContextMessage[];
  profile: Partial<LearningProfile>;
  confusionScore: number;
  engagementScore: number;
  lastModeChange: number;
}

export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface OrchestratorDecision {
  mode: TutoringMode;
  systemPrompt: string;
  shouldAdapt: boolean;
  reason?: string;
}

// ─── AI Provider ──────────────────────────────────────────────────────────────

export interface AIProviderConfig {
  model: string;
  systemInstruction: string;
  responseModality: 'audio' | 'text';
  voiceConfig?: {
    voiceName: string;
  };
}

export interface AIStreamCallbacks {
  onAudioChunk?: (data: string, mimeType: string) => void;
  onTextToken?: (token: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
  onInterrupted?: () => void;
  onTurnComplete?: () => void;
  onError?: (error: Error) => void;
}

// ─── Authenticated WebSocket ───────────────────────────────────────────────────

export interface AuthenticatedWS extends WebSocket {
  userId?: string;
  sessionId?: string;
  isAuthenticated?: boolean;
  heartbeatInterval?: ReturnType<typeof setInterval>;
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface OnboardingData {
  subjects: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  goals: string[];
  availableHoursPerWeek: number;
}

export interface StudyPlan {
  id: string;
  user_id: string;
  weeks: StudyWeek[];
  created_at: string;
}

export interface StudyWeek {
  week: number;
  topics: StudyTopic[];
}

export interface StudyTopic {
  subject: string;
  topic: string;
  estimatedMinutes: number;
  priority: 'high' | 'medium' | 'low';
}

export interface SessionAnalysis {
  sessionId: string;
  userId: string;
  duration: number;
  topicsCovered: string[];
  comprehensionScore: number;
  engagementScore: number;
  weakAreasIdentified: string[];
  recommendations: string[];
  moodDetected: 'confident' | 'confused' | 'bored' | 'engaged' | 'frustrated';
}