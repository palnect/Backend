import dotenv from 'dotenv';
dotenv.config();

const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

export const config = {
  server: {
    port: parseInt(optional('PORT', '3000'), 10),
    env: optional('NODE_ENV', 'development'),
    frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),
  },
  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-in-prod'),
    expiresIn: optional('JWT_EXPIRES_IN', '7d'),
    refreshSecret: optional('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  },
  supabase: {
    url: optional('SUPABASE_URL', ''),
    anonKey: optional('SUPABASE_ANON_KEY', ''),
    serviceRoleKey: optional('SUPABASE_SERVICE_ROLE_KEY', ''),
  },
  redis: {
    url: optional('REDIS_URL', 'redis://localhost:6379'),
    password: optional('REDIS_PASSWORD', ''),
    sessionTTL: parseInt(optional('REDIS_SESSION_TTL', '86400'), 10),
  },
  google: {
    clientId: optional('GOOGLE_CLIENT_ID', ''),
    clientSecret: optional('GOOGLE_CLIENT_SECRET', ''),
    callbackUrl: optional('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
  },
  gemini: {
    apiKey: optional('GEMINI_API_KEY', ''),
    model: 'gemini-3.1-flash-live-preview',
  },
  session: {
    ttlSeconds: parseInt(optional('SESSION_TTL_SECONDS', '3600'), 10),
  },
} as const;

export type Config = typeof config;