import {
  ALLOWED_STATUS_TRANSITIONS,
  API_ERROR_CODES,
  type Appointment,
  type AppointmentStatus,
  type AvailabilitySlot,
  type CreateAppointmentInput,
  type ListAppointmentsQuery,
  type PaginationMeta,
} from '@appointly/shared';
import { createAppError, errors } from '../../lib/errors/app-error';
import { createLogger } from '../../lib/logger/logger';
import { isExclusionViolation } from '../../lib/db/pg-errors';
import { buildPaginationMeta } from '../../lib/http/respond';
import { catalogRepository } from '../catalog/catalog.repository';
import type { AuthenticatedActor } from '../auth/auth.types';
import { appointmentRepository } from './appointment.repository';
import {
  assertSlotIsBookable,
  calculateEndsAt,
  generateSlotsForDate,
  type BusinessHours,
} from './scheduling.service';

const log = createLogger('appointments.service');

async function loadBusinessHours(businessId: string): Promise<BusinessHours> {
  const hours = await catalogRepository.findBusinessHours(businessId);

  if (!hours) {
    throw errors.notFound('Business');
  }

  return hours;
}

export const appointmentService = {
  /** Books an appointment; overlap is rejected by a DB exclusion constraint, which no app-level check could do race-free. */
  async create(actor: AuthenticatedActor, input: CreateAppointmentInput): Promise<Appointment> {
    const service = await catalogRepository.findServiceById(actor.businessId, input.serviceId);

    if (!service || !service.isActive) {
      throw errors.notFound('Service');
    }

    const hours = await loadBusinessHours(actor.businessId);
    const startsAt = new Date(input.startsAt);

    assertSlotIsBookable(startsAt, service.durationMinutes, hours);

    const endsAt = calculateEndsAt(startsAt, service.durationMinutes);

    try {
      const appointment = await appointmentRepository.insert({
        businessId: actor.businessId,
        userId: actor.userId,
        serviceId: service.id,
        chatSessionId: input.chatSessionId ?? null,
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone && input.customerPhone.length > 0 ? input.customerPhone : null,
        startsAt,
        endsAt,
        source: input.source,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
      });

      log.info(
        { appointmentId: appointment.id, userId: actor.userId, source: input.source },
        'Appointment created',
      );

      return appointment;
    } catch (error) {
      if (isExclusionViolation(error, 'appointments_no_overlap')) {
        throw createAppError({
          statusCode: 409,
          code: API_ERROR_CODES.APPOINTMENT_SLOT_TAKEN,
          message: 'That time was just booked by someone else. Please pick another slot.',
          context: { startsAt: startsAt.toISOString() },
        });
      }
      throw error;
    }
  },

  /** Lists the caller's own appointments; scoped to `actor.userId` so no call site can widen it. */
  async list(
    actor: AuthenticatedActor,
    filters: ListAppointmentsQuery,
  ): Promise<{ appointments: Appointment[]; meta: PaginationMeta }> {
    const { appointments, total } = await appointmentRepository.listForUser(
      actor.businessId,
      actor.userId,
      filters,
    );

    return {
      appointments,
      meta: buildPaginationMeta(total, filters.page, filters.pageSize),
    };
  },

  /** Loads one appointment; a booking the caller may not read is reported as 404, since 403 would confirm it exists. */
  async getById(actor: AuthenticatedActor, appointmentId: string): Promise<Appointment> {
    const appointment = await appointmentRepository.findById(actor.businessId, appointmentId);

    if (!appointment) {
      throw errors.notFound('Appointment');
    }

    const isOwner = appointment.userId === actor.userId;
    const isStaff = actor.role === 'staff' || actor.role === 'admin';

    if (!isOwner && !isStaff) {
      throw errors.notFound('Appointment');
    }

    return appointment;
  },

  /** Moves an appointment to a new time; re-runs the full booking validation, as a reschedule is a new booking. */
  async reschedule(
    actor: AuthenticatedActor,
    appointmentId: string,
    newStartsAt: string,
  ): Promise<Appointment> {
    const existing = await this.getById(actor, appointmentId);

    if (existing.status === 'cancelled' || existing.status === 'completed') {
      throw createAppError({
        statusCode: 409,
        code: API_ERROR_CODES.APPOINTMENT_INVALID_TRANSITION,
        message: `A ${existing.status} appointment cannot be rescheduled. Please book a new one.`,
      });
    }

    const hours = await loadBusinessHours(actor.businessId);
    const startsAt = new Date(newStartsAt);

    assertSlotIsBookable(startsAt, existing.service.durationMinutes, hours);

    const endsAt = calculateEndsAt(startsAt, existing.service.durationMinutes);

    try {
      const updated = await appointmentRepository.reschedule(
        actor.businessId,
        appointmentId,
        startsAt,
        endsAt,
      );

      if (!updated) {
        throw errors.notFound('Appointment');
      }

      log.info({ appointmentId, startsAt: startsAt.toISOString() }, 'Appointment rescheduled');

      return updated;
    } catch (error) {
      if (isExclusionViolation(error, 'appointments_no_overlap')) {
        throw createAppError({
          statusCode: 409,
          code: API_ERROR_CODES.APPOINTMENT_SLOT_TAKEN,
          message: 'That time is already booked. Please pick another slot.',
        });
      }
      throw error;
    }
  },

  /** Advances an appointment's status; `ALLOWED_STATUS_TRANSITIONS` is the only source of legal moves, keeping terminal states terminal. */
  async updateStatus(
    actor: AuthenticatedActor,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<Appointment> {
    const existing = await this.getById(actor, appointmentId);

    if (existing.status === status) {
      return existing;
    }

    const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];

    if (!allowed.includes(status)) {
      throw createAppError({
        statusCode: 409,
        code: API_ERROR_CODES.APPOINTMENT_INVALID_TRANSITION,
        message: `An appointment cannot go from ${existing.status} to ${status}.`,
        context: { appointmentId, from: existing.status, to: status },
      });
    }

    // Confirming and completing are operational actions; a customer may only cancel.
    if (status !== 'cancelled' && actor.role === 'customer') {
      throw errors.forbidden('Only staff can change an appointment to this status.');
    }

    const updated = await appointmentRepository.updateStatus(
      actor.businessId,
      appointmentId,
      status,
    );

    if (!updated) {
      throw errors.notFound('Appointment');
    }

    log.info({ appointmentId, from: existing.status, to: status }, 'Appointment status changed');

    return updated;
  },

  /** Returns the bookable slots for a service on a date; advisory only, the authoritative check happens at insert time. */
  async getAvailability(
    actor: AuthenticatedActor,
    serviceId: string,
    date: string,
  ): Promise<AvailabilitySlot[]> {
    const service = await catalogRepository.findServiceById(actor.businessId, serviceId);

    if (!service || !service.isActive) {
      throw errors.notFound('Service');
    }

    const hours = await loadBusinessHours(actor.businessId);
    const slots = generateSlotsForDate(date, service.durationMinutes, hours);

    if (slots.length === 0) {
      return [];
    }

    const windowStart = slots[0]?.startsAt;
    const windowEnd = slots[slots.length - 1]?.endsAt;

    if (!windowStart || !windowEnd) {
      return [];
    }

    const booked = await appointmentRepository.findOverlapping(
      actor.businessId,
      windowStart,
      windowEnd,
    );

    return slots.map((slot) => {
      const collides = booked.some(
        (taken) => slot.startsAt < taken.endsAt && taken.startsAt < slot.endsAt,
      );

      let available = !collides;

      // Passed slots are shown as unavailable rather than dropped, so the day is not made to look emptier than it is.
      if (available) {
        try {
          assertSlotIsBookable(slot.startsAt, service.durationMinutes, hours);
        } catch {
          available = false;
        }
      }

      return {
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        available,
      };
    });
  },
};
