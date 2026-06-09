import { getSupabaseAdmin } from './client';
import {
  User,
  LearningProfile,
  TutoringSession,
  SessionMessage,
  WeakTopic,
  SessionAnalysis,
  LearningGoal,
  DocumentSession,
  DocumentSectionProgress,
  DocSection,
  SectionStatus,
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
      (t) => t.topic === topic.topic && t.field === topic.field
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

  async updateStreak(userId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const profile = await this.findByUserId(userId);
    if (!profile) return;

    const today = new Date().toISOString().split('T')[0];
    const last = profile.last_session_date;

    if (last === today) return; // already counted today

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = last === yesterday ? (profile.streak_days || 0) + 1 : 1;
    const longestStreak = Math.max(profile.longest_streak || 0, newStreak);

    await this.update(userId, {
      streak_days: newStreak,
      longest_streak: longestStreak,
      last_session_date: today,
    } as Partial<LearningProfile>);
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const SessionRepository = {
  async create(data: Omit<TutoringSession, 'id' | 'started_at' | 'messages_count'> & { id?: string }): Promise<TutoringSession> {
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

  async findByUserId(userId: string, limit = 20): Promise<TutoringSession[]> {
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

  async findByUserIdAndDate(userId: string, date: string): Promise<TutoringSession[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('tutoring_sessions')
      .select('id, user_id, topic, field, mode, status, started_at, ended_at, duration_seconds, messages_count')
      .eq('user_id', userId)
      .gte('started_at', `${date}T00:00:00.000Z`)
      .lt('started_at', `${date}T23:59:59.999Z`)
      .order('started_at', { ascending: true });
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

  async findBySessionId(sessionId: string): Promise<SessionAnalysis | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('session_analyses')
      .select('*')
      .eq('sessionId', sessionId)
      .single();
    if (error) return null;
    return data;
  },
};

// ─── Learning Goals ───────────────────────────────────────────────────────────

export const GoalRepository = {
  async create(data: Omit<LearningGoal, 'id' | 'created_at'>): Promise<LearningGoal> {
    const db = getSupabaseAdmin();
    const { data: goal, error } = await db
      .from('learning_goals')
      .insert({ ...data, created_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw new Error(`Create goal failed: ${error.message}`);
    return goal;
  },

  async findByUserId(userId: string, date?: string): Promise<LearningGoal[]> {
    const db = getSupabaseAdmin();
    let query = db
      .from('learning_goals')
      .select('*')
      .eq('user_id', userId)
      .order('scheduled_date', { ascending: true });

    if (date) {
      query = query.eq('scheduled_date', date);
    }

    const { data, error } = await query;
    if (error) return [];
    return data;
  },

  async update(id: string, userId: string, data: Partial<LearningGoal>): Promise<LearningGoal> {
    const db = getSupabaseAdmin();
    const { data: goal, error } = await db
      .from('learning_goals')
      .update(data)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw new Error(`Update goal failed: ${error.message}`);
    return goal;
  },

  async delete(id: string, userId: string): Promise<void> {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from('learning_goals')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new Error(`Delete goal failed: ${error.message}`);
  },
};

// ─── Document Sessions ────────────────────────────────────────────────────────

export const DocumentSessionRepository = {
  async create(data: {
    session_id: string;
    user_id: string;
    file_name: string;
    file_type: 'pdf' | 'docx' | 'txt';
    total_sections: number;
    total_pages: number;
    sections?: DocSection[];
  }): Promise<DocumentSession> {
    const db = getSupabaseAdmin();
    const { data: doc, error } = await db
      .from('document_sessions')
      .insert({
        session_id: data.session_id,
        user_id: data.user_id,
        file_name: data.file_name,
        file_type: data.file_type,
        total_sections: data.total_sections,
        total_pages: data.total_pages,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw new Error(`Create document session failed: ${error.message}`);
    return doc;
  },

  async findBySessionId(sessionId: string): Promise<DocumentSession | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('document_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) return null;
    return data;
  },

  async findRecentByUserAndFile(
    userId: string,
    fileName: string,
    topic: string
  ): Promise<(DocumentSession & { topic: string }) | null> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('document_sessions')
      .select('*, tutoring_sessions!inner(topic, status)')
      .eq('user_id', userId)
      .eq('file_name', fileName)
      .eq('tutoring_sessions.topic', topic)
      .eq('tutoring_sessions.status', 'ended')
      .not('resume_section_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error) return null;
    return data as (DocumentSession & { topic: string });
  },

  async updateResume(sessionId: string, sectionId: string, page: number): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('document_sessions')
      .update({ resume_section_id: sectionId, resume_page: page, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  },

  async linkGoal(sessionId: string, goalId: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('document_sessions')
      .update({ linked_goal_id: goalId, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
  },

  async updateSectionCounts(sessionId: string, total: number, done: number): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('document_sessions')
      .update({ total_sections: total, updated_at: new Date().toISOString() })
      .eq('session_id', sessionId);
    // update linked goal's done count if exists
    const doc = await this.findBySessionId(sessionId);
    if (doc?.linked_goal_id) {
      const dbClient = getSupabaseAdmin();
      await dbClient
        .from('learning_goals')
        .update({ doc_sections_done: done })
        .eq('id', doc.linked_goal_id);
    }
  },
};

// ─── Section Progress ─────────────────────────────────────────────────────────

export const SectionProgressRepository = {
  async upsert(data: {
    session_id: string;
    user_id: string;
    section_id: string;
    section_title?: string;
    page: number;
    status: SectionStatus;
  }): Promise<void> {
    const db = getSupabaseAdmin();
    const now = new Date().toISOString();
    await db.from('document_section_progress').upsert(
      {
        ...data,
        started_at: data.status === 'in_progress' ? now : undefined,
        completed_at: data.status === 'done' ? now : undefined,
      },
      { onConflict: 'session_id,section_id' }
    );
  },

  async markInProgress(sessionId: string, sectionId: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('document_section_progress')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('section_id', sectionId);
  },

  async markDone(sessionId: string, sectionId: string): Promise<void> {
    const db = getSupabaseAdmin();
    await db
      .from('document_section_progress')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('section_id', sectionId);
  },

  async getDoneCount(sessionId: string): Promise<number> {
    const db = getSupabaseAdmin();
    const { count, error } = await db
      .from('document_section_progress')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('status', 'done');
    if (error) return 0;
    return count ?? 0;
  },

  async findBySessionId(sessionId: string): Promise<DocumentSectionProgress[]> {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('document_section_progress')
      .select('*')
      .eq('session_id', sessionId)
      .order('page', { ascending: true });
    if (error) return [];
    return data;
  },
};
