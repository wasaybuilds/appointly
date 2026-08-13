# Architecture

## The idea in one paragraph

A booking either exists or it does not, and exactly one piece of code gets to
decide. Everything else — the chat, the form, the socket layer — is an interface
onto that decision. The AI is a particularly capable interface, not a privileged
one.

---

## Layers

```
HTTP request
   │
   ├─ middleware      correlation id → logging → CORS → body parse → rate limit
   │
   ├─ routes          path, method, which schema, which middleware
   │
   ├─ controller      HTTP ⇄ service translation; cookies; realtime emit
   │
   ├─ service         business rules; the only place a decision is made
   │
   └─ repository      SQL; parameterised; tenant-scoped
          │
          └─ PostgreSQL   constraints as the final authority
```

The rule is that dependencies point downward only. A repository never imports a
service; a service never touches `req` or `res`. This is what allows the booking
rules to be exercised from a test, a form submission, or a chat turn without any
of them knowing about the others.

### Why controllers emit realtime events, not services

`appointmentService.create` returns an appointment. It does not know a WebSocket
exists. The controller emits after the service returns, which guarantees two
things: nothing is broadcast before it is committed, and the service stays usable
from contexts with no socket at all (the smoke test, a future cron job, a CLI).

---

## The shared contract package

`packages/shared` holds the Zod schemas, inferred types, domain constants and the
Socket.IO event contract. Both applications import from it.

This is the difference between an API contract that is *documented* and one that
is *enforced*. When `createAppointmentSchema` gains a required field, the web
client stops compiling. There is no version of this codebase where the client and
server disagree about a payload shape and it is discovered in production.

It also means validation rules exist once. The password strength rule the signup
form shows the user is the same object the API validates against.

---

## Request flow: booking through the chat

This is the path that ties everything together.

1. **`POST /chat/sessions/:id/messages`** — rate limited more tightly than other
   routes, because it is the one that triggers a paid model call.
2. **Persist the user's message** and update the session counters in a
   transaction. This happens *before* the model is called, so a provider outage
   cannot lose what the customer said.
3. **Emit `chat:message` and `chat:typing`** so other tabs see the message and the
   indicator immediately.
4. **Build the prompt** from live tenant data: the real service catalogue, the
   real opening hours, the current timestamp, the signed-in customer's name and
   email. Conversation memory is the last twelve turns.
5. **Call Mistral in JSON mode** with an explicit timeout and one retry on
   transient failures.
6. **Validate the response.** Extract the first balanced JSON object, parse it,
   and run it through `assistantResponseSchema`. Anything that fails is discarded
   — a malformed response is treated exactly like a provider outage.
7. **Re-resolve every value.** The service name is looked up in the catalogue; an
   ambiguous match returns nothing. The timestamp is parsed and validated.
8. **Decide.** If everything resolved, the model said it was ready, and confidence
   is at least 0.6, call `appointmentService.create` — the same function the form
   calls. Otherwise return `collecting` or `needs_form`.
9. **Persist the assistant's reply**, appending a confirmation line written from
   the database row rather than from anything the model claimed.
10. **Emit** the message, the booking outcome, and — if a booking happened — an
    `appointment:created` event to the user's room.
11. **Return the whole turn** over HTTP: both messages plus the outcome.

Step 11 matters. The client is fully functional from the HTTP response alone; the
realtime events exist to update *other* tabs. A failed WebSocket connection
degrades multi-tab sync, not the product.

---

## Guardrails, concretely

| Risk | Control |
| --- | --- |
| Model invents a service | Name resolved against the tenant catalogue; ambiguity resolves to nothing |
| Model invents a time | Parsed, then validated against opening hours, notice period and horizon |
| Model claims a booking it did not make | Confirmation line written from the persisted row |
| Model returns prose instead of JSON | Balanced-object extraction, then Zod; failure routes to fallback |
| Model is confidently wrong | Confidence below 0.6 routes to the form |
| Provider is down or slow | Timeout, one retry, then deterministic fallback |
| Conversation goes in circles | After eight messages, hand off to the form |
| Two customers book the same slot | PostgreSQL exclusion constraint; 23P01 becomes a 409 |

The last row is the important one: it is the only guarantee that holds under
concurrency, and it lives in the database rather than in application code.

---

## Authentication

Access tokens live 15 minutes, refresh tokens 7 days. Both are httpOnly cookies:
JavaScript cannot read them, so an XSS bug cannot exfiltrate a session.

Refresh tokens are stored as SHA-256 hashes and rotated on every use. If a token
is presented twice — the signature of a stolen token being replayed — the entire
token family is revoked, not just that one token.

The refresh cookie is scoped to the refresh endpoint's path, so the browser never
transmits it on ordinary API calls.

Passwords use Node's built-in `scrypt` rather than argon2 or bcrypt. Both of those
are native modules that need a compiler toolchain; `scrypt` ships with Node, is
memory-hard, and removes an entire class of "works on my machine" failures from
the setup instructions. The parameters are stored alongside each hash, so they can
be raised later without invalidating existing passwords.

---

## Realtime

Socket.IO, authenticated at the handshake using the same httpOnly cookie as REST —
there is no second token to manage.

Two room types:

- `user:{userId}` — joined automatically. Carries appointment events, so a booking
  made in the chat refreshes the appointments list in another tab.
- `session:{sessionId}` — joined on request. Carries chat messages, typing
  indicators and booking outcomes.

**The socket accepts no writes.** Every state change goes through REST. That keeps
validation, authorisation and rate limiting in one place instead of two
implementations that slowly diverge.

Emission is best-effort: `notifier.ts` swallows and logs failures, because the
HTTP write has already been committed and the client already has its answer.

---

## Frontend

**Route groups.** `(auth)` for signed-out screens, `(app)` for the authenticated
shell. Each group's layout owns its redirect.

**No Next middleware for auth.** The session cookie is set by the API, which in
production is a different origin, so middleware could not read it reliably. A
guard that only works in local development is worse than none, because it hides
the problem. The redirect is a client-side convenience; the real boundary is the
API rejecting unauthenticated requests.

**Derived state over synced state.** The chat transcript is computed during render
from the session query plus a buffer of messages received since. Copying server
data into local state with an effect is how you end up with two sources of truth
that drift.

**Resetting via `key`.** When the assistant extracts new details, the booking
panel changes the form's React `key`, remounting it with the new values. This is
React's own answer to "reset state when a prop changes" and is far more
predictable than synchronising props into state inside the component.

**One loading component.** Every pending state renders `<Loading />`, so loading
looks and — more importantly — is *announced* the same everywhere.

**Phone numbers via `react-phone-number-input`.** Country list, dial codes and
as-you-type formatting are a library's job, not hand-rolled. It emits one E.164
string, so a country code and a national number can never drift apart in state.

---

## Design system

Four colours, defined once as Tailwind v4 `@theme` tokens in `globals.css`:
`ink` (near-black, with a tint scale for borders and secondary text), `paper`
(white), `accent` (a single blue) and `alert` (red). Everything else is a tint of
`ink`.

**No shadows, no gradients.** Depth comes from 1px rules, whitespace and type
scale. A flat, border-driven surface stays legible at any zoom level, prints
sensibly, and does not depend on the elevation cues that shadows imply but
rarely earn in a form-heavy product.

**Colour is never the only signal.** Appointment status pairs a dot with a text
label, and alerts pair a hue with an icon, so meaning survives both the narrow
palette and colour-blind viewing.

The assessment states that branding polish is not evaluated but that layout,
spacing and interaction detail are. The system is deliberately built for the
second: a narrow palette removes the decisions that do not matter so the ones
that do — rhythm, hierarchy, focus states — get the attention.

---

## Error handling

One error type, `AppError`, created through `createAppError`. It carries an HTTP
status, a stable machine-readable code, a message safe to show a user, optional
field-level issues, and structured context that is logged but never serialised to
the client.

The error middleware translates it into the response envelope. Anything that is
*not* an `AppError` is by definition unexpected: it is logged in full with the
request id and returned as a generic 500, so an internal message or stack trace
can never leak.

PostgreSQL errors are classified by SQLSTATE before they reach that point, so a
unique violation becomes a 409 with a useful message rather than an opaque 500.

On the client, `ApiError` carries the same code, which lets components branch on
the specific failure — refreshing availability when a slot was taken, mapping
field issues back onto form inputs — instead of showing one generic message.
