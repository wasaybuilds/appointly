export const CHAT_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;

export type ChatMessageRole = (typeof CHAT_MESSAGE_ROLES)[number];

export const CHAT_SESSION_STATUSES = ['active', 'completed', 'abandoned'] as const;

export type ChatSessionStatus = (typeof CHAT_SESSION_STATUSES)[number];

/** Anything outside this set is coerced to `unknown`, so an unexpected model response never reaches booking logic. */
export const ASSISTANT_INTENTS = [
  'book_appointment',
  'reschedule_appointment',
  'cancel_appointment',
  'check_availability',
  'smalltalk',
  'unknown',
] as const;

export type AssistantIntent = (typeof ASSISTANT_INTENTS)[number];

/** Needed before a booking is attempted; any one missing renders the structured form fallback. */
export const REQUIRED_BOOKING_FIELDS = [
  'serviceName',
  'startsAt',
  'customerName',
  'customerEmail',
] as const;

export type RequiredBookingField = (typeof REQUIRED_BOOKING_FIELDS)[number];

/** Messages replayed as conversational memory, bounded to keep prompt size, latency and cost predictable. */
export const AI_MEMORY_WINDOW_SIZE = 12;

/** Below this self-reported confidence the extraction is treated as unreliable and the form takes over. */
export const AI_MIN_BOOKING_CONFIDENCE = 0.6;

/** Hard cap on a single chat message to bound prompt size and abuse. */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;
