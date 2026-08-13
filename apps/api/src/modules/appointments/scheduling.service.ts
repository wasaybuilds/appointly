import {
  API_ERROR_CODES,
  MAX_BOOKING_HORIZON_DAYS,
  MIN_BOOKING_NOTICE_MINUTES,
} from '@appointly/shared';
import { createAppError } from '../../lib/errors/app-error';
import { getZonedParts, zonedTimeToUtc } from '../../lib/time/timezone';

// Pure booking policy, shared by the form and chat paths: the AI only proposes a time, these rules decide if it is legal.

export interface BusinessHours {
  timezone: string;
  openHour: number;
  closeHour: number;
}

/** Granularity of the slots offered by the availability endpoint. */
export const SLOT_INTERVAL_MINUTES = 30;

/** Computes when an appointment ends. */
export function calculateEndsAt(startsAt: Date, durationMinutes: number): Date {
  return new Date(startsAt.getTime() + durationMinutes * 60_000);
}

/** Validates a proposed booking window against the business calendar; throws an `AppError` with a code the UI can act on. */
export function assertSlotIsBookable(
  startsAt: Date,
  durationMinutes: number,
  hours: BusinessHours,
): void {
  if (Number.isNaN(startsAt.getTime())) {
    throw createAppError({
      statusCode: 422,
      code: API_ERROR_CODES.VALIDATION_FAILED,
      message: 'That date and time could not be understood.',
    });
  }

  const now = Date.now();
  const earliestAllowed = now + MIN_BOOKING_NOTICE_MINUTES * 60_000;

  if (startsAt.getTime() < earliestAllowed) {
    throw createAppError({
      statusCode: 409,
      code: API_ERROR_CODES.APPOINTMENT_IN_PAST,
      message: `Appointments need at least ${MIN_BOOKING_NOTICE_MINUTES} minutes' notice. Please choose a later time.`,
      context: { startsAt: startsAt.toISOString() },
    });
  }

  const horizon = now + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60_000;

  if (startsAt.getTime() > horizon) {
    throw createAppError({
      statusCode: 409,
      code: API_ERROR_CODES.APPOINTMENT_TOO_FAR_AHEAD,
      message: `Appointments can only be booked up to ${MAX_BOOKING_HORIZON_DAYS} days ahead.`,
      context: { startsAt: startsAt.toISOString() },
    });
  }

  const endsAt = calculateEndsAt(startsAt, durationMinutes);
  const start = getZonedParts(startsAt, hours.timezone);
  const end = getZonedParts(endsAt, hours.timezone);

  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  const opensAt = hours.openHour * 60;
  const closesAt = hours.closeHour * 60;

  // Ending exactly at closing time is fine; running past it, or spilling into the next day, is not.
  const endsOnSameDay =
    start.year === end.year && start.month === end.month && start.day === end.day;
  const endsExactlyAtMidnightClose = hours.closeHour === 24 && endMinutes === 0;

  const withinHours =
    startMinutes >= opensAt &&
    startMinutes < closesAt &&
    (endsExactlyAtMidnightClose || (endsOnSameDay && endMinutes <= closesAt && endMinutes > 0));

  if (!withinHours) {
    throw createAppError({
      statusCode: 409,
      code: API_ERROR_CODES.APPOINTMENT_OUTSIDE_HOURS,
      message: `We're open between ${formatHour(hours.openHour)} and ${formatHour(hours.closeHour)}. Please choose a time inside opening hours.`,
      context: { startsAt: startsAt.toISOString(), durationMinutes },
    });
  }
}

/** Candidate start times for `date` (`YYYY-MM-DD` in the business timezone); only slots that fit before closing are produced. */
export function generateSlotsForDate(
  date: string,
  durationMinutes: number,
  hours: BusinessHours,
): Array<{ startsAt: Date; endsAt: Date }> {
  const slots: Array<{ startsAt: Date; endsAt: Date }> = [];

  const closingMinutes = hours.closeHour * 60;

  for (
    let minutes = hours.openHour * 60;
    minutes + durationMinutes <= closingMinutes;
    minutes += SLOT_INTERVAL_MINUTES
  ) {
    const startsAt = zonedTimeToUtc(date, Math.floor(minutes / 60), minutes % 60, hours.timezone);
    slots.push({ startsAt, endsAt: calculateEndsAt(startsAt, durationMinutes) });
  }

  return slots;
}

/** Renders an hour as a 12-hour clock label for user-facing messages. */
function formatHour(hour: number): string {
  const normalised = hour % 24;
  const suffix = normalised < 12 ? 'AM' : 'PM';
  const display = normalised % 12 === 0 ? 12 : normalised % 12;
  return `${display}:00 ${suffix}`;
}
