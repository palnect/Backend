import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { ProfileRepository } from '../db/supabase/repositories';
import { OnboardingData, LearningProfile } from '../types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:onboarding');

/**
 * OnboardingAgent — Guides new users and initializes their learning profile.
 * Uses Gemini to generate a personalized welcome summary and initial learning strategy.
 */
export const OnboardingAgent = {
  async run(
    userId: string,
    data: OnboardingData
  ): Promise<{ profile: LearningProfile; welcomeMessage: string }> {
    log.info('Running onboarding agent', { userId });

    // Update/create the learning profile
    let profile = await ProfileRepository.findByUserId(userId);

    const profileData: Partial<LearningProfile> = {
      subjects: data.subjects,
      level: data.level,
      learning_style: data.learningStyle,
      goals: data.goals,
      weak_topics: [],
      total_sessions: 0,
      total_minutes: 0,
      streak_days: 0,
    };

    if (profile) {
      profile = await ProfileRepository.update(userId, profileData);
    } else {
      profile = await ProfileRepository.create(userId, profileData);
    }

    // Generate a personalized welcome message using Gemini
    const welcomeMessage = await this.generateWelcome(data);

    log.info('Onboarding complete', { userId, subjects: data.subjects });
    return { profile, welcomeMessage };
  },

  async generateWelcome(data: OnboardingData): Promise<string> {
    try {
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
      const prompt = `You are Palnect, a warm and encouraging AI tutor. 
      A new student has just signed up with the following profile:
      - Subjects they want to learn: ${data.subjects.join(', ')}
      - Current level: ${data.level}
      - Learning style: ${data.learningStyle}
      - Goals: ${data.goals.join(', ')}
      - Available hours per week: ${data.availableHoursPerWeek}
      
      Write a SHORT, warm, personalized welcome message (3-4 sentences max) that:
      1. Greets them enthusiastically
      2. Acknowledges their specific goals
      3. Sets expectations for what Palnect will help them achieve
      4. Ends with an encouraging call to action to start their first session
      
      Be concise, warm, and motivating. No markdown.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      return response.text ?? 'Welcome to Palnect! Your personalized AI tutor is ready.';
    } catch (err) {
      log.error('Welcome message generation failed', { err });
      return `Welcome to Palnect! You're all set to start learning ${data.subjects.join(' and ')}. Let's achieve your goals together!`;
    }
  },
};