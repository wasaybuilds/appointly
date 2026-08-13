-- ---------------------------------------------------------------------------
-- seed.sql — sample data for local development and review
--
-- Two tenants are seeded on purpose: it proves the `business_id` scoping is
-- real rather than decorative, and any query that forgets to filter by tenant
-- will visibly return the wrong rows.
--
-- Every statement is idempotent (`ON CONFLICT DO NOTHING`) so the file can be
-- re-run against an existing database without erroring.
--
-- Demo credentials (both tenants):
--   demo@appointly.dev    / DemoPass123!   (customer, Bright Smile Dental)
--   owner@appointly.dev   / DemoPass123!   (admin,    Bright Smile Dental)
--   patient@northside.dev / DemoPass123!   (customer, Northside Physio)
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- Tenants
-- --------------------------------------------------------------------------
INSERT INTO businesses (id, name, slug, timezone, open_hour, close_hour) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Bright Smile Dental', 'bright-smile', 'UTC', 9, 18),
  ('22222222-2222-4222-8222-222222222222', 'Northside Physio',    'northside-physio', 'UTC', 8, 17)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- Bookable services
-- --------------------------------------------------------------------------
INSERT INTO services (id, business_id, name, description, duration_minutes, price_cents, is_active) VALUES
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'Dental Check-up', 'Routine examination and cleaning.', 30, 6500, true),
  ('a2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'Teeth Whitening', 'Professional in-clinic whitening treatment.', 60, 18000, true),
  ('a3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'Emergency Consultation', 'Same-day assessment for dental pain.', 20, 4000, true),
  ('a4444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111',
   'Orthodontic Review', 'Follow-up for brace and aligner patients.', 45, 9000, false),
  ('a5555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
   'Physio Assessment', 'Initial musculoskeletal assessment.', 45, 7500, true),
  ('a6666666-6666-4666-8666-666666666666', '22222222-2222-4222-8222-222222222222',
   'Sports Massage', 'Deep-tissue recovery session.', 60, 8500, true)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- Users
--
-- password_hash is scrypt('DemoPass123!') in the self-describing format
-- produced by `hashPassword()`: scrypt$N$r$p$salt$key (all base64).
-- --------------------------------------------------------------------------
INSERT INTO users (id, business_id, email, password_hash, full_name, phone, role) VALUES
  ('c1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'demo@appointly.dev',
   'scrypt$65536$8$1$2w58NSQaVSPsSizUo4RELg==$EsePbOzC7gKBBAgchBr7AfDcHC54FTWF2vOtGXuBzZMMzqvfvi2dGFioXovuW+GhnHHC+oeJg1kQ2xkV5pTFbw==',
   'Dana Mitchell', '+1 555 0142', 'customer'),
  ('c2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'owner@appointly.dev',
   'scrypt$65536$8$1$2w58NSQaVSPsSizUo4RELg==$EsePbOzC7gKBBAgchBr7AfDcHC54FTWF2vOtGXuBzZMMzqvfvi2dGFioXovuW+GhnHHC+oeJg1kQ2xkV5pTFbw==',
   'Priya Raman', '+1 555 0188', 'admin'),
  ('c3333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
   'patient@northside.dev',
   'scrypt$65536$8$1$2w58NSQaVSPsSizUo4RELg==$EsePbOzC7gKBBAgchBr7AfDcHC54FTWF2vOtGXuBzZMMzqvfvi2dGFioXovuW+GhnHHC+oeJg1kQ2xkV5pTFbw==',
   'Marcus Webb', NULL, 'customer')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- A completed conversation with the booking assistant
-- --------------------------------------------------------------------------
INSERT INTO chat_sessions (id, business_id, user_id, title, status, message_count, last_message_at, metadata) VALUES
  ('d1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111',
   'Teeth whitening booking', 'completed', 4, now() - interval '2 hours',
   '{"lastIntent": "book_appointment", "bookedFromChat": true}'::jsonb)
ON CONFLICT DO NOTHING;

INSERT INTO chat_messages (id, session_id, role, content, token_count, created_at) VALUES
  ('e1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'user',
   'Hi, I''d like to book teeth whitening sometime tomorrow afternoon.', NULL,
   now() - interval '2 hours 3 minutes'),
  ('e2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'assistant',
   'Happy to help. Teeth Whitening takes 60 minutes. Would 2:00 PM tomorrow work, and can I take the name and email for the booking?',
   184, now() - interval '2 hours 2 minutes'),
  ('e3333333-3333-4333-8333-333333333333', 'd1111111-1111-4111-8111-111111111111', 'user',
   '2pm is perfect. Dana Mitchell, demo@appointly.dev', NULL,
   now() - interval '2 hours 1 minute'),
  ('e4444444-4444-4444-8444-444444444444', 'd1111111-1111-4111-8111-111111111111', 'assistant',
   'Booked — Teeth Whitening tomorrow at 2:00 PM for Dana Mitchell. You can see it under Appointments.',
   206, now() - interval '2 hours')
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- Appointments
--
-- Times are derived from the current date so the seeded data always contains a
-- realistic mix of past and upcoming bookings. The windows never overlap within
-- a tenant, which the `appointments_no_overlap` exclusion constraint requires.
-- --------------------------------------------------------------------------
INSERT INTO appointments (
  id, business_id, user_id, service_id, chat_session_id,
  customer_name, customer_email, customer_phone,
  starts_at, ends_at, status, source, notes
) VALUES
  -- Booked through the chat assistant, still awaiting confirmation.
  ('f1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'a2222222-2222-4222-8222-222222222222',
   'd1111111-1111-4111-8111-111111111111',
   'Dana Mitchell', 'demo@appointly.dev', '+1 555 0142',
   (current_date + interval '1 day' + interval '14 hours'),
   (current_date + interval '1 day' + interval '15 hours'),
   'pending', 'chat', 'Requested via assistant; asked about sensitivity afterwards.'),

  -- Booked through the structured form and already confirmed.
  ('f2222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', NULL,
   'Dana Mitchell', 'demo@appointly.dev', '+1 555 0142',
   (current_date + interval '2 days' + interval '10 hours'),
   (current_date + interval '2 days' + interval '10 hours 30 minutes'),
   'confirmed', 'form', NULL),

  -- Historical row so the "past" filter and completed badge have data.
  ('f3333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', NULL,
   'Dana Mitchell', 'demo@appointly.dev', '+1 555 0142',
   (current_date - interval '9 days' + interval '11 hours'),
   (current_date - interval '9 days' + interval '11 hours 30 minutes'),
   'completed', 'form', 'Routine visit, no issues found.'),

  -- Second tenant: same wall-clock slot as the first row above, which is only
  -- legal because the exclusion constraint is scoped per business.
  ('f4444444-4444-4444-8444-444444444444', '22222222-2222-4222-8222-222222222222',
   'c3333333-3333-4333-8333-333333333333', 'a5555555-5555-4555-8555-555555555555', NULL,
   'Marcus Webb', 'patient@northside.dev', NULL,
   (current_date + interval '1 day' + interval '14 hours'),
   (current_date + interval '1 day' + interval '14 hours 45 minutes'),
   'confirmed', 'form', NULL)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------
-- AI interaction log
--
-- One successful call and one provider failure, so the fallback path has
-- representative data to inspect during review.
-- --------------------------------------------------------------------------
INSERT INTO ai_interaction_logs (
  id, business_id, user_id, session_id, provider, model, status,
  latency_ms, prompt_tokens, completion_tokens, request_payload, response_payload, error_message, created_at
) VALUES
  ('91111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111',
   'mistral', 'mistral-small-latest', 'success', 842, 512, 96,
   '{"messageCount": 4, "userMessagePreview": "2pm is perfect. Dana Mitchell, demo@..."}'::jsonb,
   '{"intent": "book_appointment", "readyToBook": true, "confidence": 0.92, "missingFields": []}'::jsonb,
   NULL, now() - interval '2 hours'),
  ('92222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'c1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111',
   'mistral', 'mistral-small-latest', 'timeout', 20000, NULL, NULL,
   '{"messageCount": 2, "userMessagePreview": "do you have anything earlier?"}'::jsonb,
   NULL, 'Request aborted after 20000ms', now() - interval '2 hours 30 minutes')
ON CONFLICT DO NOTHING;
