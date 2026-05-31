import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { onboardingSchema } from '../validators/session.validator';
import { ProfileRepository } from '../db/supabase/repositories';
import { ProfileCache } from '../db/redis/session-store';
import { sendSuccess, sendError } from '../utils/response';
import { OnboardingAgent } from '../agents/onboarding.agent';
import { StudyPlanAgent } from '../agents/study-plan.agent';

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

// GET /profile/study-plan
profileRouter.get(
  '/study-plan',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const plan = await StudyPlanAgent.getOrGenerate(userId);
    sendSuccess(res, plan);
  })
);