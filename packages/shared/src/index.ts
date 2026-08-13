/**
 * `@appointly/shared` — the contract layer.
 *
 * This package holds everything the API and the web client must agree on:
 * zod schemas, inferred DTO types, domain constants and the realtime event map.
 * It has no runtime dependency on either application, so neither side can leak
 * implementation details into the other (see `docs/ARCHITECTURE.md`).
 */

export * from './domain/appointment.constants';
export * from './domain/chat.constants';

export * from './schemas/common.schema';
export * from './schemas/auth.schema';
export * from './schemas/appointment.schema';
export * from './schemas/chat.schema';
export * from './schemas/ai.schema';

export * from './types/api.types';

export * from './realtime/socket-events';
