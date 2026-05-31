import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { verifyAccessToken } from '../auth/jwt';
import { AuthenticatedWS, WSMessage, WSEventType } from '../types';
import { SessionStore } from '../db/redis/session-store';
import { createChildLogger } from '../utils/logger';
import { sessionHandler } from './session.handler';

const log = createChildLogger('ws:server');

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 10_000;

export const createWSServer = (httpServer: Server): WebSocketServer => {
  const wss = new WebSocketServer({ server: httpServer, path: '/realtime' });

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const socket = ws as AuthenticatedWS;
    socket.isAuthenticated = false;

    log.debug('New WS connection', { ip: req.socket.remoteAddress });

    // ── Auth timeout: close if not authenticated within 10s ──────────────────
    const authTimeout = setTimeout(() => {
      if (!socket.isAuthenticated) {
        send(socket, 'auth_error', { message: 'Authentication timeout' });
        socket.terminate();
        log.warn('WS auth timeout — connection terminated');
      }
    }, 10_000);

    // ── Message handler ───────────────────────────────────────────────────────
    socket.on('message', async (raw) => {
      try {
        const msg = parseMessage(raw.toString());
        if (!msg) return;

        // Auth is always first
        if (msg.type === 'auth') {
          await handleAuth(socket, msg, authTimeout);
          return;
        }

        // All other events require authentication
        if (!socket.isAuthenticated || !socket.userId) {
          send(socket, 'auth_error', { message: 'Not authenticated' });
          return;
        }

        // Heartbeat
        if (msg.type === 'ping') {
          send(socket, 'pong', { timestamp: Date.now() });
          return;
        }

        // Delegate to session handler
        await sessionHandler.handle(socket, msg);
      } catch (err) {
        log.error('WS message error', { err, userId: socket.userId });
        send(socket, 'error', { message: 'Internal error processing message' });
      }
    });

    // ── Disconnect handler ────────────────────────────────────────────────────
    socket.on('close', async (code, reason) => {
      clearTimeout(authTimeout);
      clearInterval(socket.heartbeatInterval);

      if (socket.userId && socket.sessionId) {
        await sessionHandler.onDisconnect(socket);
        log.info('WS disconnected', {
          userId: socket.userId,
          sessionId: socket.sessionId,
          code,
          reason: reason.toString(),
        });
      }
    });

    socket.on('error', (err) => {
      log.error('WS socket error', { err, userId: socket.userId });
    });
  });

  wss.on('error', (err) => {
    log.error('WSServer error', { err });
  });

  log.info('WebSocket server mounted at /realtime');
  return wss;
};

// ─── Auth Handler ─────────────────────────────────────────────────────────────

const handleAuth = async (
  socket: AuthenticatedWS,
  msg: WSMessage,
  authTimeout: ReturnType<typeof setTimeout>
): Promise<void> => {
  try {
    const payload = msg.payload as { token: string };
    if (!payload?.token) {
      send(socket, 'auth_error', { message: 'No token provided' });
      socket.terminate();
      return;
    }

    const decoded = verifyAccessToken(payload.token);
    socket.userId = decoded.userId;
    socket.isAuthenticated = true;
    clearTimeout(authTimeout);

    // Start heartbeat
    socket.heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        send(socket, 'ping', { timestamp: Date.now() });
      }
    }, HEARTBEAT_INTERVAL);

    log.info('WS authenticated', { userId: socket.userId });
    send(socket, 'auth_success', { userId: decoded.userId, email: decoded.email });
  } catch {
    send(socket, 'auth_error', { message: 'Invalid token' });
    socket.terminate();
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const send = (
  socket: WebSocket,
  type: WSEventType,
  payload?: unknown
): void => {
  if (socket.readyState !== WebSocket.OPEN) return;
  const msg: WSMessage = { type, payload, timestamp: Date.now() };
  socket.send(JSON.stringify(msg));
};

const parseMessage = (raw: string): WSMessage | null => {
  try {
    return JSON.parse(raw) as WSMessage;
  } catch {
    log.warn('Failed to parse WS message', { raw: raw.slice(0, 100) });
    return null;
  }
};