import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import {
  onboardingSchema,
  updateProfileSchema,
  createGoalSchema,
  updateGoalSchema,
} from '../validators/session.validator';
import { ProfileRepository, GoalRepository, SessionRepository } from '../db/supabase/repositories';
import { ProfileCache } from '../db/redis/session-store';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { OnboardingAgent } from '../agents/onboarding.agent';

export const profileRouter = Router();
profileRouter.use(authenticate);

// GET /profile
profileRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    const cached = await ProfileCache.get(userId);
    if (cached) {
      sendSuccess(res, cached);
      return;
    }

    const profile = await ProfileRepository.findByUserId(userId);
    if (!profile) {
      sendError(res, 'Profile not found', 404);
      return;
    }

    await ProfileCache.set(userId, profile);
    sendSuccess(res, profile);
  })
);

// POST /profile/onboard
profileRouter.post(
  '/onboard',
  validate(onboardingSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const data = req.body;

    const result = await OnboardingAgent.run(userId, data);
    await ProfileCache.invalidate(userId);

    sendSuccess(res, result, 'Onboarding complete');
  })
);

// PUT /profile
profileRouter.put(
  '/',
  validate(updateProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const allowed = ['field', 'learning_style', 'goals', 'learner_type', 'available_hours_per_day'];
    const updates: Record<string, unknown> = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      sendError(res, 'No valid fields to update', 400);
      return;
    }

    const profile = await ProfileRepository.update(userId, updates as any);
    await ProfileCache.invalidate(userId);
    sendSuccess(res, profile, 'Profile updated');
  })
);

// GET /profile/stats  — streak, sessions, total time
profileRouter.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const profile = await ProfileRepository.findByUserId(userId);
    if (!profile) {
      sendError(res, 'Profile not found', 404);
      return;
    }
    sendSuccess(res, {
      streak_days: profile.streak_days,
      longest_streak: profile.longest_streak,
      total_sessions: profile.total_sessions,
      total_minutes: profile.total_minutes,
      last_session_date: profile.last_session_date,
    });
  })
);

// ─── Learning Goals ───────────────────────────────────────────────────────────

// GET /profile/goals?date=YYYY-MM-DD
profileRouter.get(
  '/goals',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const goals = await GoalRepository.findByUserId(userId, date);
    sendSuccess(res, { goals, count: goals.length });
  })
);

// POST /profile/goals
profileRouter.post(
  '/goals',
  validate(createGoalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { title, field, scheduled_date } = req.body;
    const goal = await GoalRepository.create({ user_id: userId, title, field, scheduled_date });
    sendCreated(res, goal, 'Goal created');
  })
);

// PATCH /profile/goals/:id
profileRouter.patch(
  '/goals/:id',
  validate(updateGoalSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const goalId = String(req.params.id);
    const goal = await GoalRepository.update(goalId, userId, req.body);
    sendSuccess(res, goal, 'Goal updated');
  })
);

// DELETE /profile/goals/:id
profileRouter.delete(
  '/goals/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    await GoalRepository.delete(String(req.params.id), userId);
    sendSuccess(res, null, 'Goal deleted');
  })
);

// GET /profile/calendar?month=YYYY-MM  — session days in a month for the calendar grid
profileRouter.get(
  '/calendar',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const month = typeof req.query.month === 'string' ? req.query.month : new Date().toISOString().slice(0, 7);
    // Fetch sessions for the whole month
    const sessions = await SessionRepository.findByUserId(userId, 100);
    const daysWithSessions = [
      ...new Set(
        sessions
          .filter((s) => s.started_at.startsWith(month))
          .map((s) => s.started_at.split('T')[0])
      ),
    ];
    sendSuccess(res, { month, daysWithSessions });
  })
);
