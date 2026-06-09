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
  first_name: string;
  last_name: string;
  avatar_url?: string;
  provider: 'email' | 'google';
  created_at: string;
  updated_at: string;
}

export type LearnerType =
  | 'pupil'
  | 'high_school'
  | 'undergraduate'
  | 'msc'
  | 'phd'
  | 'professional'
  | 'self_learner'
  | 'other';

export interface LearningProfile {
  id: string;
  user_id: string;
  learner_type: LearnerType;
  field: string;
  learning_style: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  goals: string[];
  available_hours_per_day: number;
  weak_topics: WeakTopic[];
  total_sessions: number;
  total_minutes: number;
  streak_days: number;
  longest_streak: number;
  last_session_date: string | null;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WeakTopic {
  topic: string;
  field: string;
  score: number;
  last_tested: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export interface TutoringSession {
  id: string;
  user_id: string;
  topic: string;
  field: string;
  source_material?: string;
  status: 'active' | 'paused' | 'ended';
  mode: TutoringMode;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  messages_count: number;
  summary?: string;
}

export interface LearningGoal {
  id: string;
  user_id: string;
  title: string;
  field?: string;
  scheduled_date?: string;
  completed_at?: string;
  linked_session_id?: string;
  created_at: string;
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
  topic: string;
  mode?: TutoringMode;
  sourceContext?: string;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export interface ConversationContext {
  sessionId: string;
  userId: string;
  topic: string;
  field: string;
  sourceMaterial?: string;
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
  onUnexpectedClose?: () => void;
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
  learnerType: LearnerType;
  field: string;
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  goals: string[];
  availableHoursPerDay: number;
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