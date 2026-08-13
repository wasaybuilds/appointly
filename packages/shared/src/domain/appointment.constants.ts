/*
  Single source of truth for the API, the web client and the PostgreSQL enum
  types. Changing a value here needs a matching migration — deliberately, so the
  database enforces the same invariants the application relies on.
*/

export const APPOINTMENT_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that still occupy a slot; cancelled frees it and completed is in the past, so neither blocks a booking. */
export const BLOCKING_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['pending', 'confirmed'];

/** How the appointment entered the system, so assistant and form conversion can be compared. */
export const APPOINTMENT_SOURCES = ['chat', 'form'] as const;

export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

/** Terminal states cannot re-open; a cancelled appointment is re-booked as a new row, keeping the audit trail honest. */
export const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  cancelled: [],
  completed: [],
};

/** Guard rails for how far ahead a customer may book. */
export const MAX_BOOKING_HORIZON_DAYS = 180;

/** Minimum notice required before an appointment starts. */
export const MIN_BOOKING_NOTICE_MINUTES = 15;
