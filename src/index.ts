import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import passport from 'passport';

import { config } from './config';
import { logger } from './utils/logger';
import { authRouter } from './routes/auth.routes';
import { sessionRouter } from './routes/session.routes';
import { profileRouter } from './routes/profile.routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { setupGoogleOAuth } from './auth/google';
import { createWSServer } from './websocket/ws-server';
import { getRedisClient } from './db/redis/client';
import { getSupabaseAdmin } from './db/supabase/client';

async function bootstrap() {
  // ── Express setup ─────────────────────────────────────────────────────────
  const app = express();

  app.use(
    cors({
      origin: config.server.frontendUrl,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(config.server.env === 'production' ? 'combined' : 'dev'));

  // ── Passport (Google OAuth) ───────────────────────────────────────────────
  app.use(passport.initialize());
  setupGoogleOAuth();

  // ── Health check ──────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'palnect-backend',
      timestamp: new Date().toISOString(),
      env: config.server.env,
    });
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/auth', authRouter);
  app.use('/session', sessionRouter);
  app.use('/profile', profileRouter);

  // ── Error handlers ────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  // ── HTTP + WebSocket Server ───────────────────────────────────────────────
  const httpServer = http.createServer(app);
  createWSServer(httpServer);

  // ── Verify connections ────────────────────────────────────────────────────
  try {
    const redis = getRedisClient();
    await redis.ping();
    logger.info('✓ Redis connected');
  } catch (err) {
    logger.warn('Redis unavailable — some features degraded', { err });
  }

  if (config.supabase.url) {
    try {
      const db = getSupabaseAdmin();
      await db.from('users').select('id').limit(1);
      logger.info('✓ Supabase connected');
    } catch (err) {
      logger.warn('Supabase unavailable', { err });
    }
  }

  // ── Start server ──────────────────────────────────────────────────────────
  httpServer.listen(config.server.port, () => {
    logger.info(`🚀 Palnect backend running`, {
      port: config.server.port,
      env: config.server.env,
      ws: `ws://localhost:${config.server.port}/realtime`,
    });
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    httpServer.close(async () => {
      const { closeRedis } = await import('./db/redis/client');
      await closeRedis();
      logger.info('Server shut down cleanly');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { err });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});