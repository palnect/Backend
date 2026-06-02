import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { ProfileRepository } from '../db/supabase/repositories';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:study-plan');

// StudyPlanAgent is kept for compatibility but the calendar model has replaced
// the weekly plan concept. This now generates a simple daily suggestion list.
export const StudyPlanAgent = {
  async suggestTopics(userId: string): Promise<{ topics: string[] }> {
    const profile = await ProfileRepository.findByUserId(userId);
    if (!profile) return { topics: [] };

    try {
      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
      const weakAreas = profile.weak_topics?.slice(0, 3).map((t) => t.topic).join(', ') || 'none yet';

      const prompt = `You are Lexi, an expert AI tutor on Palnect.
A ${profile.learner_type?.replace('_', ' ') ?? 'learner'} studying ${profile.field ?? 'various subjects'} wants study suggestions.
Their goals: ${profile.goals?.join(', ') || 'general learning'}.
Weak areas to revisit: ${weakAreas}.

Return ONLY a JSON object (no markdown):
{ "topics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"] }

Rules:
- 5 specific, actionable study topics
- Prioritize weak areas
- Match the learner's field and goals
- Each topic should be completable in one focused session`;

      const response = await ai.models.generateContent({
        model: config.gemini.textModel,
        contents: prompt,
      });

      let jsonText = response.text ?? '{}';
      jsonText = jsonText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);
      log.info('Study suggestions generated', { userId, count: parsed.topics?.length });
      return { topics: parsed.topics ?? [] };
    } catch (err) {
      log.error('Study suggestion generation failed', { err, userId });
      return { topics: [] };
    }
  },
};
