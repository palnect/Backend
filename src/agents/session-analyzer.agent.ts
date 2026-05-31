import { GoogleGenAI } from '@google/genai';
import { config } from '../config';
import { MessageRepository, AnalysisRepository, ProfileRepository } from '../db/supabase/repositories';
import { ContextStore } from '../db/redis/session-store';
import { SessionAnalysis } from '../types';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('agent:session-analyzer');

/**
 * SessionAnalyzerAgent — Evaluates learning progress after each session.
 * Identifies weak areas, measures comprehension, and updates learning profile.
 */
export const SessionAnalyzerAgent = {
  async analyze(sessionId: string, userId: string): Promise<SessionAnalysis | null> {
    log.info('Analyzing session', { sessionId, userId });

    try {
      const messages = await MessageRepository.findBySessionId(sessionId);
      if (messages.length < 2) {
        log.debug('Session too short to analyze', { sessionId });
        return null;
      }

      const ctx = await ContextStore.get(sessionId);
      const durationMs = ctx
        ? Date.now() - new Date(messages[0].timestamp).getTime()
        : 0;

      const transcript = messages
        .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
        .join('\n');

      const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

      const prompt = `You are an expert educational analyst. Analyze this tutoring session transcript and return ONLY a JSON object (no markdown):

Session transcript:
${transcript.slice(0, 4000)}

Return exactly this structure:
{
  "topicsCovered": ["topic1", "topic2"],
  "comprehensionScore": 0.75,
  "engagementScore": 0.80,
  "weakAreasIdentified": ["specific weak area 1"],
  "recommendations": ["specific recommendation 1", "specific recommendation 2"],
  "moodDetected": "engaged"
}

Rules:
- comprehensionScore: 0.0-1.0 (how well the student understood)
- engagementScore: 0.0-1.0 (how engaged the student was)
- moodDetected: one of "confident", "confused", "bored", "engaged", "frustrated"
- recommendations: 2-3 concrete next steps
- weakAreasIdentified: specific concepts the student struggled with`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
      });

      let jsonText = response.text ?? '{}';
      jsonText = jsonText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(jsonText);

      const analysis: SessionAnalysis = {
        sessionId,
        userId,
        duration: Math.round(durationMs / 1000),
        topicsCovered: parsed.topicsCovered ?? [],
        comprehensionScore: parsed.comprehensionScore ?? 0.5,
        engagementScore: parsed.engagementScore ?? 0.5,
        weakAreasIdentified: parsed.weakAreasIdentified ?? [],
        recommendations: parsed.recommendations ?? [],
        moodDetected: parsed.moodDetected ?? 'engaged',
      };

      // Persist analysis
      await AnalysisRepository.save(analysis);

      // Update weak topics in profile
      for (const weakArea of analysis.weakAreasIdentified) {
        await ProfileRepository.addWeakTopic(userId, {
          topic: weakArea,
          subject: ctx?.subject ?? 'General',
          score: analysis.comprehensionScore,
          last_tested: new Date().toISOString(),
        });
      }

      log.info('Session analysis complete', {
        sessionId,
        comprehension: analysis.comprehensionScore,
        engagement: analysis.engagementScore,
      });

      return analysis;
    } catch (err) {
      log.error('Session analysis failed', { err, sessionId });
      return null;
    }
  },

  /**
   * Run analysis asynchronously after session ends (fire and forget)
   */
  scheduleAnalysis(sessionId: string, userId: string): void {
    // Run after a short delay to allow final messages to be persisted
    setTimeout(() => {
      this.analyze(sessionId, userId).catch((err) =>
        log.error('Scheduled analysis failed', { err, sessionId })
      );
    }, 3000);
  },
};