import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { ProfileRepository } from '../db/supabase/repositories';
import { OnboardingData, LearningProfile } from '../types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:onboarding');

export const OnboardingAgent = {
  async run(
    userId: string,
    data: OnboardingData
  ): Promise<{ profile: LearningProfile; welcomeMessage: string }> {
    log.info('Running onboarding agent', { userId });

    let profile = await ProfileRepository.findByUserId(userId);

    const profileData: Partial<LearningProfile> = {
      learner_type: data.learnerType,
      field: data.field,
      learning_style: data.learningStyle,
      goals: data.goals,
      available_hours_per_day: data.availableHoursPerDay,
      weak_topics: [],
      total_sessions: 0,
      total_minutes: 0,
      streak_days: 0,
      longest_streak: 0,
      last_session_date: null,
      onboarded_at: new Date().toISOString(),
    };

    if (profile) {
      profile = await ProfileRepository.update(userId, profileData);
    } else {
      profile = await ProfileRepository.create(userId, profileData);
    }

    const welcomeMessage = await this.generateWelcome(data);

    log.info('Onboarding complete', { userId, field: data.field, learnerType: data.learnerType });
    return { profile, welcomeMessage };
  },

  async generateWelcome(data: OnboardingData): Promise<string> {
    try {
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

      const learnerLabel = data.learnerType.replace('_', ' ');
      const prompt = `You are Lexi, Palnect's warm and encouraging AI tutor.
A new learner just joined with this profile:
- Who they are: ${learnerLabel}
- Field / area of interest: ${data.field}
- Learning style: ${data.learningStyle}
- Goals: ${data.goals.join(', ')}
- Available time per day: ${data.availableHoursPerDay} hour(s)

Write a SHORT, warm, personalized welcome message (3 sentences max) that:
1. Greets them and acknowledges who they are (${learnerLabel} in ${data.field})
2. Briefly connects to their goals
3. Invites them to start their first session with energy

Be concise, human, and motivating. No markdown. No lists.`;

      const response = await ai.models.generateContent({
        model: config.gemini.textModel,
        contents: prompt,
      });

      return response.text ?? 'Welcome to Palnect! Your AI tutor Lexi is ready to help you grow.';
    } catch (err) {
      log.error('Welcome message generation failed', { err });
      return `Welcome to Palnect! You're all set to start learning in ${data.field}. Let's make every session count.`;
    }
  },
};
