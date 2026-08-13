import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns';

/*
  The API returns absolute ISO instants; these render them in the viewer's own
  timezone. Business-hour rules are evaluated server-side in the *business*
  timezone — deliberately a different concern.
*/

/** Renders a date and time, e.g. `Mon 17 Aug, 3:00 pm`. */
export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'EEE d MMM, h:mm a');
}

/** Renders just the clock time, for slot pickers where the date is already known. */
export function formatTime(iso: string): string {
  return format(new Date(iso), 'h:mm a');
}

/** Renders just the date. */
export function formatDate(iso: string): string {
  return format(new Date(iso), 'EEEE d MMMM yyyy');
}

/** Renders a date the way a person would say it; "Today at 3:00 pm" scans faster in a list than a full date. */
export function formatFriendlyDateTime(iso: string): string {
  const date = new Date(iso);

  if (isToday(date)) {
    return `Today at ${format(date, 'h:mm a')}`;
  }

  if (isTomorrow(date)) {
    return `Tomorrow at ${format(date, 'h:mm a')}`;
  }

  return format(date, 'EEE d MMM, h:mm a');
}

/** Renders how long ago something happened, for chat timestamps. */
export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

/** True when the instant has passed, used to grey out finished bookings. */
export function isInPast(iso: string): boolean {
  return isPast(new Date(iso));
}

/** Today's date as `YYYY-MM-DD`, the format the availability endpoint expects. */
export function todayAsDateInput(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** An instant as `YYYY-MM-DD` in the viewer's timezone; slicing the ISO string would use UTC and can land a day out. */
export function toDateInputValue(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd');
}

/** Converts an ISO instant for a `datetime-local` input, which needs local wall-clock time, not a sliced ISO string. */
export function toDateTimeLocalValue(iso: string | null): string {
  if (!iso) return '';

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Converts a `datetime-local` value back to an ISO instant; local-time parsing is the intent — 3pm where the user is. */
export function fromDateTimeLocalValue(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** Formats a price in minor units, or returns null when the service is unpriced. */
export function formatPrice(priceCents: number | null): string | null {
  if (priceCents === null) return null;

  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: priceCents % 100 === 0 ? 0 : 2,
  }).format(priceCents / 100);
}
