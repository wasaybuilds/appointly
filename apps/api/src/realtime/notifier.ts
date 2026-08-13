import {
  SOCKET_EVENTS,
  socketRooms,
  type Appointment,
  type BookingResult,
  type ChatMessage,
} from '@appointly/shared';
import { createLogger } from '../lib/logger/logger';
import { getSocketServer } from './socket-server';

const log = createLogger('realtime.notifier');

/** Best-effort: the write is already committed, so a realtime failure must not fail the HTTP request. */
function safeEmit(action: () => void): void {
  try {
    action();
  } catch (error) {
    log.warn({ err: error }, 'Realtime notification failed');
  }
}

export const notifier = {
  /** Pushes a newly persisted chat message to everyone watching the session. */
  messageCreated(sessionId: string, message: ChatMessage): void {
    const io = getSocketServer();
    if (!io) return;

    safeEmit(() => {
      io.to(socketRooms.chatSession(sessionId)).emit(SOCKET_EVENTS.MESSAGE_CREATED, message);
    });
  },

  /** Toggles the typing indicator so the UI shows activity during the LLM round trip. */
  assistantTyping(sessionId: string, isTyping: boolean): void {
    const io = getSocketServer();
    if (!io) return;

    safeEmit(() => {
      io.to(socketRooms.chatSession(sessionId)).emit(SOCKET_EVENTS.ASSISTANT_TYPING, {
        sessionId,
        isTyping,
      });
    });
  },

  /** Broadcasts the booking outcome the server derived from a turn. */
  bookingUpdated(sessionId: string, booking: BookingResult): void {
    const io = getSocketServer();
    if (!io) return;

    safeEmit(() => {
      io.to(socketRooms.chatSession(sessionId)).emit(SOCKET_EVENTS.BOOKING_UPDATED, {
        sessionId,
        booking,
      });
    });
  },

  /** Targets the user room, not the session room: a chat booking must refresh the list open in another tab. */
  appointmentCreated(userId: string, appointment: Appointment): void {
    const io = getSocketServer();
    if (!io) return;

    safeEmit(() => {
      io.to(socketRooms.user(userId)).emit(SOCKET_EVENTS.APPOINTMENT_CREATED, appointment);
    });
  },

  /** Notifies a user that an appointment was rescheduled or changed status. */
  appointmentUpdated(userId: string, appointment: Appointment): void {
    const io = getSocketServer();
    if (!io) return;

    safeEmit(() => {
      io.to(socketRooms.user(userId)).emit(SOCKET_EVENTS.APPOINTMENT_UPDATED, appointment);
    });
  },
};
