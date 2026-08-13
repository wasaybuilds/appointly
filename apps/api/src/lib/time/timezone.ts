/** Bridges stored `timestamptz` instants and business-local rules via Intl: DST-correct, zero deps. */

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  // Constructing an Intl.DateTimeFormat is expensive and these run per slot, so they are memoised.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Breaks an instant into its calendar fields in the given IANA zone. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const lookup: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== 'literal') {
      lookup[part.type] = Number.parseInt(part.value, 10);
    }
  }

  return {
    year: lookup.year ?? 0,
    month: lookup.month ?? 1,
    day: lookup.day ?? 1,
    // `hour12: false` renders midnight as 24 in some ICU versions.
    hour: (lookup.hour ?? 0) % 24,
    minute: lookup.minute ?? 0,
    second: lookup.second ?? 0,
  };
}

/** Local wall-clock time to a UTC instant; the offset is measured twice as it shifts across a DST edge. */
export function zonedTimeToUtc(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  const naive = new Date(`${date}T${pad(hour)}:${pad(minute)}:00Z`);

  const firstPass = new Date(naive.getTime() - getOffsetMs(naive, timeZone));
  const secondPass = new Date(naive.getTime() - getOffsetMs(firstPass, timeZone));

  return secondPass;
}

/** Offset of `timeZone` from UTC at the given instant, in milliseconds. */
function getOffsetMs(date: Date, timeZone: string): number {
  const parts = getZonedParts(date, timeZone);

  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}
