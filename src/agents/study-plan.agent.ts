import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { ProfileRepository } from '../db/supabase/repositories';
import { StudyPlanRepository } from '../db/supabase/repositories';
import { StudyPlan } from '../types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:study-plan');

/**
 * StudyPlanAgent — Creates and manages personalized multi-week learning paths.
 * Uses Gemini to generate structured study plans based on user profile.
 */
export const StudyPlanAgent = {
  async getOrGenerate(userId: string): Promise<StudyPlan> {
    // Check for recent plan (< 7 days old)
    const existing = await StudyPlanRepository.findLatestByUserId(userId);
    if (existing) {
      const createdAt = new Date(existing.created_at).getTime();
      const ageMs = Date.now() - createdAt;
      if (ageMs < 7 * 24 * 60 * 60 * 1000) {
        return existing;
      }
    }

    return this.generate(userId);
  },

  async generate(userId: string): Promise<StudyPlan> {
    log.info('Generating study plan', { userId });

    const profile = await ProfileRepository.findByUserId(userId);
    if (!profile) throw new Error('Profile not found');

    try {
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

      const prompt = `You are an expert curriculum designer for Palnect, an AI tutoring platform.
      
      Create a 4-week personalized study plan for this student:
      - Subjects: ${profile.subjects.join(', ')}
      - Level: ${profile.level}
      - Learning style: ${profile.learning_style}
      - Goals: ${profile.goals.join(', ')}
      - Weak areas: ${profile.weak_topics?.map((t) => t.topic).join(', ') || 'none identified yet'}
      
      Return ONLY a JSON object (no markdown) with this exact structure:
      {
        "weeks": [
          {
            "week": 1,
            "topics": [
              {
                "subject": "Math",
                "topic": "Algebra Basics",
                "estimatedMinutes": 45,
                "priority": "high"
              }
            ]
          }
        ]
      }
      
      Rules:
      - 4 weeks total
      - 3-5 topics per week
      - Prioritize weak areas
      - Build progressively (easier → harder)
      - Realistic time estimates (20-60 min per topic)
      - Priority: "high", "medium", or "low"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      let jsonText = response.text ?? '{}';
      // Strip any markdown fences
      jsonText = jsonText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);

      const plan = await StudyPlanRepository.save({
        user_id: userId,
        weeks: parsed.weeks,
      });

      log.info('Study plan generated', { userId, weeks: parsed.weeks.length });
      return plan;
    } catch (err) {
      log.error('Study plan generation failed', { err, userId });
      // Fallback generic plan
      return StudyPlanRepository.save({
        user_id: userId,
        weeks: profile.subjects.slice(0, 2).flatMap((subject, i) => [
          {
            week: i * 2 + 1,
            topics: [{ subject, topic: 'Fundamentals', estimatedMinutes: 45, priority: 'high' as const }],
          },
          {
            week: i * 2 + 2,
            topics: [{ subject, topic: 'Practice Problems', estimatedMinutes: 30, priority: 'medium' as const }],
          },
        ]),
      });
    }
  },
};