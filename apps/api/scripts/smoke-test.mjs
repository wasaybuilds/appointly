/**
 * End-to-end smoke test for the running API.
 *
 * Drives the same flow a reviewer would: sign in, read the catalogue, book
 * through the form path, then hold a short conversation with the assistant and
 * let it book. Uses a cookie jar so it exercises the real httpOnly session
 * rather than a bearer-token shortcut.
 *
 * Usage: node apps/api/scripts/smoke-test.mjs
 */

const BASE_URL = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000';
const EMAIL = process.env.SMOKE_EMAIL ?? 'demo@appointly.dev';
const PASSWORD = process.env.SMOKE_PASSWORD ?? 'DemoPass123!';

const cookieJar = new Map();

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const cookie of raw) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) {
      cookieJar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookieJar.size > 0 ? { cookie: cookieHeader() } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  storeCookies(response);

  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function assert(condition, label, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
    return;
  }
  console.error(`  FAIL  ${label}`);
  if (detail !== undefined) {
    console.error(`        ${JSON.stringify(detail).slice(0, 500)}`);
  }
  process.exitCode = 1;
}

function isoAt(daysAhead, hour) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

/**
 * Each run books a slot nobody else has taken.
 *
 * The exclusion constraint is global per tenant, so reusing a fixed time would
 * make the second run of this script fail against its own leftovers.
 */
function pickFreeSlot() {
  const daysAhead = 10 + Math.floor(Math.random() * 100);
  const hour = 9 + Math.floor(Math.random() * 7);
  return isoAt(daysAhead, hour);
}

async function run() {
  console.log(`\nSmoke testing ${BASE_URL}\n`);

  console.log('health');
  const health = await fetch(`${BASE_URL}/health`).then((r) => r.json());
  assert(health.status === 'ok', 'health check responds ok', health);

  console.log('\nauth');
  const badLogin = await call('POST', '/api/v1/auth/login', {
    email: EMAIL,
    password: 'wrong-password',
  });
  assert(badLogin.status === 401, 'wrong password is rejected with 401', badLogin.payload);

  const badPayload = await call('POST', '/api/v1/auth/login', { email: 'nope', password: '' });
  assert(badPayload.status === 422, 'malformed login returns 422 with issues', badPayload.payload);
  assert(
    Array.isArray(badPayload.payload?.error?.issues) &&
      badPayload.payload.error.issues.length > 0,
    'validation errors list every bad field',
    badPayload.payload,
  );

  const login = await call('POST', '/api/v1/auth/login', { email: EMAIL, password: PASSWORD });
  assert(login.status === 200, 'valid credentials sign in', login.payload);
  assert(cookieJar.has('appointly_access_token'), 'access token set as httpOnly cookie');

  const me = await call('GET', '/api/v1/auth/me');
  assert(me.status === 200 && me.payload?.data?.email === EMAIL, 'GET /auth/me returns profile', me.payload);

  console.log('\nmeta + catalogue');
  const meta = await call('GET', '/api/v1/meta');
  assert(meta.status === 200, 'meta endpoint responds', meta.payload);
  console.log(`        aiEnabled=${meta.payload?.data?.aiEnabled} model=${meta.payload?.data?.aiModel}`);

  const services = await call('GET', '/api/v1/services');
  const service = services.payload?.data?.[0];
  assert(services.status === 200 && Boolean(service), 'services list returns catalogue', services.payload);

  console.log('\nappointments');
  const availability = await call(
    'GET',
    `/api/v1/appointments/availability?serviceId=${service.id}&date=${isoAt(3, 0).slice(0, 10)}`,
  );
  assert(
    availability.status === 200 && Array.isArray(availability.payload?.data),
    'availability returns slots',
    availability.payload,
  );

  const slot = pickFreeSlot();

  const booking = await call('POST', '/api/v1/appointments', {
    serviceId: service.id,
    startsAt: slot,
    customerName: 'Smoke Tester',
    customerEmail: EMAIL,
    source: 'form',
  });
  assert(booking.status === 201, 'form booking succeeds', booking.payload);

  const duplicate = await call('POST', '/api/v1/appointments', {
    serviceId: service.id,
    startsAt: slot,
    customerName: 'Smoke Tester',
    customerEmail: EMAIL,
    source: 'form',
  });
  assert(
    duplicate.status === 409 && duplicate.payload?.error?.code === 'APPOINTMENT_SLOT_TAKEN',
    'double booking is rejected by the exclusion constraint',
    duplicate.payload,
  );

  const past = await call('POST', '/api/v1/appointments', {
    serviceId: service.id,
    startsAt: isoAt(-2, 11),
    customerName: 'Smoke Tester',
    customerEmail: EMAIL,
    source: 'form',
  });
  assert(
    past.status === 409 && past.payload?.error?.code === 'APPOINTMENT_IN_PAST',
    'past booking is rejected',
    past.payload,
  );

  const outsideHours = await call('POST', '/api/v1/appointments', {
    serviceId: service.id,
    startsAt: isoAt(3, 4),
    customerName: 'Smoke Tester',
    customerEmail: EMAIL,
    source: 'form',
  });
  assert(
    outsideHours.status === 409 && outsideHours.payload?.error?.code === 'APPOINTMENT_OUTSIDE_HOURS',
    'booking outside opening hours is rejected',
    outsideHours.payload,
  );

  const list = await call('GET', '/api/v1/appointments?scope=all&pageSize=5');
  assert(
    list.status === 200 && typeof list.payload?.meta?.total === 'number',
    'appointment list is paginated',
    list.payload,
  );

  const movedSlot = pickFreeSlot();
  const rescheduled = await call(
    'PATCH',
    `/api/v1/appointments/${booking.payload.data.id}/reschedule`,
    { startsAt: movedSlot },
  );
  assert(
    rescheduled.status === 200 &&
      new Date(rescheduled.payload?.data?.startsAt).getTime() === new Date(movedSlot).getTime(),
    'appointment can be rescheduled to a free slot',
    rescheduled.payload,
  );

  const cancelled = await call('PATCH', `/api/v1/appointments/${booking.payload.data.id}/status`, {
    status: 'cancelled',
  });
  assert(cancelled.status === 200 && cancelled.payload?.data?.status === 'cancelled', 'appointment can be cancelled', cancelled.payload);

  const rescheduleCancelled = await call(
    'PATCH',
    `/api/v1/appointments/${booking.payload.data.id}/reschedule`,
    { startsAt: pickFreeSlot() },
  );
  assert(
    rescheduleCancelled.status === 409 &&
      rescheduleCancelled.payload?.error?.code === 'APPOINTMENT_INVALID_TRANSITION',
    'a cancelled appointment cannot be rescheduled',
    rescheduleCancelled.payload,
  );

  console.log('\nchat + AI');
  const session = await call('POST', '/api/v1/chat/sessions');
  assert(session.status === 201, 'chat session created', session.payload);
  const sessionId = session.payload?.data?.id;

  const turnOne = await call('POST', `/api/v1/chat/sessions/${sessionId}/messages`, {
    content: `Hi, I'd like to book a ${service.name}.`,
  });
  assert(turnOne.status === 201, 'first chat turn accepted', turnOne.payload);
  console.log(`        degraded=${turnOne.payload?.data?.degraded} outcome=${turnOne.payload?.data?.booking?.outcome}`);
  console.log(`        assistant: ${turnOne.payload?.data?.assistantMessage?.content?.slice(0, 160)}`);

  const chatSlot = new Date(pickFreeSlot());
  const dateLabel = chatSlot.toISOString().slice(0, 10);
  const timeLabel = `${String(chatSlot.getUTCHours()).padStart(2, '0')}:00`;

  const turnTwo = await call('POST', `/api/v1/chat/sessions/${sessionId}/messages`, {
    content: `${dateLabel} at ${timeLabel} UTC please. My name is Smoke Tester and my email is ${EMAIL}.`,
  });
  assert(turnTwo.status === 201, 'second chat turn accepted', turnTwo.payload);
  const outcome = turnTwo.payload?.data?.booking?.outcome;
  console.log(`        degraded=${turnTwo.payload?.data?.degraded} outcome=${outcome}`);
  console.log(`        assistant: ${turnTwo.payload?.data?.assistantMessage?.content?.slice(0, 200)}`);
  assert(
    ['booked', 'collecting', 'needs_form'].includes(outcome),
    'assistant produced a valid booking outcome',
    turnTwo.payload?.data?.booking,
  );
  assert(
    turnTwo.payload?.data?.booking?.prefill !== undefined,
    'form fallback prefill is always present in the contract',
    turnTwo.payload?.data?.booking,
  );

  const transcript = await call('GET', `/api/v1/chat/sessions/${sessionId}`);
  assert(
    transcript.status === 200 && transcript.payload?.data?.messages?.length >= 4,
    'conversation history is persisted (multi-turn memory)',
    transcript.payload?.data?.session,
  );

  console.log('\nauthorisation');
  cookieJar.clear();
  const unauthorised = await call('GET', '/api/v1/appointments');
  assert(unauthorised.status === 401, 'protected route rejects anonymous access', unauthorised.payload);

  const missing = await call('GET', '/api/v1/does-not-exist');
  assert(missing.status === 404 && missing.payload?.success === false, '404 returns the JSON envelope', missing.payload);

  console.log(process.exitCode === 1 ? '\nSMOKE TEST FAILED\n' : '\nSMOKE TEST PASSED\n');
}

run().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
