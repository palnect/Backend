import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { ProfileRepository } from '../db/supabase/repositories';
import { getSupabaseAdmin } from '../db/supabase/client';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:retention');

/**
 * RetentionAgent — Handles re-engagement and generates personalized reminders.
 * Identifies inactive users and creates targeted re-engagement messages.
 */
export const RetentionAgent = {
  /**
   * Find users who haven't logged a session in N days
   */
  async getInactiveUsers(inactiveDays = 3): Promise<Array<{ id: string; name: string; email: string }>> {
    const db = getSupabaseAdmin();
    const cutoff = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000).toISOString();

    // Users who haven't had a session since cutoff
    const { data, error } = await db
      .from('users')
      .select('id, name, email')
      .lt('last_session_at', cutoff)
      .not('last_session_at', 'is', null)
      .limit(100);

    if (error) {
      log.error('Failed to fetch inactive users', { error: error.message });
      return [];
    }

    return data ?? [];
  },

  /**
   * Generate a personalized re-engagement message for a user
   */
  async generateReEngagementMessage(userId: string, userName: string): Promise<string> {
    try {
      const profile = await ProfileRepository.findByUserId(userId);
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

      const weakAreas = profile?.weak_topics?.slice(0, 2).map((t) => t.topic).join(' and ') || '';
      const subjects = profile?.subjects?.join(', ') || 'your subjects';

      const prompt = `You are Palnect, a friendly AI tutor. Write a SHORT, personalized re-engagement message for ${userName} 
      who hasn't studied in a few days. They're learning ${subjects}.
      ${weakAreas ? `They were struggling with ${weakAreas} — gently mention this as motivation to come back.` : ''}
      
      Keep it to 2-3 sentences. Be warm, specific, and motivating. No markdown. No emojis.`;

      const response = await ai.models.generateContent({
        model: config.gemini.textModel,
        contents: prompt,
      });

      return response.text ?? `Hey ${userName}, your studies are waiting for you! Jump back in and keep your streak going.`;
    } catch (err) {
      log.error('Re-engagement message generation failed', { err, userId });
      return `Hey ${userName}! Your learning journey is waiting — come back and keep up the great work!`;
    }
  },

  /**
   * Process retention for all inactive users (call from a cron job)
   */
  async runRetentionCycle(inactiveDays = 3): Promise<{ processed: number; messages: Array<{ userId: string; message: string }> }> {
    log.info('Running retention cycle', { inactiveDays });

    const inactiveUsers = await this.getInactiveUsers(inactiveDays);
    const results: Array<{ userId: string; message: string }> = [];

    for (const user of inactiveUsers) {
      const message = await this.generateReEngagementMessage(user.id, user.name);
      results.push({ userId: user.id, message });
      // In production: trigger push notification / email here
      log.debug('Re-engagement message generated', { userId: user.id });
    }

    log.info('Retention cycle complete', { processed: results.length });
    return { processed: results.length, messages: results };
  },
};