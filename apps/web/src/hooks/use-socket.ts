'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_EVENTS,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@appointly/shared';

/*
  One module-level socket, reference-counted: every consumer wants the same
  stream, so a connection per component would multiply server-side connections
  for nothing. The connection is an enhancement — every screen works from its
  HTTP responses alone.
*/

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';

let sharedSocket: AppSocket | null = null;
let consumerCount = 0;

function acquireSocket(): AppSocket {
  sharedSocket ??= io(SOCKET_URL, {
    // The httpOnly session cookie authenticates the handshake; no token passes through JavaScript.
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  consumerCount += 1;
  return sharedSocket;
}

function releaseSocket(): void {
  consumerCount -= 1;

  if (consumerCount <= 0 && sharedSocket) {
    sharedSocket.disconnect();
    sharedSocket = null;
    consumerCount = 0;
  }
}

/** Subscribes to realtime events for the component's lifetime; handlers are held in a ref, so inline arrows are safe. */
export function useSocket(
  handlers: Partial<{
    [K in keyof ServerToClientEvents]: ServerToClientEvents[K];
  }>,
  sessionId?: string | null,
): void {
  const handlersRef = useRef(handlers);

  // Updated in an effect, never during render: a discarded or replayed render
  // would otherwise decide what the ref holds.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const socket = acquireSocket();

    // Each listener reads from the ref, so the effect depends only on the event
    // names — not on the identity of the callbacks.
    const eventNames = Object.keys(handlersRef.current) as Array<keyof ServerToClientEvents>;

    const listeners = eventNames.map((eventName) => {
      const listener = (...args: unknown[]): void => {
        const handler = handlersRef.current[eventName] as ((...a: unknown[]) => void) | undefined;
        handler?.(...args);
      };

      socket.on(eventName as never, listener as never);
      return { eventName, listener };
    });

    return () => {
      for (const { eventName, listener } of listeners) {
        socket.off(eventName as never, listener as never);
      }
      releaseSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Object.keys(handlers).join(',')]);

  useEffect(() => {
    if (!sessionId) return;

    const socket = acquireSocket();

    const join = (): void => {
      socket.emit(SOCKET_EVENTS.JOIN_SESSION, sessionId);
    };

    join();
    // Rejoin after a reconnect, otherwise a dropped connection silently stops
    // delivering messages for this conversation.
    socket.on('connect', join);

    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_SESSION, sessionId);
      socket.off('connect', join);
      releaseSocket();
    };
  }, [sessionId]);
}
