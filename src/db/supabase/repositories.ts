import { getSupabaseAdmin } from './client';
import {
  User,
  LearningProfile,
  TutoringSession,
  SessionMessage,
  StudyPlan,
  WeakTopic,
  SessionAnalysis,
} from '../../types';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('supabase:repo');

// ─── Users ────────────────────────────────────────────────────────────────────

export const UserRepository = {
  async create(data: Omit<User, 'id' | 'created_at' | 'updated_at'> & { password_hash?: string }): Promise<User> {
    const db = getSupabaseAdmin();
    const { data: user, error } = await db
      .from('users')
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(`Create user failed: ${error.message}`);
    return user;
  },

  async findById(id: string): Promise<User | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async findByEmail(email: string): Promise<(User & { password_hash?: string }) | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    if (error) return null;
    return data;
  },

  async findByGoogleId(googleId: string): Promise<User | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('google_id', googleId)
      .single();
    if (error) return null;
    return data;
  },

  async update(id: string, data: Partial<User>): Promise<User> {
    const db = getSupabaseAdmin();
    const { data: user, error } = await db
      .from('users')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`Update user failed: ${error.message}`);
    return user;
  },
};

// ─── Learning Profiles ────────────────────────────────────────────────────────

export const ProfileRepository = {
  async create(userId: string, data: Partial<LearningProfile>): Promise<LearningProfile> {
    const db = getSupabaseAdmin();
    const { data: profile, error } = await db
      .from('learning_profiles')
      .insert({ user_id: userId, ...data })
      .select()
      .single();
    if (error) throw new Error(`Create profile failed: ${error.message}`);
    return profile;
  },

  async findByUserId(userId: string): Promise<LearningProfile | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('learning_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  },

  async update(userId: string, data: Partial<LearningProfile>): Promise<LearningProfile> {
    const db = getSupabaseAdmin();
    const { data: profile, error } = await db
      .from('learning_profiles')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`Update profile failed: ${error.message}`);
    return profile;
  },

  async addWeakTopic(userId: string, topic: WeakTopic): Promise<void> {
    const db = getSupabaseAdmin();
    const profile = await this.findByUserId(userId);
    if (!profile) return;

    const existing = profile.weak_topics || [];
    const idx = existing.findIndex(
      (t) => t.topic === topic.topic && t.subject === topic.subject
    );
    if (idx !== -1) {
      existing[idx] = topic;
    } else {
      existing.push(topic);
    }
    await this.update(userId, { weak_topics: existing });
  },

  async incrementStats(userId: string, minutesAdded: number): Promise<void> {
    const db = getSupabaseAdmin();
    await db.rpc('increment_learning_stats', {
      p_user_id: userId,
      p_minutes: minutesAdded,
    });
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const SessionRepository = {
  async create(data: Omit<TutoringSession, 'id' | 'started_at' | 'messages_count'>): Promise<TutoringSession> {
    const db = getSupabaseAdmin();
    const { data: session, error } = await db
      .from('tutoring_sessions')
      .insert({ ...data, started_at: new Date().toISOString(), messages_count: 0 })
      .select()
      .single();
    if (error) throw new Error(`Create session failed: ${error.message}`);
    return session;
  },

  async findById(id: string): Promise<TutoringSession | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('tutoring_sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async findByUserId(userId: string, limit = 10): Promise<TutoringSession[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('tutoring_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return data;
  },

  async end(id: string, summary?: string): Promise<TutoringSession> {
    const db = getSupabaseAdmin();
    const endedAt = new Date().toISOString();
    const { data: session, error } = await db
      .from('tutoring_sessions')
      .update({ status: 'ended', ended_at: endedAt, summary })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(`End session failed: ${error.message}`);
    return session;
  },

  async updateStatus(id: string, status: TutoringSession['status']): Promise<void> {
    const db = getSupabaseAdmin();
    await db.from('tutoring_sessions').update({ status }).eq('id', id);
  },

  async incrementMessageCount(id: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db.rpc('increment_message_count', { p_session_id: id });
  },
};

// ─── Messages ─────────────────────────────────────────────────────────────────

export const MessageRepository = {
  async create(data: Omit<SessionMessage, 'id' | 'timestamp'>): Promise<SessionMessage> {
    const db = getSupabaseAdmin();
    const { data: msg, error } = await db
      .from('session_messages')
      .insert({ ...data, timestamp: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(`Create message failed: ${error.message}`);
    return msg;
  },

  async findBySessionId(sessionId: string): Promise<SessionMessage[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('session_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: true });
    if (error) return [];
    return data;
  },
};

// ─── Session Analysis ─────────────────────────────────────────────────────────

export const AnalysisRepository = {
  async save(analysis: Omit<SessionAnalysis, 'id'>): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db.from('session_analyses').insert(analysis);
    if (error) log.error('Failed to save analysis', { error: error.message });
  },

  async findByUserId(userId: string): Promise<SessionAnalysis[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('session_analyses')
      .select('*')
      .eq('userId', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data;
  },
};

// ─── Study Plans ──────────────────────────────────────────────────────────────

export const StudyPlanRepository = {
  async save(plan: Omit<StudyPlan, 'id' | 'created_at'>): Promise<StudyPlan> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('study_plans')
      .insert({ ...plan, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(`Save study plan failed: ${error.message}`);
    return data;
  },

  async findLatestByUserId(userId: string): Promise<StudyPlan | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('study_plans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data;
  },
};