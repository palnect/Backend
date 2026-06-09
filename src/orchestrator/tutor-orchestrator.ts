import {
  ConversationContext,
  TutoringMode,
  OrchestratorDecision,
  LearningProfile,
} from '../types';
import { ContextStore } from '../db/redis/session-store';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('orchestrator');

// ─── Confusion signal keywords ─────────────────────────────────────────────────

const CONFUSION_SIGNALS = [
  "don't understand",
  "confused",
  "lost",
  "what do you mean",
  "can you explain again",
  "i don't get",
  "huh",
  "what?",
  "that makes no sense",
  "unclear",
  "could you repeat",
  'not sure',
  "what's that",
];

const ENGAGEMENT_SIGNALS = [
  'interesting',
  'cool',
  'got it',
  'i see',
  'makes sense',
  'oh i see',
  'that makes sense',
  'tell me more',
  'what about',
  'how about',
  'can we',
  'i want to',
];

const BOREDOM_SIGNALS = [
  'boring',
  'skip',
  'i know this',
  'too easy',
  'already know',
  'next topic',
  'move on',
];

// ─── Mode system prompts ───────────────────────────────────────────────────────

const MODE_PROMPTS: Record<TutoringMode, string> = {
  explain: `You are explaining a concept clearly. Use analogies, examples, and step-by-step breakdowns. 
    Be thorough but concise. Check for understanding after key points.`,

  simplify: `The student is confused. Simplify your explanation dramatically. 
    Use the simplest possible language, relatable everyday analogies, and very short sentences. 
    Break the concept down to its most basic form. Ask "Does that make sense?" after every key point.`,

  quiz: `You are quizzing the student to test their understanding. 
    Ask one question at a time. Wait for their answer. Give immediate, encouraging feedback.
    If wrong, guide them toward the right answer with hints rather than just telling them.`,

  motivate: `The student seems disengaged or frustrated. Be warm, encouraging, and enthusiastic. 
    Celebrate their effort. Connect the topic to their real-world interests and goals. 
    Make learning feel exciting and achievable. Keep it energetic and brief.`,

  practice: `Guide the student through hands-on practice problems. 
    Present problems one at a time. Walk through solutions collaboratively. 
    Encourage them to try before revealing answers.`,

  review: `You are reviewing previously covered material. 
    Summarize key concepts, highlight important points, and reinforce what the student already knows. 
    Connect new knowledge to what they've already learned.`,
};

// ─── TutorOrchestrator ────────────────────────────────────────────────────────

export class TutorOrchestrator {
  private readonly MIN_MODE_CHANGE_INTERVAL = 30_000; // 30 seconds

  /**
   * Build the full system prompt by injecting memory, profile, and strategy
   */
  buildSystemPrompt(context: ConversationContext): string {
    const profile = context.profile;
    const modeInstruction = MODE_PROMPTS[context.mode];

    const weakTopicsSection =
      profile.weak_topics && profile.weak_topics.length > 0
        ? `\nStudent's weak areas: ${profile.weak_topics.map((t) => t.topic).join(', ')}. Pay extra attention to these.`
        : '';

    const styleSection = profile.learning_style
      ? `\nPreferred learning style: ${profile.learning_style}. Adapt your explanations accordingly.`
      : '';

    const learnerSection = profile.learner_type
      ? `\nLearner identity: ${profile.learner_type.replace('_', ' ')}. Calibrate your vocabulary, depth, and tone accordingly.`
      : '';

    const sourceMaterialSection = context.sourceMaterial
      ? `\nThe student has provided the following reference material for this session — ground your teaching in it:\n---\n${context.sourceMaterial.slice(0, 3000)}\n---`
      : '';

    const recentContext =
      context.messages.length > 0
        ? `\nRecent conversation:\n${context.messages
            .slice(-5)
            .map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`)
            .join('\n')}`
        : '';

    return `You are Lexi, Palnect's expert AI tutor. Your personality is warm, patient, and encouraging.
You are currently helping the student with: "${context.topic}"${context.field && context.field !== 'General' ? ` (field: ${context.field})` : ''}

Current teaching mode: ${context.mode.toUpperCase()}
${modeInstruction}
${learnerSection}${styleSection}${weakTopicsSection}${sourceMaterialSection}

CRITICAL RULES:
- Keep responses SHORT for voice. Maximum 3-4 sentences per turn.
- Never use markdown formatting — this is a voice conversation.
- Always speak naturally as if talking to someone face-to-face.
- If the student interrupts you, acknowledge it immediately and adapt.
- Be conversational, NOT lecture-like.
${recentContext}`;
  }

  /**
   * Analyze student input for signals and decide if mode/strategy should change
   */
  async analyzeAndDecide(
    sessionId: string,
    userInput: string
  ): Promise<OrchestratorDecision> {
    const context = await ContextStore.get(sessionId);
    if (!context) {
      throw new Error(`No context found for session ${sessionId}`);
    }

    const inputLower = userInput.toLowerCase();
    let newMode = context.mode;
    let shouldAdapt = false;
    let reason = '';
    let confusionDelta = 0;
    let engagementDelta = 0;

    // Check for confusion signals
    const isConfused = CONFUSION_SIGNALS.some((s) => inputLower.includes(s));
    if (isConfused) {
      confusionDelta = 0.15;
      engagementDelta = -0.05;
      log.debug('Confusion detected', { sessionId, input: userInput.slice(0, 50) });
    }

    // Check for engagement signals
    const isEngaged = ENGAGEMENT_SIGNALS.some((s) => inputLower.includes(s));
    if (isEngaged) {
      engagementDelta += 0.1;
      confusionDelta -= 0.05;
    }

    // Check for boredom signals
    const isBored = BOREDOM_SIGNALS.some((s) => inputLower.includes(s));
    if (isBored) {
      engagementDelta -= 0.15;
    }

    // Update scores
    await ContextStore.updateScores(sessionId, confusionDelta, engagementDelta);

    // Re-fetch updated context
    const updatedContext = await ContextStore.get(sessionId);
    if (!updatedContext) return { mode: newMode, systemPrompt: this.buildSystemPrompt(context), shouldAdapt: false };

    const timeSinceLastChange = Date.now() - updatedContext.lastModeChange;
    const canChangeMode = timeSinceLastChange > this.MIN_MODE_CHANGE_INTERVAL;

    if (canChangeMode) {
      // High confusion → simplify
      if (updatedContext.confusionScore > 0.5 && context.mode !== 'simplify') {
        newMode = 'simplify';
        shouldAdapt = true;
        reason = 'High confusion detected, switching to simplify mode';
      }
      // Low engagement → motivate
      else if (updatedContext.engagementScore < 0.3 && context.mode !== 'motivate') {
        newMode = 'motivate';
        shouldAdapt = true;
        reason = 'Low engagement detected, switching to motivate mode';
      }
      // After simplify mode, if confusion clears, go back to explain
      else if (
        context.mode === 'simplify' &&
        updatedContext.confusionScore < 0.2 &&
        isEngaged
      ) {
        newMode = 'explain';
        shouldAdapt = true;
        reason = 'Confusion resolved, resuming normal explanation';
      }
      // If mode has been explain for a while and engagement is high, offer quiz
      else if (
        context.mode === 'explain' &&
        updatedContext.engagementScore > 0.7 &&
        context.messages.length > 6
      ) {
        newMode = 'quiz';
        shouldAdapt = true;
        reason = 'High engagement, switching to quiz mode to test understanding';
      }

      if (shouldAdapt && newMode !== context.mode) {
        await ContextStore.updateMode(sessionId, newMode);
        log.info('Mode changed', { sessionId, from: context.mode, to: newMode, reason });
      }
    }

    const finalContext = shouldAdapt
      ? { ...updatedContext, mode: newMode }
      : updatedContext;

    return {
      mode: newMode,
      systemPrompt: this.buildSystemPrompt(finalContext),
      shouldAdapt,
      reason,
    };
  }

  /**
   * Initialize a fresh context for a new session
   */
  async initContext(
    sessionId: string,
    userId: string,
    topic: string,
    field: string,
    mode: TutoringMode,
    profile: Partial<LearningProfile>,
    sourceMaterial?: string,
    docContext?: { isDocMode?: boolean; docSections?: import('../types').DocSection[]; resumeSectionId?: string },
  ): Promise<ConversationContext> {
    const context: ConversationContext = {
      sessionId,
      userId,
      topic,
      field,
      sourceMaterial,
      mode,
      messages: [],
      profile,
      confusionScore: 0,
      engagementScore: 0.5,
      lastModeChange: Date.now(),
      ...(docContext ?? {}),
    };

    await ContextStore.set(context);
    log.debug('Context initialized', { sessionId, topic, field, mode });
    return context;
  }

  /**
   * Detect confusion in user input without updating state (for quick checks)
   */
  detectConfusion(input: string): boolean {
    const lower = input.toLowerCase();
    return CONFUSION_SIGNALS.some((s) => lower.includes(s));
  }

  /**
   * Get current teaching strategy summary
   */
  async getStrategy(sessionId: string): Promise<{
    mode: TutoringMode;
    confusionScore: number;
    engagementScore: number;
  } | null> {
    const ctx = await ContextStore.get(sessionId);
    if (!ctx) return null;
    return {
      mode: ctx.mode,
      confusionScore: ctx.confusionScore,
      engagementScore: ctx.engagementScore,
    };
  }
}

export const tutorOrchestrator = new TutorOrchestrator();