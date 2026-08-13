import type { PoolClient } from 'pg';
import type {
  ChatMessage,
  ChatMessageRole,
  ChatSession,
  ChatSessionStatus,
  PaginationQuery,
} from '@appointly/shared';
import { query, withTransaction } from '../../db/pool';

interface SessionRow {
  id: string;
  business_id: string;
  user_id: string;
  title: string | null;
  status: ChatSessionStatus;
  message_count: number;
  last_message_at: Date | null;
  created_at: Date;
}

interface MessageRow {
  id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  created_at: Date;
}

function toSession(row: SessionRow): ChatSession {
  return {
    id: row.id,
    userId: row.user_id,
    businessId: row.business_id,
    title: row.title,
    status: row.status,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at ? row.last_message_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

const SESSION_COLUMNS = `
  id, business_id, user_id, title, status, message_count, last_message_at, created_at
`;

export const chatRepository = {
  /** Starts a new conversation for a user. */
  async createSession(
    businessId: string,
    userId: string,
    title: string | null,
  ): Promise<ChatSession> {
    const result = await query<SessionRow>(
      `INSERT INTO chat_sessions (business_id, user_id, title)
       VALUES ($1, $2, $3)
       RETURNING ${SESSION_COLUMNS}`,
      [businessId, userId, title],
    );

    const row = result.rows[0];

    if (!row) {
      throw new Error('Chat session insert returned no row');
    }

    return toSession(row);
  },

  /** Loads a session owned by the caller; tenant and owner are in the predicate, so no caller can forget the check. */
  async findSession(
    businessId: string,
    userId: string,
    sessionId: string,
  ): Promise<ChatSession | null> {
    const result = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
         FROM chat_sessions
        WHERE business_id = $1 AND user_id = $2 AND id = $3
        LIMIT 1`,
      [businessId, userId, sessionId],
    );

    const row = result.rows[0];
    return row ? toSession(row) : null;
  },

  /** Lists a user's conversations, most recently active first. */
  async listSessions(
    businessId: string,
    userId: string,
    pagination: PaginationQuery,
  ): Promise<{ sessions: ChatSession[]; total: number }> {
    const offset = (pagination.page - 1) * pagination.pageSize;

    const rows = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
         FROM chat_sessions
        WHERE business_id = $1 AND user_id = $2
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        LIMIT $3 OFFSET $4`,
      [businessId, userId, pagination.pageSize, offset],
    );

    const totals = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM chat_sessions
        WHERE business_id = $1 AND user_id = $2`,
      [businessId, userId],
    );

    return {
      sessions: rows.rows.map(toSession),
      total: totals.rows[0]?.count ?? 0,
    };
  },

  /** Returns the most recent active session, or starts one. */
  async findOrCreateActiveSession(businessId: string, userId: string): Promise<ChatSession> {
    const existing = await query<SessionRow>(
      `SELECT ${SESSION_COLUMNS}
         FROM chat_sessions
        WHERE business_id = $1 AND user_id = $2 AND status = 'active'
        ORDER BY last_message_at DESC NULLS LAST, created_at DESC
        LIMIT 1`,
      [businessId, userId],
    );

    const row = existing.rows[0];

    if (row) {
      return toSession(row);
    }

    return this.createSession(businessId, userId, null);
  },

  /** Reads a session transcript in order; `limit` keeps the tail, which is what both the UI and the model need. */
  async listMessages(sessionId: string, limit = 100): Promise<ChatMessage[]> {
    const result = await query<MessageRow>(
      `SELECT id, session_id, role, content, created_at
         FROM (
           SELECT id, session_id, role, content, created_at
             FROM chat_messages
            WHERE session_id = $1
            ORDER BY created_at DESC
            LIMIT $2
         ) recent
        ORDER BY created_at ASC`,
      [sessionId, limit],
    );

    return result.rows.map(toMessage);
  },

  /** Appends a message and bumps the session counters in one transaction; a crash between the two would leave `message_count` permanently wrong. */
  async appendMessage(input: {
    sessionId: string;
    role: ChatMessageRole;
    content: string;
    tokenCount: number | null;
    title?: string | null;
  }): Promise<ChatMessage> {
    return withTransaction(async (client: PoolClient) => {
      const inserted = await client.query<MessageRow>(
        `INSERT INTO chat_messages (session_id, role, content, token_count)
         VALUES ($1, $2, $3, $4)
         RETURNING id, session_id, role, content, created_at`,
        [input.sessionId, input.role, input.content, input.tokenCount],
      );

      const row = inserted.rows[0];

      if (!row) {
        throw new Error('Chat message insert returned no row');
      }

      await client.query(
        `UPDATE chat_sessions
            SET message_count = message_count + 1,
                last_message_at = now(),
                title = COALESCE(title, $2)
          WHERE id = $1`,
        [input.sessionId, input.title ?? null],
      );

      return toMessage(row);
    });
  },

  /** Marks a session completed once it has produced a booking; `metadata` is merged, not replaced, so other keys survive. */
  async markCompleted(sessionId: string, appointmentId: string): Promise<void> {
    await query(
      `UPDATE chat_sessions
          SET status = 'completed',
              metadata = metadata || jsonb_build_object('bookedAppointmentId', $2::text)
        WHERE id = $1`,
      [sessionId, appointmentId],
    );
  },
};
