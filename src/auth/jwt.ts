import jwt from 'jsonwebtoken';
import { config } from '../config';
import { JWTPayload, AuthTokens } from '../types';

export const signAccessToken = (payload: JWTPayload): string =>
  jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] });

export const signRefreshToken = (payload: JWTPayload): string =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: '30d' });

export const verifyAccessToken = (token: string): JWTPayload => {
  const decoded = jwt.verify(token, config.jwt.secret);
  return decoded as JWTPayload;
};

export const verifyRefreshToken = (token: string): JWTPayload => {
  const decoded = jwt.verify(token, config.jwt.refreshSecret);
  return decoded as JWTPayload;
};

export const generateTokenPair = (payload: JWTPayload): AuthTokens => ({
  accessToken: signAccessToken(payload),
  refreshToken: signRefreshToken(payload),
});

export const extractBearerToken = (authHeader?: string): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
};