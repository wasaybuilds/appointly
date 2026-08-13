import { z } from 'zod';
import { ASSISTANT_INTENTS } from '../domain/chat.constants';

/*
  Everything the model returns is untrusted input, and this schema is the
  boundary that rejects whatever does not fit. The model proposes; the server
  disposes.
*/

/** Nullable string that also treats empty/placeholder output from the model as "not provided". */
const modelString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => {
    if (!value) return null;
    const normalised = value.toLowerCase();
    if (normalised === 'null' || normalised === 'unknown' || normalised === 'n/a') return null;
    return value;
  });

export const extractedBookingDetailsSchema = z.object({
  /** Free-text service name; resolved against the tenant catalogue server-side. */
  serviceName: modelString,
  /** ISO 8601 date-time the model resolved from relative phrasing ("next Tuesday at 3"). */
  startsAt: modelString,
  customerName: modelString,
  customerEmail: modelString,
  customerPhone: modelString,
  notes: modelString,
});

export type ExtractedBookingDetails = z.infer<typeof extractedBookingDetailsSchema>;

export const assistantResponseSchema = z.object({
  /** Natural-language reply shown to the customer. */
  reply: z.string().trim().min(1).max(1200),
  intent: z
    .enum(ASSISTANT_INTENTS)
    .nullish()
    .transform((value) => value ?? 'unknown'),
  booking: extractedBookingDetailsSchema.nullish().transform(
    (value) =>
      value ?? {
        serviceName: null,
        startsAt: null,
        customerName: null,
        customerEmail: null,
        customerPhone: null,
        notes: null,
      },
  ),
  /** Model's own view of what is still missing; the server recomputes this too. */
  missingFields: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  /** The model may request a booking, but only the server can perform one. */
  readyToBook: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
  confidence: z.coerce
    .number()
    .min(0)
    .max(1)
    .nullish()
    .transform((value) => value ?? 0),
});

export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

/** Status recorded for every model call, used by the AI interaction log. */
export const AI_CALL_STATUSES = ['success', 'invalid_output', 'provider_error', 'timeout'] as const;

export type AiCallStatus = (typeof AI_CALL_STATUSES)[number];
