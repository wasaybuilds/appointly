import type { ListAppointmentsQuery } from '@appointly/shared';

/**
 * TanStack Query cache keys.
 *
 * Centralised so invalidation is reliable: booking from the chat needs to
 * refresh the appointments list, and that only works if both sides derive the
 * key from the same place. Keys are hierarchical, which lets a single
 * `invalidateQueries({ queryKey: queryKeys.appointments.all })` clear every
 * filtered variant at once.
 */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },

  meta: ['meta'] as const,

  services: ['services'] as const,

  appointments: {
    all: ['appointments'] as const,
    list: (filters: Partial<ListAppointmentsQuery>) => ['appointments', 'list', filters] as const,
    detail: (id: string) => ['appointments', 'detail', id] as const,
    availability: (serviceId: string, date: string) =>
      ['appointments', 'availability', serviceId, date] as const,
  },

  chat: {
    all: ['chat'] as const,
    activeSession: ['chat', 'session', 'active'] as const,
    session: (id: string) => ['chat', 'session', id] as const,
    sessions: ['chat', 'sessions'] as const,
  },
} as const;
