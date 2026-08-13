import { z } from 'zod';
import {
  APPOINTMENT_SOURCES,
  APPOINTMENT_STATUSES,
  type AppointmentStatus,
} from '../domain/appointment.constants';
import { isoDateSchema, isoDateTimeSchema, paginationQuerySchema } from './common.schema';

/**
 * Appointment contracts.
 *
 * The write model deliberately accepts a `serviceId` rather than a free-text
 * service name: resolving names to identifiers is the caller's job (the chat
 * layer does it against the tenant's catalogue) so the booking service always
 * operates on validated references.
 */

export const serviceSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  durationMinutes: z.number().int().positive(),
  priceCents: z.number().int().nonnegative().nullable(),
  isActive: z.boolean(),
});

export type Service = z.infer<typeof serviceSchema>;

export const createAppointmentSchema = z.object({
  serviceId: z.uuid('Please choose a service'),
  startsAt: isoDateTimeSchema,
  customerName: z.string().trim().min(2, 'Please enter a name').max(120),
  customerEmail: z.email('Please enter a valid email address').max(255).toLowerCase().trim(),
  customerPhone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
  notes: z.string().trim().max(1000, 'Notes must be at most 1000 characters').optional(),
  chatSessionId: z.uuid().optional(),
  source: z.enum(APPOINTMENT_SOURCES).default('form'),
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const rescheduleAppointmentSchema = z.object({
  startsAt: isoDateTimeSchema,
});

export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const updateAppointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
});

export type UpdateAppointmentStatusInput = z.infer<typeof updateAppointmentStatusSchema>;

export const listAppointmentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  /** `upcoming` hides past appointments; `all` returns the full history. */
  scope: z.enum(['upcoming', 'past', 'all']).default('all'),
});

export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const availabilityQuerySchema = z.object({
  serviceId: z.uuid(),
  date: isoDateSchema,
});

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const appointmentSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  userId: z.uuid(),
  chatSessionId: z.uuid().nullable(),
  service: z.object({
    id: z.uuid(),
    name: z.string(),
    durationMinutes: z.number().int().positive(),
  }),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(APPOINTMENT_STATUSES),
  source: z.enum(APPOINTMENT_SOURCES),
  customerName: z.string(),
  customerEmail: z.string(),
  customerPhone: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Appointment = z.infer<typeof appointmentSchema>;

export interface AvailabilitySlot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

/** Human-readable labels shared by the chat replies and the UI badges. */
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};
