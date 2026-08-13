# Appointly

An AI-assisted appointment booking application. Customers book by describing what
they want in plain language; when the assistant cannot finish the job, a
structured form takes over pre-filled with everything already understood.

Built for the Full Stack Developer technical assessment. The requirements it
answers are in [`ASSESSMENT.md`](./ASSESSMENT.md).

---

## What it does

- **Sign up and sign in** with JWT access and refresh tokens in httpOnly cookies.
- **Chat to book.** The assistant reads the real service catalogue and opening
  hours, resolves phrases like "next Tuesday at 3" into an absolute time, and
  books the appointment.
- **Always-available fallback.** When the model is unavailable, unsure, or the
  conversation stalls, the structured booking form appears pre-filled. A customer
  can always complete a booking.
- **Manage appointments.** List, filter, paginate, reschedule and cancel.
- **Realtime updates.** A booking made in the chat appears in the appointments
  tab immediately, in every open tab.
- **Auditable AI.** Every model call — success, timeout, or malformed output — is
  recorded with latency and token usage.

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | One type system across the whole stack |
| Monorepo | pnpm workspaces | Shares the API contract as real types, not documentation |
| API | Node 20 + Express 5 | Small, explicit, no framework magic to explain |
| Database | PostgreSQL (Aiven) + raw SQL via `pg` | The scheduling rules need real SQL; see below |
| Validation | Zod, shared between client and server | The rules cannot drift |
| Auth | JWT + httpOnly cookies, scrypt hashing | Tokens unreadable to JavaScript |
| AI | Mistral (`mistral-small-latest`) | Free tier, JSON mode, OpenAI-compatible |
| Realtime | Socket.IO | Rooms and reconnection handled for us |
| Frontend | Next.js 16 (App Router), React 19 | Modern baseline |
| Data fetching | TanStack Query | Caching and invalidation without hand-rolled state |
| Styling | Tailwind CSS v4 | Design tokens in CSS, no config file |
| Forms | React Hook Form + `react-phone-number-input` | Country codes and E.164 formatting are a solved problem |
| Logging | Pino | Structured JSON with redaction |

**No ORM, deliberately.** The correctness of this application rests on a
PostgreSQL exclusion constraint (`btree_gist` over a `tstzrange`) that prevents
double-booking under concurrency. No mainstream TypeScript ORM models that, so an
ORM would have meant hand-written SQL for the one part that matters plus an
abstraction over the parts that do not. See [`docs/DECISIONS.md`](./docs/DECISIONS.md).

---

## Running it

### Requirements

- Node.js 20.11+
- pnpm 9+
- A PostgreSQL database (any managed provider: Aiven, Neon, Supabase, RDS)
- A Mistral API key — free at <https://console.mistral.ai>. Optional: without one
  the app runs in deterministic fallback mode.

### Setup

```bash
pnpm install

# Configure the API
cp apps/api/.env.example apps/api/.env
#   set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, MISTRAL_API_KEY

# Configure the web client
cp apps/web/.env.example apps/web/.env.local

# Build the shared contract package, then create and seed the schema
pnpm --filter @appointly/shared build
pnpm db:migrate
pnpm db:seed
```

Or in one step, once the env files exist:

```bash
pnpm setup
```

### Start

```bash
pnpm dev
```

- Web: <http://localhost:3000>
- API: <http://localhost:4000>
- Health: <http://localhost:4000/health>

### Demo account

Seeded by `pnpm db:seed`:

| Email | Password |
| --- | --- |
| `demo@appointly.dev` | `DemoPass123!` |

### Try it

Sign in as the demo customer and type:

> I'd like a dental check-up next Tuesday at 2pm

The assistant will confirm and book it. Then try:

> book me a haircut

It will ask for a time rather than guessing — and if you keep the conversation
going without settling on one, the form takes over with the service already
selected.

---

## Verifying it works

```bash
pnpm typecheck     # strict TypeScript across all three packages
pnpm lint          # ESLint, type-aware rules, zero warnings tolerated
pnpm build         # production build of shared, API and web
pnpm test:smoke    # end-to-end API test against a running server
```

`pnpm test:smoke` drives the real flow against `localhost:4000` using a cookie
jar, covering authentication, validation errors, availability, the double-booking
constraint, past and out-of-hours rejection, rescheduling (including the refusal
to move a cancelled booking), cancellation, a two-turn AI booking, multi-turn
memory, and anonymous access rejection.

---

## Layout

```
apps/
  api/                     Express API
    db/migrations/         Numbered SQL migrations
    db/seed.sql            Demo data
    scripts/smoke-test.mjs End-to-end API test
    src/
      config/              Env loading and validation
      db/                  Connection pool, migrate and seed runners
      lib/                 Errors, logging, HTTP helpers, time helpers
      middleware/          Context, logging, validation, auth, rate limits, errors
      modules/
        ai/                Mistral client, prompt, guardrails, fallback, logging
        appointments/      Scheduling rules, repository, service, routes
        auth/              Passwords, tokens, cookies, repository, service
        catalog/           Services and opening hours
        chat/              Conversation orchestration — where AI meets booking
      realtime/            Socket.IO server and notifier
  web/                     Next.js client
    src/
      app/                 Routes: (auth) and (app) groups
      components/          UI primitives, chat, appointments, providers
      hooks/               Realtime subscription
      lib/                 API client, query keys, formatting
packages/
  shared/                  Zod schemas, types, constants, socket contract
docs/
  ARCHITECTURE.md          How the pieces fit and why
  DATABASE.md              Schema, indexes, constraints
  DECISIONS.md             Trade-offs, and what I would do with more time
```

---

## API

All routes are under `/api/v1`. Responses use one envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "total": 12 } }

// failure
{ "success": false, "error": { "code": "APPOINTMENT_SLOT_TAKEN", "message": "…", "requestId": "…" } }
```

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account, start a session |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/refresh` | Rotate tokens |
| `POST` | `/auth/logout` | Revoke the session |
| `GET` | `/auth/me` | Current user |
| `GET` | `/meta` | Runtime config (is AI enabled, opening hours) |
| `GET` | `/services` | Bookable services |
| `GET` | `/appointments` | List, filtered and paginated |
| `POST` | `/appointments` | Book |
| `GET` | `/appointments/availability` | Free slots for a service on a date |
| `GET` | `/appointments/:id` | One appointment |
| `PATCH` | `/appointments/:id/reschedule` | Move to a new time |
| `PATCH` | `/appointments/:id/status` | Confirm, complete, cancel |
| `POST` | `/chat/sessions/active` | Resume or start a conversation |
| `GET` | `/chat/sessions` | List conversations |
| `GET` | `/chat/sessions/:id` | Transcript |
| `POST` | `/chat/sessions/:id/messages` | Send a message, get the turn |

---

## How the AI is kept honest

The model interprets; it never decides. `chat.service.ts` takes the extraction and
re-resolves every value against real data before anything is written:

1. The response must parse as JSON **and** satisfy a Zod schema, or it is discarded.
2. The service name is looked up in the tenant's catalogue. An ambiguous phrase
   resolves to nothing rather than to a guess.
3. The timestamp is parsed and rejected if invalid.
4. Booking goes through the **same** `appointmentService.create` the form uses, so
   opening hours, notice period, booking horizon and slot availability are checked
   identically.
5. Self-reported confidence below 0.6 routes to the form instead of booking.
6. The confirmation sentence shown to the user is written from the persisted row,
   never from the model's own claim.

If any step fails, the turn resolves to `needs_form` with a plain-language reason
and the form appears pre-filled. Failure is a designed path, not an exception.

---

## Documentation

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — request flow, layering, realtime design
- [`docs/DATABASE.md`](./docs/DATABASE.md) — schema, indexes, the overlap constraint
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — trade-offs, known gaps, next steps
