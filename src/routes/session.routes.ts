import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { asyncHandler } from '../middleware/error.middleware';
import { createSessionSchema } from '../validators/session.validator';
import { SessionRepository, MessageRepository, ProfileRepository, AnalysisRepository } from '../db/supabase/repositories';
import { SessionStore } from '../db/redis/session-store';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { SessionAnalyzerAgent } from '../agents/session-analyzer.agent';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('routes:session');
export const sessionRouter = Router();

// All session routes require auth
sessionRouter.use(authenticate);

// POST /session/create — pre-create session record (WS handles the actual session)
sessionRouter.post(
  '/create',
  validate(createSessionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { subject, topic, mode } = req.body;

    // Check for existing active session
    const activeId = await SessionStore.getActiveSessionForUser(userId);
    if (activeId) {
      sendError(res, 'You already have an active session. End it before starting a new one.', 409);
      return;
    }

    sendCreated(res, { subject, topic, mode, message: 'Ready to connect via WebSocket at /realtime' });
  })
);

// GET /session/:id
sessionRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const session = await SessionRepository.findById(id);
    if (!session) {
      sendError(res, 'Session not found', 404);
      return;
    }

    if (session.user_id !== userId) {
      sendError(res, 'Access denied', 403);
      return;
    }

    const messages = await MessageRepository.findBySessionId(id);
    sendSuccess(res, { session, messages });
  })
);

// POST /session/end
sessionRouter.post(
  '/end',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const sessionId = req.body.sessionId as string;

    if (!sessionId) {
      sendError(res, 'sessionId is required', 400);
      return;
    }

    const session = await SessionRepository.findById(sessionId);
    if (!session) {
      sendError(res, 'Session not found', 404);
      return;
    }

    if (session.user_id !== userId) {
      sendError(res, 'Access denied', 403);
      return;
    }

    const ended = await SessionRepository.end(sessionId);
    await SessionStore.remove(sessionId, userId);

    log.info('Session ended via REST', { sessionId, userId });
    sendSuccess(res, ended, 'Session ended');
  })
);

// GET /session — list user's sessions
sessionRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const limit = parseInt((req.query.limit as string) ?? '10', 10);
    const sessions = await SessionRepository.findByUserId(userId, limit);
    sendSuccess(res, { sessions, count: sessions.length });
  })
);

// GET /session/active — check for active session
sessionRouter.get(
  '/active/check',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const activeId = await SessionStore.getActiveSessionForUser(userId);
    if (activeId) {
      const session = await SessionRepository.findById(activeId);
      sendSuccess(res, { hasActive: true, session });
    } else {
      sendSuccess(res, { hasActive: false });
    }
  })
);

// GET /session/:id/analysis — get or trigger analysis for a session
sessionRouter.get(
  '/:id/analysis',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const userId = req.user!.userId;

    const session = await SessionRepository.findById(id);
    if (!session) {
      sendError(res, 'Session not found', 404);
      return;
    }

    if (session.user_id !== userId) {
      sendError(res, 'Access denied', 403);
      return;
    }

    // Try to find existing analysis
    let analysis = await AnalysisRepository.findBySessionId(id);

    // If session is ended and no analysis exists, trigger one
    if (!analysis && session.status === 'ended') {
      analysis = await SessionAnalyzerAgent.analyze(id, userId);
    }

    if (!analysis) {
      sendSuccess(res, null, 'Analysis not yet available');
      return;
    }

    sendSuccess(res, analysis);
  })
);

// GET /session/analyses — get all analyses for the user
sessionRouter.get(
  '/analyses/all',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const analyses = await AnalysisRepository.findByUserId(userId);
    sendSuccess(res, { analyses, count: analyses.length });
  })
);