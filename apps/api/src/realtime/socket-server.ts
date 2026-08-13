import type { Server as HttpServer } from 'node:http';
import { Server as SocketServer, type Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  socketRooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@appointly/shared';
import { env } from '../config/env';
import { createLogger } from '../lib/logger/logger';
import { ACCESS_TOKEN_COOKIE } from '../modules/auth/auth.cookies';
import { verifyAccessToken } from '../modules/auth/token.service';
import type { AuthenticatedActor } from '../modules/auth/auth.types';

// Push-only channel: it accepts no writes, so validation, authorisation and rate
// limiting stay in the REST layer instead of diverging across two transports.

const log = createLogger('realtime.socket');

interface SocketData {
  actor: AuthenticatedActor;
}

type AppSocketServer = SocketServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

let io: AppSocketServer | null = null;

/** The handshake is a raw HTTP upgrade, so `cookie-parser` has not run on it and one cookie is all we need. */
function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};

  return header.split(';').reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    if (name) {
      cookies[name] = decodeURIComponent(value);
    }

    return cookies;
  }, {});
}

/** Binds Socket.IO to the HTTP server; the REST httpOnly cookie authenticates the handshake before any handler runs. */
export function initSocketServer(httpServer: HttpServer): AppSocketServer {
  io = new SocketServer<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.webOrigins,
      credentials: true,
    },
    // Long-poll fallback keeps the app usable behind proxies that block WebSocket upgrades.
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);

      // `handshake.auth` is caller-controlled and typed `any` by Socket.IO, so it is narrowed, not trusted.
      const handshakeAuth = socket.handshake.auth as Record<string, unknown> | undefined;
      const token = cookies[ACCESS_TOKEN_COOKIE] ?? handshakeAuth?.token;

      if (typeof token !== 'string' || token.length === 0) {
        next(new Error('Unauthorized'));
        return;
      }

      const payload = verifyAccessToken(token);

      socket.data.actor = {
        userId: payload.sub,
        businessId: payload.businessId,
        email: payload.email,
        role: payload.role,
      };

      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket: AppSocket) => {
    const { actor } = socket.data;

    // A room per user id is how one person's open tabs are updated without tracking socket ids.
    void socket.join(socketRooms.user(actor.userId));

    log.debug({ userId: actor.userId, socketId: socket.id }, 'Socket connected');

    socket.on(SOCKET_EVENTS.JOIN_SESSION, (sessionId: string) => {
      // Room membership is not authorisation: REST verified session ownership before the client learnt the id.
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        void socket.join(socketRooms.chatSession(sessionId));
      }
    });

    socket.on(SOCKET_EVENTS.LEAVE_SESSION, (sessionId: string) => {
      if (typeof sessionId === 'string' && sessionId.length > 0) {
        void socket.leave(socketRooms.chatSession(sessionId));
      }
    });

    socket.on('disconnect', (reason) => {
      log.debug({ userId: actor.userId, socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  log.info('Socket.IO server initialised');

  return io;
}

/** Nullable by design: a missing realtime layer must never break an HTTP request that already succeeded. */
export function getSocketServer(): AppSocketServer | null {
  return io;
}

/** Closes all connections during graceful shutdown. */
export async function closeSocketServer(): Promise<void> {
  if (!io) return;

  await io.close();
  io = null;
  log.info('Socket.IO server closed');
}
