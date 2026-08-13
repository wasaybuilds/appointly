import { z } from 'zod';
import {
  CHAT_MESSAGE_ROLES,
  CHAT_SESSION_STATUSES,
  MAX_CHAT_MESSAGE_LENGTH,
} from '../domain/chat.constants';
import { appointmentSchema } from './appointment.schema';
import { paginationQuerySchema } from './common.schema';

/*
  A "turn" is the unit the UI cares about — user message, assistant reply and
  the booking outcome derived from it — returned together so the client never
  has to guess what the assistant changed.
*/

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(MAX_CHAT_MESSAGE_LENGTH, `Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const createChatSessionSchema = z.object({
  title: z.string().trim().max(160).optional(),
});

export type CreateChatSessionInput = z.infer<typeof createChatSessionSchema>;

export const listChatSessionsQuerySchema = paginationQuerySchema;

export const chatMessageSchema = z.object({
  id: z.uuid(),
  sessionId: z.uuid(),
  role: z.enum(CHAT_MESSAGE_ROLES),
  content: z.string(),
  createdAt: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatSessionSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  businessId: z.uuid(),
  title: z.string().nullable(),
  status: z.enum(CHAT_SESSION_STATUSES),
  messageCount: z.number().int().nonnegative(),
  lastMessageAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ChatSession = z.infer<typeof chatSessionSchema>;

/** What the server did with the extraction: nothing, still collecting, hand off to the form, or booked. */
export const BOOKING_OUTCOMES = ['none', 'collecting', 'needs_form', 'booked'] as const;

export type BookingOutcome = (typeof BOOKING_OUTCOMES)[number];

/** Pre-fills the fallback form so the customer never re-types something they have already said. */
export const bookingFormPrefillSchema = z.object({
  serviceId: z.uuid().nullable(),
  serviceName: z.string().nullable(),
  startsAt: z.string().nullable(),
  customerName: z.string().nullable(),
  customerEmail: z.string().nullable(),
  customerPhone: z.string().nullable(),
  notes: z.string().nullable(),
});

export type BookingFormPrefill = z.infer<typeof bookingFormPrefillSchema>;

export const bookingResultSchema = z.object({
  outcome: z.enum(BOOKING_OUTCOMES),
  missingFields: z.array(z.string()),
  /** Why the server fell back to the form, surfaced verbatim in the UI. */
  reason: z.string().nullable(),
  prefill: bookingFormPrefillSchema.nullable(),
  appointment: appointmentSchema.nullable(),
});

export type BookingResult = z.infer<typeof bookingResultSchema>;

export const chatTurnSchema = z.object({
  session: chatSessionSchema,
  userMessage: chatMessageSchema,
  assistantMessage: chatMessageSchema,
  booking: bookingResultSchema,
  /** True when the reply came from the deterministic fallback, not the LLM. */
  degraded: z.boolean(),
});

export type ChatTurn = z.infer<typeof chatTurnSchema>;
