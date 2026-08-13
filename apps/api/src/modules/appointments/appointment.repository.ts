import type { PoolClient } from 'pg';
import type {
  Appointment,
  AppointmentSource,
  AppointmentStatus,
  ListAppointmentsQuery,
} from '@appointly/shared';
import { query } from '../../db/pool';

// Reads join `services` so a booking is self-describing in one round trip; the client never fetches the catalogue to render one.

interface AppointmentRow {
  id: string;
  business_id: string;
  user_id: string;
  chat_session_id: string | null;
  service_id: string;
  service_name: string;
  service_duration_minutes: number;
  starts_at: Date;
  ends_at: Date;
  status: AppointmentStatus;
  source: AppointmentSource;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id,
    chatSessionId: row.chat_session_id,
    service: {
      id: row.service_id,
      name: row.service_name,
      durationMinutes: row.service_duration_minutes,
    },
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    source: row.source,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

const APPOINTMENT_SELECT = `
  SELECT a.id,
         a.business_id,
         a.user_id,
         a.chat_session_id,
         a.service_id,
         s.name              AS service_name,
         s.duration_minutes  AS service_duration_minutes,
         a.starts_at,
         a.ends_at,
         a.status,
         a.source,
         a.customer_name,
         a.customer_email,
         a.customer_phone,
         a.notes,
         a.created_at,
         a.updated_at
    FROM appointments a
    JOIN services s ON s.id = a.service_id
`;

export interface InsertAppointmentInput {
  businessId: string;
  userId: string;
  serviceId: string;
  chatSessionId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  startsAt: Date;
  endsAt: Date;
  source: AppointmentSource;
  notes: string | null;
}

export const appointmentRepository = {
  /** Inserts an appointment; may raise SQLSTATE 23P01 from `appointments_no_overlap`, which the service turns into a 409. */
  async insert(input: InsertAppointmentInput, client?: PoolClient): Promise<Appointment> {
    const sql = `
      WITH inserted AS (
        INSERT INTO appointments (
          business_id, user_id, service_id, chat_session_id,
          customer_name, customer_email, customer_phone,
          starts_at, ends_at, source, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      )
      ${APPOINTMENT_SELECT.replace('FROM appointments a', 'FROM inserted a')}
    `;

    const params = [
      input.businessId,
      input.userId,
      input.serviceId,
      input.chatSessionId,
      input.customerName,
      input.customerEmail,
      input.customerPhone,
      input.startsAt,
      input.endsAt,
      input.source,
      input.notes,
    ];

    const result = client
      ? await client.query<AppointmentRow>(sql, params)
      : await query<AppointmentRow>(sql, params);

    const row = result.rows[0];

    if (!row) {
      throw new Error('Appointment insert returned no row');
    }

    return toAppointment(row);
  },

  /** Loads one appointment in a tenant; ownership is settled in the service, since staff may read a colleague's booking. */
  async findById(businessId: string, appointmentId: string): Promise<Appointment | null> {
    const result = await query<AppointmentRow>(
      `${APPOINTMENT_SELECT} WHERE a.business_id = $1 AND a.id = $2 LIMIT 1`,
      [businessId, appointmentId],
    );

    const row = result.rows[0];
    return row ? toAppointment(row) : null;
  },

  /** Lists a user's appointments; predicates are appended positionally so no user input is ever concatenated into SQL. */
  async listForUser(
    businessId: string,
    userId: string,
    filters: ListAppointmentsQuery,
  ): Promise<{ appointments: Appointment[]; total: number }> {
    const conditions = ['a.business_id = $1', 'a.user_id = $2'];
    const params: unknown[] = [businessId, userId];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (filters.from) {
      params.push(new Date(filters.from));
      conditions.push(`a.starts_at >= $${params.length}`);
    }

    if (filters.to) {
      params.push(new Date(filters.to));
      conditions.push(`a.starts_at <= $${params.length}`);
    }

    if (filters.scope === 'upcoming') {
      conditions.push('a.starts_at >= now()');
    } else if (filters.scope === 'past') {
      conditions.push('a.starts_at < now()');
    }

    const where = conditions.join(' AND ');

    // Upcoming reads best soonest-first; history reads best most-recent-first.
    const orderDirection = filters.scope === 'upcoming' ? 'ASC' : 'DESC';

    const offset = (filters.page - 1) * filters.pageSize;
    params.push(filters.pageSize, offset);

    const rows = await query<AppointmentRow>(
      `${APPOINTMENT_SELECT}
        WHERE ${where}
        ORDER BY a.starts_at ${orderDirection}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const totals = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM appointments a WHERE ${where}`,
      params.slice(0, params.length - 2),
    );

    return {
      appointments: rows.rows.map(toAppointment),
      total: totals.rows[0]?.count ?? 0,
    };
  },

  /** Live bookings intersecting a window; excludes cancelled/completed to stay in sync with the exclusion constraint's predicate. */
  async findOverlapping(
    businessId: string,
    windowStart: Date,
    windowEnd: Date,
  ): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
    const result = await query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at
         FROM appointments
        WHERE business_id = $1
          AND status IN ('pending', 'confirmed')
          AND tstzrange(starts_at, ends_at, '[)') && tstzrange($2, $3, '[)')
        ORDER BY starts_at ASC`,
      [businessId, windowStart, windowEnd],
    );

    return result.rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at }));
  },

  /** Applies a status change that the service layer has already validated. */
  async updateStatus(
    businessId: string,
    appointmentId: string,
    status: AppointmentStatus,
  ): Promise<Appointment | null> {
    // `$3` is cast explicitly: it is referenced twice, and without the cast PostgreSQL cannot deduce one parameter type.
    const result = await query<{ id: string }>(
      `UPDATE appointments
          SET status = $3::appointment_status,
              cancelled_at = CASE
                               WHEN $3::appointment_status = 'cancelled' THEN now()
                               ELSE NULL
                             END
        WHERE business_id = $1 AND id = $2
        RETURNING id`,
      [businessId, appointmentId, status],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(businessId, appointmentId);
  },

  /** Moves an appointment to a new window that the service layer has validated. */
  async reschedule(
    businessId: string,
    appointmentId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Appointment | null> {
    const result = await query<{ id: string }>(
      `UPDATE appointments
          SET starts_at = $3, ends_at = $4
        WHERE business_id = $1
          AND id = $2
          AND status IN ('pending', 'confirmed')
        RETURNING id`,
      [businessId, appointmentId, startsAt, endsAt],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.findById(businessId, appointmentId);
  },
};
