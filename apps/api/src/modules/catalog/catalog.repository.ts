import type { Service } from '@appointly/shared';
import { query } from '../../db/pool';
import type { BusinessHours } from '../appointments/scheduling.service';

// `businessId` is a required first argument everywhere here, so a query that accidentally spans tenants is hard to write.

interface ServiceRow {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number | null;
  is_active: boolean;
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    isActive: row.is_active,
  };
}

const SERVICE_COLUMNS = `
  id, business_id, name, description, duration_minutes, price_cents, is_active
`;

export const catalogRepository = {
  /** Lists the services a customer may book; inactive rows are excluded but kept so old appointments retain a valid FK. */
  async listActiveServices(businessId: string): Promise<Service[]> {
    const result = await query<ServiceRow>(
      `SELECT ${SERVICE_COLUMNS}
         FROM services
        WHERE business_id = $1 AND is_active = true
        ORDER BY name ASC`,
      [businessId],
    );

    return result.rows.map(toService);
  },

  /** Loads one service by id within the tenant, or null when it does not exist or belongs elsewhere. */
  async findServiceById(businessId: string, serviceId: string): Promise<Service | null> {
    const result = await query<ServiceRow>(
      `SELECT ${SERVICE_COLUMNS}
         FROM services
        WHERE business_id = $1 AND id = $2
        LIMIT 1`,
      [businessId, serviceId],
    );

    const row = result.rows[0];
    return row ? toService(row) : null;
  },

  /** Resolves a free-text phrase to a service, exact match before substring; an ambiguous phrase returns null rather than a guess. */
  async findServiceByName(businessId: string, name: string): Promise<Service | null> {
    const trimmed = name.trim();

    if (trimmed.length < 2) {
      return null;
    }

    const exact = await query<ServiceRow>(
      `SELECT ${SERVICE_COLUMNS}
         FROM services
        WHERE business_id = $1 AND is_active = true AND name = $2
        LIMIT 1`,
      [businessId, trimmed],
    );

    const exactRow = exact.rows[0];
    if (exactRow) {
      return toService(exactRow);
    }

    // `LIMIT 2` so ambiguity is detected instead of silently resolving to whichever row the planner returned first.
    const fuzzy = await query<ServiceRow>(
      `SELECT ${SERVICE_COLUMNS}
         FROM services
        WHERE business_id = $1
          AND is_active = true
          AND (name ILIKE '%' || $2 || '%' OR $2 ILIKE '%' || name || '%')
        ORDER BY length(name) ASC
        LIMIT 2`,
      [businessId, trimmed],
    );

    if (fuzzy.rows.length !== 1) {
      return null;
    }

    const row = fuzzy.rows[0];
    return row ? toService(row) : null;
  },

  /** Loads the tenant's opening hours and timezone. */
  async findBusinessHours(businessId: string): Promise<BusinessHours | null> {
    const result = await query<{ timezone: string; open_hour: number; close_hour: number }>(
      `SELECT timezone, open_hour, close_hour FROM businesses WHERE id = $1 LIMIT 1`,
      [businessId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return { timezone: row.timezone, openHour: row.open_hour, closeHour: row.close_hour };
  },
};
