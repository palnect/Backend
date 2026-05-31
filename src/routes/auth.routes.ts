import { Router, Request, Response } from 'express';
import passport from 'passport';
import { asyncHandler } from '../middleware/error.middleware';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { signupSchema, loginSchema, refreshSchema } from '../validators/auth.validator';
import { UserRepository, ProfileRepository } from '../db/supabase/repositories';
import { hashPassword, comparePassword } from '../auth/password';
import { generateTokenPair, verifyRefreshToken } from '../auth/jwt';
import { AuthCache } from '../db/redis/session-store';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { User } from '../types';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('routes:auth');
export const authRouter = Router();

// POST /auth/signup
authRouter.post(
  '/signup',
  validate(signupSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body;

    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      sendError(res, 'Email already registered', 409);
      return;
    }

    const password_hash = await hashPassword(password);
    const user = await UserRepository.create({ email, name, provider: 'email', password_hash });

    // Initialize learning profile
    await ProfileRepository.create(user.id, {
      subjects: [],
      level: 'beginner',
      learning_style: 'visual',
      goals: [],
      weak_topics: [],
      total_sessions: 0,
      total_minutes: 0,
      streak_days: 0,
    });

    const tokens = generateTokenPair({ userId: user.id, email: user.email });

    log.info('User signed up', { userId: user.id });
    sendCreated(res, { user: sanitizeUser(user), ...tokens }, 'Account created successfully');
  })
);

// POST /auth/login
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const user = await UserRepository.findByEmail(email);
    if (!user || user.provider !== 'email') {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    if (!user.password_hash) {
      sendError(res, 'Please login with Google', 401);
      return;
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      sendError(res, 'Invalid credentials', 401);
      return;
    }

    const tokens = generateTokenPair({ userId: user.id, email: user.email });
    await AuthCache.setUser(user.id, { name: user.name, email: user.email });

    log.info('User logged in', { userId: user.id });
    sendSuccess(res, { user: sanitizeUser(user), ...tokens }, 'Login successful');
  })
);

// POST /auth/refresh
authRouter.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    try {
      const payload = verifyRefreshToken(refreshToken);
      const tokens = generateTokenPair({ userId: payload.userId, email: payload.email });
      sendSuccess(res, tokens, 'Tokens refreshed');
    } catch {
      sendError(res, 'Invalid refresh token', 401);
    }
  })
);

// POST /auth/logout
authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    await AuthCache.invalidate(userId);
    sendSuccess(res, null, 'Logged out successfully');
  })
);

// GET /auth/me
authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await UserRepository.findById(req.user!.userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }
    sendSuccess(res, sanitizeUser(user));
  })
);

// GET /auth/google
authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// GET /auth/google/callback
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${config.server.frontendUrl}/auth/error` }),
  (req: Request, res: Response) => {
    const user = req.user as User;
    const tokens = generateTokenPair({ userId: user.id, email: user.email });
    // Redirect to frontend with tokens in query (or use a short-lived code pattern in production)
    res.redirect(
      `${config.server.frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  }
);

// ─── Helper ───────────────────────────────────────────────────────────────────

const sanitizeUser = (user: Omit<User, 'password_hash'> & { password_hash?: string }) => {
  const { password_hash, ...clean } = user as User & { password_hash?: string };
  return clean;
};