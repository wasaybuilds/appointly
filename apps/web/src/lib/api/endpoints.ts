import type {
  Appointment,
  AppointmentStatus,
  AuthSessionResponse,
  AuthUser,
  AvailabilitySlot,
  ChatMessage,
  ChatSession,
  ChatTurn,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  LoginInput,
  Service,
  SignupInput,
} from '@appointly/shared';
import { apiRequest, apiRequestPaginated, buildQuery, type PaginatedResult } from './client';

/**
 * Typed API surface.
 *
 * One function per endpoint, grouped by resource. Components and hooks call
 * these rather than assembling URLs themselves, so a route change is a
 * one-line edit here instead of a search across the codebase — and request and
 * response types come straight from the shared contract package, which means a
 * server-side contract change breaks the build rather than production.
 */

export interface SessionWithMessages {
  session: ChatSession;
  messages: ChatMessage[];
}

export interface RuntimeMeta {
  aiEnabled: boolean;
  aiModel: string | null;
  businessHours: {
    timezone: string;
    openHour: number;
    closeHour: number;
  };
}

export const authApi = {
  signup: (input: SignupInput): Promise<AuthSessionResponse> =>
    apiRequest('/auth/signup', { method: 'POST', body: input }),

  login: (input: LoginInput): Promise<AuthSessionResponse> =>
    apiRequest('/auth/login', { method: 'POST', body: input }),

  logout: (): Promise<{ signedOut: boolean }> => apiRequest('/auth/logout', { method: 'POST' }),

  me: (): Promise<AuthUser> => apiRequest('/auth/me'),
};

export const metaApi = {
  get: (): Promise<RuntimeMeta> => apiRequest('/meta'),
};

export const catalogApi = {
  listServices: (): Promise<Service[]> => apiRequest('/services'),
};

export const appointmentsApi = {
  list: (filters: Partial<ListAppointmentsQuery> = {}): Promise<PaginatedResult<Appointment>> =>
    apiRequestPaginated(
      `/appointments${buildQuery({
        scope: filters.scope,
        status: filters.status,
        page: filters.page,
        pageSize: filters.pageSize,
      })}`,
    ),

  getById: (id: string): Promise<Appointment> => apiRequest(`/appointments/${id}`),

  create: (input: CreateAppointmentInput): Promise<Appointment> =>
    apiRequest('/appointments', { method: 'POST', body: input }),

  reschedule: (id: string, startsAt: string): Promise<Appointment> =>
    apiRequest(`/appointments/${id}/reschedule`, { method: 'PATCH', body: { startsAt } }),

  updateStatus: (id: string, status: AppointmentStatus): Promise<Appointment> =>
    apiRequest(`/appointments/${id}/status`, { method: 'PATCH', body: { status } }),

  availability: (serviceId: string, date: string): Promise<AvailabilitySlot[]> =>
    apiRequest(`/appointments/availability${buildQuery({ serviceId, date })}`),
};

export const chatApi = {
  /** Resumes the active conversation, creating one if there is none. */
  startSession: (): Promise<SessionWithMessages> =>
    apiRequest('/chat/sessions/active', { method: 'POST' }),

  createSession: (title?: string): Promise<ChatSession> =>
    apiRequest('/chat/sessions', { method: 'POST', body: { title } }),

  listSessions: (page = 1, pageSize = 20): Promise<PaginatedResult<ChatSession>> =>
    apiRequestPaginated(`/chat/sessions${buildQuery({ page, pageSize })}`),

  getSession: (id: string): Promise<SessionWithMessages> => apiRequest(`/chat/sessions/${id}`),

  sendMessage: (sessionId: string, content: string): Promise<ChatTurn> =>
    apiRequest(`/chat/sessions/${sessionId}/messages`, { method: 'POST', body: { content } }),
};
