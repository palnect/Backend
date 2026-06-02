import { Router, Request, Response } from 'express';
import passport from 'passport';
import crypto from 'crypto';
import { asyncHandler } from '../middleware/error.middleware';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  signupSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '../validators/auth.validator';
import { UserRepository, ProfileRepository } from '../db/supabase/repositories';
import { hashPassword, comparePassword } from '../auth/password';
import { generateTokenPair, verifyRefreshToken } from '../auth/jwt';
import { AuthCache, OtpStore } from '../db/redis/session-store';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { sendEmail } from '../utils/email';
import { welcomeEmailTemplate } from '../emails/welcome';
import { otpEmailTemplate } from '../emails/otp';
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

    sendEmail({
      to: email,
      subject: 'Welcome to Palnect — Your AI Tutor is Ready',
      html: welcomeEmailTemplate(name, `Welcome to Palnect, ${name}! Your AI tutor Lexi is ready to help you learn. Start your first session and experience conversational AI tutoring.`),
    }).catch(() => {});

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
    const userId = req.user!.userId;
    const user = await UserRepository.findById(userId);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }
    const profile = await ProfileRepository.findByUserId(userId);
    sendSuccess(res, { ...sanitizeUser(user), isOnboarded: !!profile?.onboarded_at });
  })
);

// PATCH /auth/me
authRouter.patch(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { name, avatar_url } = req.body as { name?: string; avatar_url?: string };

    const updates: Partial<User> & { password_hash?: string } = {};
    if (name && typeof name === 'string' && name.trim().length >= 2) updates.name = name.trim();
    if (avatar_url && typeof avatar_url === 'string') updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      sendError(res, 'No valid fields to update', 400);
      return;
    }

    const user = await UserRepository.update(userId, updates);
    log.info('User profile updated', { userId });
    sendSuccess(res, sanitizeUser(user), 'Profile updated');
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
    const user = req.user!;
    const tokens = generateTokenPair({ userId: user.userId, email: user.email });

    sendEmail({
      to: user.email,
      subject: 'Welcome to Palnect — Your AI Tutor is Ready',
      html: welcomeEmailTemplate(user.name ?? '', `Welcome to Palnect, ${user.name ?? 'there'}! Your AI tutor Lexi is ready to help you learn.`),
    }).catch(() => {});

    res.redirect(
      `${config.server.frontendUrl}/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`
    );
  }
);

// POST /auth/forgot-password
authRouter.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;

    const user = await UserRepository.findByEmail(email);
    if (!user || user.provider !== 'email') {
      sendSuccess(res, null, 'If that email exists, an OTP has been sent');
      return;
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = await hashPassword(otp);

    await OtpStore.set(email, hashedOtp);

    await sendEmail({
      to: email,
      subject: 'Your Palnect Password Reset Code',
      html: otpEmailTemplate(user.name, otp),
    });

    log.info('OTP sent for password reset', { userId: user.id });
    sendSuccess(res, null, 'If that email exists, an OTP has been sent');
  })
);

// POST /auth/verify-otp
authRouter.post(
  '/verify-otp',
  validate(verifyOtpSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;

    const hashedOtp = await OtpStore.get(email);
    if (!hashedOtp) {
      sendError(res, 'OTP expired or invalid', 400);
      return;
    }

    const valid = await comparePassword(otp, hashedOtp);
    if (!valid) {
      sendError(res, 'Invalid OTP', 400);
      return;
    }

    sendSuccess(res, null, 'OTP verified');
  })
);

// POST /auth/reset-password
authRouter.post(
  '/reset-password',
  validate(resetPasswordSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, otp, newPassword } = req.body;

    const hashedOtp = await OtpStore.get(email);
    if (!hashedOtp) {
      sendError(res, 'OTP expired or invalid', 400);
      return;
    }

    const valid = await comparePassword(otp, hashedOtp);
    if (!valid) {
      sendError(res, 'Invalid OTP', 400);
      return;
    }

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    const password_hash = await hashPassword(newPassword);
    await UserRepository.update(user.id, { password_hash } as Partial<User> & { password_hash?: string });
    await OtpStore.delete(email);
    await AuthCache.invalidate(user.id);

    log.info('Password reset successful', { userId: user.id });
    sendSuccess(res, null, 'Password reset successfully');
  })
);

// ─── Helper ───────────────────────────────────────────────────────────────────

const sanitizeUser = (user: Omit<User, 'password_hash'> & { password_hash?: string }) => {
  const { password_hash, ...clean } = user as User & { password_hash?: string };
  return clean;
};
