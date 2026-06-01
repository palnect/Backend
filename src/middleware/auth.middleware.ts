import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, extractBearerToken } from '../auth/jwt';
import { sendError } from '../utils/response';
import { AuthCache } from '../db/redis/session-store';
import { UserRepository } from '../db/supabase/repositories';
import { createChildLogger } from '../utils/logger';
import { JWTPayload } from '../types';

const log = createChildLogger('middleware:auth');

declare global {
  namespace Express {
    interface User extends JWTPayload {
      name?: string;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      sendError(res, 'No authorization token provided', 401);
      return;
    }

    let payload: JWTPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      sendError(res, 'Invalid or expired token', 401);
      return;
    }

    // Try Redis cache first
    const cached = await AuthCache.getUser(payload.userId);
    if (cached) {
      req.user = { ...payload, ...(cached as object) };
      return next();
    }

    // Fallback to DB
    const user = await UserRepository.findById(payload.userId);
    if (!user) {
      sendError(res, 'User not found', 401);
      return;
    }

    // Cache user data
    await AuthCache.setUser(payload.userId, { name: user.name, email: user.email });
    req.user = { ...payload, name: user.name };
    next();
  } catch (err) {
    log.error('Auth middleware error', { err });
    sendError(res, 'Authentication failed', 500);
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (token) {
      const payload = verifyAccessToken(token);
      req.user = payload;
    }
  } catch {
    // Silent fail for optional auth
  }
  next();
};