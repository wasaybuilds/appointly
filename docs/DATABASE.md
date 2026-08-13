# Database

PostgreSQL, accessed with parameterised SQL through `pg`. The schema lives in
[`apps/api/db/migrations/0001_init.sql`](../apps/api/db/migrations/0001_init.sql),
which is heavily commented; this document explains the reasoning behind it.

---

## Tables

| Table | Holds |
| --- | --- |
| `businesses` | Tenant. Timezone and opening hours |
| `services` | What can be booked, and for how long |
| `users` | Accounts, scoped to a tenant |
| `refresh_tokens` | Hashed, rotating refresh tokens |
| `chat_sessions` | One conversation with the assistant |
| `chat_messages` | The transcript |
| `appointments` | The bookings |
| `ai_interaction_logs` | Every model call, successful or not |

---

## The constraint that matters

```sql
CONSTRAINT appointments_no_overlap EXCLUDE USING gist (
  business_id                          WITH =,
  tstzrange(starts_at, ends_at, '[)')  WITH &&
) WHERE (status IN ('pending', 'confirmed'))
```

Two live appointments for the same business may not overlap in time.

This is the single most important line in the schema, because it is the only
double-booking guard that survives concurrency. An application-level check —
"query for conflicts, then insert" — has a window between the two statements. Two
requests can both read an empty calendar and both insert. The window is small,
which is worse than large: it means the bug appears in production under load and
never in testing.

An `EXCLUDE` constraint is evaluated by the storage engine at insert time. There
is no window.

Three details:

- **`btree_gist`** is required to mix an equality operator (`business_id WITH =`)
  with a range operator (`WITH &&`) in one GiST index. Plain GiST cannot index the
  UUID equality.
- **`'[)'`** makes the range half-open: an appointment ending at 10:00 and one
  starting at 10:00 do not overlap. Back-to-back bookings are legal, which is what
  a receptionist would expect.
- **The `WHERE` clause** means cancelled and completed rows stop occupying the
  calendar. `appointmentRepository.findOverlapping` uses the same predicate, and
  the two are deliberately kept in sync.

The API catches SQLSTATE `23P01` on this constraint and returns a 409 with
`APPOINTMENT_SLOT_TAKEN`. The `test:smoke` script asserts this.

**Prototype assumption:** one bookable resource per business. Supporting multiple
staff members means adding `resource_id` to the constraint — the shape does not
otherwise change.

---

## Multi-tenancy

Every tenant-owned table carries `business_id`, including tables that could reach
it through a join. That denormalisation is deliberate:

1. Every tenant-scoped query filters on a single leading index column instead of
   joining upward to find its tenant.
2. The exclusion constraint above *requires* `business_id` on `appointments`.
3. It is the column a future row-level security policy would key on.

Every repository method takes `businessId` as a required first argument. Making
the tenant an explicit, non-optional parameter means it is very hard to write a
query here that accidentally spans tenants.

---

## Time

All timestamps are `timestamptz`. Storing wall-clock time without an offset is the
classic scheduling bug: it works until daylight saving, and then quietly moves
appointments by an hour.

The business timezone lives on the `businesses` row. Opening hours are whole hours
in that timezone, applied at validation time by `lib/time/timezone.ts` using
`Intl` — which is DST-correct and ships with Node.

The split is intentional: instants are absolute in the database, business rules
are evaluated in the *business* timezone, and the UI renders in the *viewer's*
timezone.

---

## Indexes

Each one exists for a query the application actually runs.

| Index | Serves |
| --- | --- |
| `services_active_by_business_idx` (partial, `WHERE is_active`) | Catalogue listing; retired services stay out of the index |
| `users_email_idx` | Login resolves a tenant from the email alone, so the composite unique constraint cannot serve it |
| `refresh_tokens_active_idx` (partial, `WHERE revoked_at IS NULL`) | "Revoke all live sessions"; skips revoked history |
| `chat_sessions_by_user_recent_idx` | Conversation list, most recent first |
| `chat_messages_by_session_idx` | Transcript in order — the AI memory window is the tail of this index |
| `appointments_by_user_idx` | The customer's own list; the most frequent authenticated read |
| `appointments_business_schedule_idx` | Tenant calendar for a window |
| `appointments_live_idx` (partial) | Operational "today's live bookings"; stays small as history grows |
| `appointments_by_chat_session_idx` (partial) | Attribution: how many bookings the assistant produced |
| `ai_logs_status_recent_idx` | "Show me the failures from the last hour" |

Partial indexes are used wherever a query has a permanent predicate. They are
smaller, they stay hot in cache, and they do not grow with rows the query will
never return.

---

## Enums and check constraints

States are PostgreSQL enum types, not free text. An application bug cannot write a
status the domain does not define.

Check constraints encode invariants the application must not be trusted to
maintain alone:

- `appointments_window_ordered` — `ends_at > starts_at`.
- `appointments_cancelled_consistency` — a cancelled row records *when*, and only
  a cancelled row may.
- `businesses_hours_ordered` — closing time is after opening time.
- Length and format checks on names, emails and notes.

`updated_at` is maintained by a trigger rather than by the application, so it
stays honest no matter which code path performed the write.

---

## `citext`

Emails and service names use `citext`, so comparisons are case-insensitive without
every query having to remember `lower()`. Forgetting it once is how duplicate
accounts get created.

---

## Migrations

`apps/api/src/db/migrate.ts` applies numbered files from `db/migrations/` in
order, each inside a transaction, recording applied filenames in a `migrations`
table. Re-running is safe.

```bash
pnpm db:migrate   # apply pending migrations
pnpm db:seed      # load demo data
```

The runner is intentionally about eighty lines. A migration tool is worth adopting
when there are enough migrations to need branching, squashing and down-migrations;
at one file it would be a dependency and a mental model in exchange for nothing.

---

## Connection and TLS

`DATABASE_SSL` defaults to true, because managed providers refuse plaintext
connections.

`sslmode` is stripped from the connection string and TLS is configured explicitly
through the `ssl` option instead. `pg` currently maps `sslmode=require` onto
`verify-full` semantics — stricter than libpq, and a behaviour it has announced
will change in the next major version. Depending on which interpretation is in
force would be fragile.

Without `DATABASE_CA_CERT`, the connection is encrypted but the certificate chain
is not verified. Supplying the provider's CA certificate upgrades it to full
verification. This is noted as a known gap in [`DECISIONS.md`](./DECISIONS.md).
