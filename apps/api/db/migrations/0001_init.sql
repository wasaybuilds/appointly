-- ---------------------------------------------------------------------------
-- 0001_init.sql — Appointly core schema
--
-- Design notes (expanded in docs/DATABASE.md):
--   * Every tenant-owned table carries `business_id`. The column is redundant on
--     child tables that could reach it through a join, but denormalising it is a
--     deliberate trade: it lets every tenant-scoped query filter on a single
--     leading index column and is what a future row-level-security policy would
--     key on.
--   * Enumerated states are PostgreSQL enum types rather than free text, so an
--     application bug cannot write a state the domain does not define.
--   * All timestamps are `timestamptz`. Storing wall-clock time without an
--     offset is the classic scheduling bug; the business timezone lives on the
--     `businesses` row and is applied at render time.
-- ---------------------------------------------------------------------------

-- gen_random_uuid() for primary keys; digest() is not used, pgcrypto is enough.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Case-insensitive text: emails and service names compare correctly without
-- forcing every query to remember lower().
CREATE EXTENSION IF NOT EXISTS citext;
-- Lets a GiST exclusion constraint mix equality (business_id) with range
-- overlap (the appointment window). This is what makes double booking
-- impossible at the storage layer instead of merely unlikely.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- --------------------------------------------------------------------------
-- Enum types
-- --------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');
CREATE TYPE appointment_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');
CREATE TYPE appointment_source AS ENUM ('chat', 'form');
CREATE TYPE chat_message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE chat_session_status AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE ai_call_status AS ENUM ('success', 'invalid_output', 'provider_error', 'timeout');

-- --------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest without trusting the application
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- businesses — the tenant boundary
-- --------------------------------------------------------------------------
CREATE TABLE businesses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL CHECK (length(btrim(name)) > 0),
  slug          citext      NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{2,60}$'),
  timezone      text        NOT NULL DEFAULT 'UTC',
  -- Opening hours are stored as whole hours in the business timezone. Enough
  -- for slot validation in this prototype; a real system would model
  -- per-weekday ranges and exceptions in a separate table.
  open_hour     smallint    NOT NULL DEFAULT 9  CHECK (open_hour BETWEEN 0 AND 23),
  close_hour    smallint    NOT NULL DEFAULT 18 CHECK (close_hour BETWEEN 1 AND 24),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT businesses_hours_ordered CHECK (close_hour > open_hour)
);

CREATE TRIGGER businesses_set_updated_at
  BEFORE UPDATE ON businesses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------------
-- services — what can be booked, and for how long
-- --------------------------------------------------------------------------
CREATE TABLE services (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid        NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  name             citext      NOT NULL CHECK (length(btrim(name)) > 0),
  description      text,
  duration_minutes integer     NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480),
  price_cents      integer     CHECK (price_cents IS NULL OR price_cents >= 0),
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_unique_name_per_business UNIQUE (business_id, name)
);

CREATE TRIGGER services_set_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Catalogue lookups always filter by tenant and hide retired services.
CREATE INDEX services_active_by_business_idx
  ON services (business_id, name)
  WHERE is_active;

-- --------------------------------------------------------------------------
-- users — authentication and profile
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid        NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  email         citext      NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  password_hash text        NOT NULL,
  full_name     text        NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone         text,
  role          user_role   NOT NULL DEFAULT 'customer',
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Scoped to the tenant: the same person may hold an account with two
  -- different businesses on the platform.
  CONSTRAINT users_unique_email_per_business UNIQUE (business_id, email)
);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Login resolves a tenant from the email alone, so email needs its own index;
-- the composite unique constraint above cannot serve a business_id-less lookup.
CREATE INDEX users_email_idx ON users (email);

-- --------------------------------------------------------------------------
-- refresh_tokens — rotating refresh-token store
--
-- Only the SHA-256 digest is persisted. A database leak therefore does not hand
-- an attacker usable sessions, and rotation is auditable through replaced_by_id.
-- --------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash     text        NOT NULL UNIQUE,
  expires_at     timestamptz NOT NULL,
  revoked_at     timestamptz,
  replaced_by_id uuid        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Supports "revoke every live session for this user" and the nightly cleanup of
-- expired rows without scanning revoked history.
CREATE INDEX refresh_tokens_active_idx
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;

-- --------------------------------------------------------------------------
-- chat_sessions — one conversation with the booking assistant
--
-- message_count and last_message_at are maintained counters. They denormalise
-- data derivable from chat_messages, which is the point: the session list is
-- read on every page load and must not aggregate the message table to render.
-- --------------------------------------------------------------------------
CREATE TABLE chat_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid                NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id         uuid                NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title           text,
  status          chat_session_status NOT NULL DEFAULT 'active',
  message_count   integer             NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  last_message_at timestamptz,
  -- Free-form conversation metadata (last extracted booking draft, client
  -- locale, ...). jsonb keeps prototype-stage fields out of the DDL churn.
  metadata        jsonb               NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz         NOT NULL DEFAULT now(),
  updated_at      timestamptz         NOT NULL DEFAULT now()
);

CREATE TRIGGER chat_sessions_set_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Drives the sidebar: a user's conversations, most recently active first.
CREATE INDEX chat_sessions_by_user_recent_idx
  ON chat_sessions (user_id, last_message_at DESC NULLS LAST);

CREATE INDEX chat_sessions_by_business_idx ON chat_sessions (business_id, created_at DESC);

-- --------------------------------------------------------------------------
-- chat_messages — the conversation transcript
-- --------------------------------------------------------------------------
CREATE TABLE chat_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid              NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  role        chat_message_role NOT NULL,
  content     text              NOT NULL CHECK (length(content) > 0),
  -- Populated from the provider's usage report; null for locally generated
  -- fallback replies that never reached the model.
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  created_at  timestamptz       NOT NULL DEFAULT now()
);

-- Every read is "the transcript of one session in order", and the AI memory
-- window is the tail of exactly this index.
CREATE INDEX chat_messages_by_session_idx ON chat_messages (session_id, created_at);

-- --------------------------------------------------------------------------
-- appointments — the booking itself
-- --------------------------------------------------------------------------
CREATE TABLE appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     uuid               NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  user_id         uuid               NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  service_id      uuid               NOT NULL REFERENCES services (id) ON DELETE RESTRICT,
  -- Provenance: which conversation produced this booking. Nulled rather than
  -- cascaded so deleting a chat never destroys a real appointment.
  chat_session_id uuid               REFERENCES chat_sessions (id) ON DELETE SET NULL,
  customer_name   text               NOT NULL CHECK (length(btrim(customer_name)) > 0),
  customer_email  citext             NOT NULL,
  customer_phone  text,
  starts_at       timestamptz        NOT NULL,
  ends_at         timestamptz        NOT NULL,
  status          appointment_status NOT NULL DEFAULT 'pending',
  source          appointment_source NOT NULL DEFAULT 'form',
  notes           text CHECK (notes IS NULL OR length(notes) <= 1000),
  cancelled_at    timestamptz,
  created_at      timestamptz        NOT NULL DEFAULT now(),
  updated_at      timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT appointments_window_ordered CHECK (ends_at > starts_at),
  -- A cancelled row must record when, and only a cancelled row may.
  CONSTRAINT appointments_cancelled_consistency CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  ),
  -- The real double-booking guard. Two live appointments for the same tenant
  -- may not overlap in time. Enforced by the storage engine, so it holds under
  -- concurrency where an application-level "check then insert" would not.
  -- Prototype assumption: one bookable resource per business. Adding a
  -- `resource_id` column to this constraint is the extension path.
  CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
    business_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

CREATE TRIGGER appointments_set_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tenant calendar view: "what is booked for this business in this window".
CREATE INDEX appointments_business_schedule_idx ON appointments (business_id, starts_at);

-- The customer's own list, newest first — the most frequent authenticated read.
CREATE INDEX appointments_by_user_idx ON appointments (user_id, starts_at DESC);

-- Partial index for the operational view (today's live bookings). Excluding
-- cancelled and completed rows keeps it small as history accumulates.
CREATE INDEX appointments_live_idx
  ON appointments (business_id, starts_at)
  WHERE status IN ('pending', 'confirmed');

-- Attribution queries: how many bookings did the assistant actually produce.
CREATE INDEX appointments_by_chat_session_idx
  ON appointments (chat_session_id)
  WHERE chat_session_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- ai_interaction_logs — observability for every model call
--
-- Written for both successes and failures. Payloads are stored as jsonb so the
-- prompt/response shape can evolve without a migration, and the table is
-- deliberately append-only: it is a log, not domain state.
-- --------------------------------------------------------------------------
CREATE TABLE ai_interaction_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id       uuid          REFERENCES businesses (id) ON DELETE SET NULL,
  user_id           uuid          REFERENCES users (id) ON DELETE SET NULL,
  session_id        uuid          REFERENCES chat_sessions (id) ON DELETE SET NULL,
  provider          text          NOT NULL,
  model             text          NOT NULL,
  status            ai_call_status NOT NULL,
  latency_ms        integer       NOT NULL CHECK (latency_ms >= 0),
  prompt_tokens     integer       CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer       CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  request_payload   jsonb         NOT NULL DEFAULT '{}'::jsonb,
  response_payload  jsonb,
  error_message     text,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

-- Debugging entry point: "show me the failures from the last hour".
CREATE INDEX ai_logs_status_recent_idx ON ai_interaction_logs (status, created_at DESC);

-- Replaying a single conversation's model calls in order.
CREATE INDEX ai_logs_by_session_idx ON ai_interaction_logs (session_id, created_at);
