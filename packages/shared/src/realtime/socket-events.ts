import type { Appointment } from '../schemas/appointment.schema';
import type { BookingResult, ChatMessage } from '../schemas/chat.schema';

/*
  A notification channel only: every state change goes through the REST API and
  is echoed to the user's other tabs, so authorisation, validation and rate
  limiting live in exactly one place.
*/

export const SOCKET_EVENTS = {
  JOIN_SESSION: 'chat:join',
  LEAVE_SESSION: 'chat:leave',
  MESSAGE_CREATED: 'chat:message',
  ASSISTANT_TYPING: 'chat:typing',
  BOOKING_UPDATED: 'chat:booking',
  APPOINTMENT_CREATED: 'appointment:created',
  APPOINTMENT_UPDATED: 'appointment:updated',
} as const;

export interface AssistantTypingPayload {
  sessionId: string;
  isTyping: boolean;
}

export interface BookingUpdatedPayload {
  sessionId: string;
  booking: BookingResult;
}

/** Events the server emits to the client. */
export interface ServerToClientEvents {
  [SOCKET_EVENTS.MESSAGE_CREATED]: (message: ChatMessage) => void;
  [SOCKET_EVENTS.ASSISTANT_TYPING]: (payload: AssistantTypingPayload) => void;
  [SOCKET_EVENTS.BOOKING_UPDATED]: (payload: BookingUpdatedPayload) => void;
  [SOCKET_EVENTS.APPOINTMENT_CREATED]: (appointment: Appointment) => void;
  [SOCKET_EVENTS.APPOINTMENT_UPDATED]: (appointment: Appointment) => void;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  [SOCKET_EVENTS.JOIN_SESSION]: (sessionId: string) => void;
  [SOCKET_EVENTS.LEAVE_SESSION]: (sessionId: string) => void;
}

/** Room helpers keep room-name construction in one place on both sides. */
export const socketRooms = {
  user: (userId: string): string => `user:${userId}`,
  chatSession: (sessionId: string): string => `session:${sessionId}`,
} as const;
