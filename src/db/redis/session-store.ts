import { getRedisClient } from './client';
import { ConversationContext, TutoringMode, DocSection } from '../../types';
import { config } from '../../config';
import { createChildLogger } from '../../utils/logger';

const log = createChildLogger('redis:session');

const KEYS = {
  session: (id: string) => `session:${id}`,
  context: (sessionId: string) => `context:${sessionId}`,
  userSession: (userId: string) => `user:${userId}:active_session`,
  authCache: (userId: string) => `auth:${userId}`,
  streamBuffer: (sessionId: string) => `stream:${sessionId}:buffer`,
  interruption: (sessionId: string) => `interrupt:${sessionId}`,
  userProfile: (userId: string) => `profile:${userId}`,
  otp: (email: string) => `otp:${email}`,
  docSections: (sessionId: string) => `doc:${sessionId}:sections`,
  docResume: (sessionId: string) => `doc:${sessionId}:resume`,
};

// ─── Session State ────────────────────────────────────────────────────────────

export const SessionStore = {
  async setActive(sessionId: string, userId: string, meta: Record<string, string>): Promise<void> {
    const redis = getRedisClient();
    const key = KEYS.session(sessionId);
    await redis.hset(key, { sessionId, userId, ...meta, startedAt: Date.now().toString() });
    await redis.expire(key, config.session.ttlSeconds);
    await redis.set(KEYS.userSession(userId), sessionId, 'EX', config.session.ttlSeconds);
  },

  async get(sessionId: string): Promise<Record<string, string> | null> {
    const redis = getRedisClient();
    const data = await redis.hgetall(KEYS.session(sessionId));
    return Object.keys(data).length > 0 ? data : null;
  },

  async getActiveSessionForUser(userId: string): Promise<string | null> {
    return getRedisClient().get(KEYS.userSession(userId));
  },

  async remove(sessionId: string, userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(KEYS.session(sessionId));
    await redis.del(KEYS.userSession(userId));
    await redis.del(KEYS.context(sessionId));
    await redis.del(KEYS.streamBuffer(sessionId));
    await redis.del(KEYS.interruption(sessionId));
  },

  async refreshTTL(sessionId: string, userId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.expire(KEYS.session(sessionId), config.session.ttlSeconds);
    await redis.expire(KEYS.userSession(userId), config.session.ttlSeconds);
  },
};

// ─── Conversation Context ─────────────────────────────────────────────────────

export const ContextStore = {
  async set(context: ConversationContext): Promise<void> {
    const redis = getRedisClient();
    const key = KEYS.context(context.sessionId);
    // Keep only last 20 messages in Redis for hot context
    const trimmed = {
      ...context,
      messages: context.messages.slice(-20),
    };
    await redis.set(key, JSON.stringify(trimmed), 'EX', config.session.ttlSeconds);
  },

  async get(sessionId: string): Promise<ConversationContext | null> {
    const redis = getRedisClient();
    const raw = await redis.get(KEYS.context(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ConversationContext;
    } catch {
      return null;
    }
  },

  async appendMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const ctx = await this.get(sessionId);
    if (!ctx) return;
    ctx.messages.push({ role, content, timestamp: Date.now() });
    await this.set(ctx);
  },

  async updateMode(sessionId: string, mode: TutoringMode): Promise<void> {
    const ctx = await this.get(sessionId);
    if (!ctx) return;
    ctx.mode = mode;
    ctx.lastModeChange = Date.now();
    await this.set(ctx);
  },

  async updateScores(
    sessionId: string,
    confusionDelta: number,
    engagementDelta: number
  ): Promise<void> {
    const ctx = await this.get(sessionId);
    if (!ctx) return;
    ctx.confusionScore = Math.max(0, Math.min(1, ctx.confusionScore + confusionDelta));
    ctx.engagementScore = Math.max(0, Math.min(1, ctx.engagementScore + engagementDelta));
    await this.set(ctx);
  },
};

// ─── Stream Buffer ────────────────────────────────────────────────────────────

export const StreamBuffer = {
  async append(sessionId: string, token: string): Promise<void> {
    const redis = getRedisClient();
    await redis.append(KEYS.streamBuffer(sessionId), token);
    await redis.expire(KEYS.streamBuffer(sessionId), 60);
  },

  async flush(sessionId: string): Promise<string> {
    const redis = getRedisClient();
    const key = KEYS.streamBuffer(sessionId);
    const content = (await redis.get(key)) ?? '';
    await redis.del(key);
    return content;
  },

  async clear(sessionId: string): Promise<void> {
    await getRedisClient().del(KEYS.streamBuffer(sessionId));
  },
};

// ─── Interruption Signals ─────────────────────────────────────────────────────

export const InterruptionStore = {
  async signal(sessionId: string): Promise<void> {
    await getRedisClient().set(KEYS.interruption(sessionId), '1', 'EX', 5);
  },

  async check(sessionId: string): Promise<boolean> {
    const val = await getRedisClient().get(KEYS.interruption(sessionId));
    return val === '1';
  },

  async clear(sessionId: string): Promise<void> {
    await getRedisClient().del(KEYS.interruption(sessionId));
  },
};

// ─── Auth Cache ───────────────────────────────────────────────────────────────

export const AuthCache = {
  async setUser(userId: string, userData: Record<string, unknown>): Promise<void> {
    await getRedisClient().set(
      KEYS.authCache(userId),
      JSON.stringify(userData),
      'EX',
      config.redis.sessionTTL
    );
  },

  async getUser(userId: string): Promise<Record<string, unknown> | null> {
    const raw = await getRedisClient().get(KEYS.authCache(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async invalidate(userId: string): Promise<void> {
    await getRedisClient().del(KEYS.authCache(userId));
  },
};

// ─── Profile Cache ────────────────────────────────────────────────────────────

export const ProfileCache = {
  async set(userId: string, profile: unknown): Promise<void> {
    await getRedisClient().set(
      KEYS.userProfile(userId),
      JSON.stringify(profile),
      'EX',
      3600
    );
  },

  async get(userId: string): Promise<unknown | null> {
    const raw = await getRedisClient().get(KEYS.userProfile(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async invalidate(userId: string): Promise<void> {
    await getRedisClient().del(KEYS.userProfile(userId));
  },
};

// ─── Doc Section Store ────────────────────────────────────────────────────────

export const DocSectionStore = {
  async setSections(sessionId: string, sections: DocSection[]): Promise<void> {
    await getRedisClient().set(
      KEYS.docSections(sessionId),
      JSON.stringify(sections),
      'EX',
      config.session.ttlSeconds
    );
  },

  async getSections(sessionId: string): Promise<DocSection[] | null> {
    const raw = await getRedisClient().get(KEYS.docSections(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DocSection[];
    } catch {
      return null;
    }
  },

  async setCurrentSection(sessionId: string, sectionId: string, page: number): Promise<void> {
    await getRedisClient().set(
      KEYS.docResume(sessionId),
      JSON.stringify({ sectionId, page }),
      'EX',
      config.session.ttlSeconds
    );
  },

  async getCurrentSection(sessionId: string): Promise<{ sectionId: string; page: number } | null> {
    const raw = await getRedisClient().get(KEYS.docResume(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async remove(sessionId: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(KEYS.docSections(sessionId));
    await redis.del(KEYS.docResume(sessionId));
  },
};

// ─── OTP Store ────────────────────────────────────────────────────────────────

const OTP_TTL = 600; // 10 minutes

export const OtpStore = {
  async set(email: string, hashedOtp: string): Promise<void> {
    await getRedisClient().set(KEYS.otp(email), hashedOtp, 'EX', OTP_TTL);
  },

  async get(email: string): Promise<string | null> {
    return getRedisClient().get(KEYS.otp(email));
  },

  async delete(email: string): Promise<void> {
    await getRedisClient().del(KEYS.otp(email));
  },
};