# Decisions and trade-offs

What I chose, what I rejected, and what I would do next. Where a decision has a
downside, it is stated rather than defended.

---

## Raw SQL instead of an ORM

**Chose:** parameterised SQL through `pg`, in repository modules.

The correctness of this application rests on a PostgreSQL exclusion constraint
over a `tstzrange`, backed by `btree_gist`. No mainstream TypeScript ORM models
that. Prisma cannot express it in its schema language; Drizzle needs raw SQL for
it. So an ORM would have meant hand-written SQL for the one part that actually
matters, plus an abstraction layer over the parts that do not.

The queries here are also simple — filtered lists, single-row lookups, one
transaction. That is precisely the workload where an ORM adds the least.

**Cost:** row-to-domain mapping is written by hand in each repository, and there
is no compile-time link between a SQL column name and the TypeScript type it maps
to. Renaming a column is a manual search. With a larger schema I would reach for
Drizzle, which keeps SQL visible while typing the results.

---

## No AI SDK

**Chose:** `fetch` against the Mistral REST API.

The surface needed is one POST. In exchange for roughly eighty lines we get an
explicit timeout, a retry policy tuned to the fact that a user is waiting, no
transitive dependency churn from an SDK that reshapes between minor versions, and
a seam that is trivial to stub.

**Cost:** streaming would need implementing by hand, and switching providers means
writing another client rather than changing a config value. Given the response is
a single JSON object consumed atomically, streaming would not improve this UI.

---

## The AI never decides anything

This is the central design decision, and everything about the AI module follows
from it.

The model produces a *proposal*. `chat.service.ts` re-resolves every value against
real data and then calls the same `appointmentService.create` the structured form
calls. There is no code path where the assistant can write an appointment the form
could not have written.

Concretely, the model's output is: parsed as JSON, validated against a Zod schema,
its service name resolved against the tenant catalogue (ambiguity resolves to
nothing, not to a guess), its timestamp parsed and range-checked, and finally
checked against opening hours, notice period, horizon and the overlap constraint.
The confirmation sentence the customer reads is written from the persisted row,
never from the model's claim — a model that says "I've booked you in" when the
slot was taken must not be able to make that true in the UI.

**Cost:** the assistant can appear pedantic. If it extracts a service name that
matches two catalogue entries it returns nothing rather than picking one, which
means an extra turn. That is the right failure direction for something that
creates commitments in a calendar.

---

## Confidence threshold at 0.6

Below 0.6 self-reported confidence, the turn routes to the form regardless of what
the model claimed.

Self-reported confidence is not calibrated — it is a number the model produces,
not a probability. It is used as a *coarse* signal in one direction only: low
confidence can block a booking, but high confidence never bypasses any of the
validation above. Used that way, an uncalibrated signal is still useful.

**Cost:** the threshold is a guess. With production data I would tune it against
observed booking-error rates from `ai_interaction_logs`, which is exactly what
that table exists to make possible.

---

## The form is the same component in both places

The chat's fallback is not a simplified form. It is `BookingForm`, the same
component used standalone, with `prefill` populated.

A separate fallback implementation is a second thing to keep correct, and it would
be the one nobody tests — it only appears when something has already gone wrong.

**Cost:** the component carries a `prefill` prop and a `source` field it would not
otherwise need. A small price.

---

## Times are picked from server availability, not typed

The form has no free-text time input. It fetches `/appointments/availability` and
renders the free slots.

This removes the entire class of "you picked a time we are closed" errors before
the user can make them, and it means the client never has to know the opening
hours rules.

**Cost:** an extra request per date change, and the slot list can be stale by
seconds. The server re-validates on submit and the UI refreshes availability when
a slot is rejected, so staleness is recoverable rather than misleading.

---

## `scrypt` instead of argon2 or bcrypt

argon2id is the better algorithm. It is also a native module needing a compiler
toolchain, which on Windows means Visual Studio Build Tools — a genuine barrier to
someone cloning this to review it.

`scrypt` ships with Node, is memory-hard, and is what the Node crypto
documentation recommends when a native dependency is unwelcome. Parameters are
stored alongside each hash (`scrypt$N$r$p$salt$key`), so they can be raised later
without invalidating existing passwords.

**Cost:** slightly weaker resistance to GPU attack than argon2id at equivalent
cost. For production I would use argon2id and accept the build dependency.

---

## The socket layer accepts no writes

Every state change goes through REST. Socket.IO is a one-way notification channel.

Accepting writes over the socket would mean implementing validation, authorisation
and rate limiting twice, in two places that would slowly diverge. It would also
make the API untestable without a WebSocket client.

The client is designed to work correctly from HTTP responses alone; realtime keeps
*other* tabs in sync. A failed WebSocket connection degrades multi-tab sync, not
the product.

---

## Client-side route guarding, no Next middleware

The session cookie is set by the API, which in production is a different origin.
Next middleware could not read it reliably there. A guard that works only in local
development is worse than no guard, because it hides the problem until deployment.

The redirect is a convenience for the user. The real boundary is the API rejecting
unauthenticated requests, which it does regardless of what the client renders.

**Cost:** a brief loading state on first paint while `/auth/me` resolves.

---

## Known gaps

Things I would not ship without, called out honestly.

**No automated test suite.** There is an end-to-end smoke test
(`pnpm test:smoke`) covering the critical paths against a running server, and it
does catch real regressions — it found the SQL parameter-type bug in the status
update. But there are no unit tests. The first ones I would write are for
`scheduling.service.ts` (pure functions, high branch count, encodes the booking
policy) and for the JSON extraction in `booking-assistant.service.ts`.

**TLS chain is not verified by default.** Without `DATABASE_CA_CERT` the database
connection is encrypted but the certificate chain is unverified — equivalent to
libpq's `sslmode=require`. That defeats passive eavesdropping but not an active
man-in-the-middle. Supplying the provider's CA certificate closes it; the
plumbing is already there.

**Rate limiting is in-process.** `express-rate-limit` with the default memory
store means limits are per-instance. Behind two instances the effective limit
doubles. A Redis store is the fix.

**Opening hours are whole hours, one range, no exceptions.** No per-weekday hours,
no holidays, no lunch breaks. A real system models these in their own table.

**One bookable resource per business.** The overlap constraint keys on
`business_id`. Multiple staff means adding `resource_id` to the constraint.

**No email or notifications.** A booking is confirmed in the UI and nowhere else.

**Refresh token cleanup is not scheduled.** Expired rows accumulate. The index
exists to make the cleanup query cheap; the job that runs it does not.

**AI logs are unbounded.** `ai_interaction_logs` grows forever. It needs a
retention policy, and it is the sort of table that wants partitioning by month.

---

## What I would do next, in order

1. **Unit tests** for `scheduling.service.ts` and the assistant's JSON parsing,
   plus an integration test that hammers the overlap constraint concurrently.
2. **Redis** for rate limiting and for de-duplicating in-flight AI calls.
3. **Proper availability modelling** — per-weekday hours, exceptions, resources.
4. **Streaming assistant replies** over the socket channel that already exists.
5. **Tune the confidence threshold** against real data from `ai_interaction_logs`.
6. **Notifications** — confirmation email, reminder before the appointment.
7. **Row-level security** on `business_id`, so tenant isolation is enforced by the
   database rather than by discipline in the repository layer.
