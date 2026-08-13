import {
  AI_MIN_BOOKING_CONFIDENCE,
  type Appointment,
  type AssistantResponse,
  type BookingFormPrefill,
  type BookingResult,
  type ChatMessage,
  type ChatSession,
  type ChatTurn,
  type PaginationMeta,
  type PaginationQuery,
  type Service,
} from '@appointly/shared';
import { isAppError } from '../../lib/errors/app-error';
import { errors } from '../../lib/errors/app-error';
import { createLogger } from '../../lib/logger/logger';
import { buildPaginationMeta } from '../../lib/http/respond';
import { bookingAssistant } from '../ai/booking-assistant.service';
import { appointmentService } from '../appointments/appointment.service';
import type { BusinessHours } from '../appointments/scheduling.service';
import { authRepository } from '../auth/auth.repository';
import type { AuthenticatedActor } from '../auth/auth.types';
import { catalogRepository } from '../catalog/catalog.repository';
import { notifier } from '../../realtime/notifier';
import { chatRepository } from './chat.repository';

// The assistant interprets, this service decides: every extracted value is re-resolved against real data and booked through
// the same `appointmentService.create` the form uses, so the model has no privileged path to the database.

const log = createLogger('chat.service');

/** After this many messages without a booking, the conversation hands off to the form. */
const MESSAGES_BEFORE_FORM_HANDOFF = 8;

/** Transcript window loaded for display and for assistant memory. */
const TRANSCRIPT_LIMIT = 100;

interface SessionWithMessages {
  session: ChatSession;
  messages: ChatMessage[];
}

export const chatService = {
  /** Resumes the caller's active conversation, or starts one. */
  async startSession(actor: AuthenticatedActor): Promise<SessionWithMessages> {
    const session = await chatRepository.findOrCreateActiveSession(actor.businessId, actor.userId);
    const messages = await chatRepository.listMessages(session.id, TRANSCRIPT_LIMIT);

    return { session, messages };
  },

  /** Explicitly begins a new conversation. */
  async createSession(actor: AuthenticatedActor, title: string | null): Promise<ChatSession> {
    return chatRepository.createSession(actor.businessId, actor.userId, title);
  },

  /** Lists the caller's conversations. */
  async listSessions(
    actor: AuthenticatedActor,
    pagination: PaginationQuery,
  ): Promise<{ sessions: ChatSession[]; meta: PaginationMeta }> {
    const { sessions, total } = await chatRepository.listSessions(
      actor.businessId,
      actor.userId,
      pagination,
    );

    return { sessions, meta: buildPaginationMeta(total, pagination.page, pagination.pageSize) };
  },

  /** Loads one conversation and its transcript. */
  async getSession(actor: AuthenticatedActor, sessionId: string): Promise<SessionWithMessages> {
    const session = await chatRepository.findSession(actor.businessId, actor.userId, sessionId);

    if (!session) {
      throw errors.notFound('Conversation');
    }

    const messages = await chatRepository.listMessages(session.id, TRANSCRIPT_LIMIT);

    return { session, messages };
  },

  /** Handles one turn: persist the customer's message, consult the assistant, act on the extraction, persist the reply. */
  async sendMessage(
    actor: AuthenticatedActor,
    sessionId: string,
    content: string,
  ): Promise<ChatTurn> {
    const session = await chatRepository.findSession(actor.businessId, actor.userId, sessionId);

    if (!session) {
      throw errors.notFound('Conversation');
    }

    // Read the transcript before appending, so the model sees history and the new message exactly once each.
    const history = await chatRepository.listMessages(session.id, TRANSCRIPT_LIMIT);

    const userMessage = await chatRepository.appendMessage({
      sessionId: session.id,
      role: 'user',
      content,
      tokenCount: null,
      // The opening message doubles as the conversation's title in the sidebar.
      title: content.slice(0, 80),
    });

    notifier.messageCreated(session.id, userMessage);
    notifier.assistantTyping(session.id, true);

    try {
      const [services, hours, user] = await Promise.all([
        catalogRepository.listActiveServices(actor.businessId),
        catalogRepository.findBusinessHours(actor.businessId),
        authRepository.findById(actor.userId, actor.businessId),
      ]);

      if (!hours || !user) {
        throw errors.internal('This business is not fully configured yet.');
      }

      const { response, degraded } = await bookingAssistant.respond({
        businessId: actor.businessId,
        userId: actor.userId,
        sessionId: session.id,
        history,
        userMessage: content,
        services,
        hours,
        customerName: user.fullName,
        customerEmail: user.email,
      });

      const booking = await resolveBooking({
        actor,
        session,
        response,
        degraded,
        services,
        defaultName: user.fullName,
        defaultEmail: user.email,
      });

      const assistantMessage = await chatRepository.appendMessage({
        sessionId: session.id,
        role: 'assistant',
        content: composeAssistantReply(response.reply, booking, hours),
        tokenCount: null,
      });

      if (booking.appointment) {
        await chatRepository.markCompleted(session.id, booking.appointment.id);
        notifier.appointmentCreated(actor.userId, booking.appointment);
      }

      notifier.messageCreated(session.id, assistantMessage);
      notifier.bookingUpdated(session.id, booking);

      const refreshed = await chatRepository.findSession(
        actor.businessId,
        actor.userId,
        session.id,
      );

      return {
        session: refreshed ?? session,
        userMessage,
        assistantMessage,
        booking,
        degraded,
      };
    } finally {
      // Always clear the indicator: a throwing turn must not leave the UI showing the assistant as perpetually typing.
      notifier.assistantTyping(session.id, false);
    }
  },
};

interface ResolveBookingInput {
  actor: AuthenticatedActor;
  session: ChatSession;
  response: AssistantResponse;
  degraded: boolean;
  services: Service[];
  defaultName: string;
  defaultEmail: string;
}

/** Turns the model's extraction into a decision; nothing it produced is trusted until re-resolved against real data. */
async function resolveBooking(input: ResolveBookingInput): Promise<BookingResult> {
  const { actor, session, response, degraded } = input;
  const extracted = response.booking;

  const service = extracted.serviceName
    ? await catalogRepository.findServiceByName(actor.businessId, extracted.serviceName)
    : null;

  const startsAt = parseIsoDate(extracted.startsAt);
  const customerName = extracted.customerName ?? input.defaultName;
  const customerEmail = extracted.customerEmail ?? input.defaultEmail;

  const missingFields: string[] = [];
  if (!service) missingFields.push('serviceName');
  if (!startsAt) missingFields.push('startsAt');
  if (!customerName) missingFields.push('customerName');
  if (!customerEmail) missingFields.push('customerEmail');

  const prefill: BookingFormPrefill = {
    serviceId: service?.id ?? null,
    serviceName: service?.name ?? extracted.serviceName,
    startsAt: startsAt ? startsAt.toISOString() : null,
    customerName,
    customerEmail,
    customerPhone: extracted.customerPhone,
    notes: extracted.notes,
  };

  const isConfident = response.confidence >= AI_MIN_BOOKING_CONFIDENCE;

  if (missingFields.length === 0 && response.readyToBook && isConfident && startsAt && service) {
    try {
      const appointment = await appointmentService.create(actor, {
        serviceId: service.id,
        startsAt: startsAt.toISOString(),
        customerName,
        customerEmail,
        customerPhone: extracted.customerPhone ?? undefined,
        notes: extracted.notes ?? undefined,
        chatSessionId: session.id,
        source: 'chat',
      });

      log.info(
        { sessionId: session.id, appointmentId: appointment.id, confidence: response.confidence },
        'Appointment booked from chat',
      );

      return {
        outcome: 'booked',
        missingFields: [],
        reason: null,
        prefill: null,
        appointment,
      };
    } catch (error) {
      // A domain rejection is a conversational outcome, not a server error: surface the reason and hand off to the form.
      if (isAppError(error) && error.statusCode < 500) {
        log.info(
          { sessionId: session.id, code: error.code },
          'Chat booking rejected by domain rules',
        );

        return {
          outcome: 'needs_form',
          missingFields: [],
          reason: error.message,
          prefill,
          appointment: null,
        };
      }

      throw error;
    }
  }

  const conversationIsDragging = session.messageCount >= MESSAGES_BEFORE_FORM_HANDOFF;
  const needsForm = degraded || !isConfident || conversationIsDragging;

  if (needsForm) {
    return {
      outcome: 'needs_form',
      missingFields,
      reason: resolveHandoffReason(degraded, isConfident, conversationIsDragging),
      prefill,
      appointment: null,
    };
  }

  return {
    outcome: 'collecting',
    missingFields,
    reason: null,
    prefill,
    appointment: null,
  };
}

/** Explains, in the user's language, why the form appeared. */
function resolveHandoffReason(
  degraded: boolean,
  isConfident: boolean,
  conversationIsDragging: boolean,
): string {
  if (degraded) {
    return 'The assistant is unavailable right now, so here is the booking form instead.';
  }
  if (!isConfident) {
    return "I want to be sure I've got the details right — please confirm them below.";
  }
  if (conversationIsDragging) {
    return "Let's finish this off quickly with the form.";
  }
  return 'Please confirm the details below.';
}

/** Appends a confirmation line from the persisted row; the model's reply may claim a booking the domain rules rejected. */
function composeAssistantReply(
  reply: string,
  booking: BookingResult,
  hours: BusinessHours,
): string {
  if (booking.outcome === 'booked' && booking.appointment) {
    return `${reply}\n\nConfirmed: ${booking.appointment.service.name} on ${formatAppointmentTime(
      booking.appointment,
      hours.timezone,
    )}.`;
  }

  if (booking.outcome === 'needs_form' && booking.reason) {
    return `${reply}\n\n${booking.reason}`;
  }

  return reply;
}

/** Renders an appointment start time in the tenant's timezone. */
function formatAppointmentTime(appointment: Appointment, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(appointment.startsAt));
}

/** Parses a model-supplied timestamp, rejecting anything unusable. */
function parseIsoDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
