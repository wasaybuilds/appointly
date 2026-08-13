'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import type { Appointment } from '@appointly/shared';
import { toDisplayMessage } from '@/lib/api/api-error';
import { appointmentsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { useSocket } from '@/hooks/use-socket';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { Loading } from '@/components/ui/loading';
import { AppointmentCard } from './appointment-card';

/**
 * The appointments dashboard.
 *
 * Subscribes to realtime appointment events so a booking made in the chat — in
 * this tab or another — appears here without a refresh. The socket only
 * invalidates the query rather than patching the list directly, which keeps the
 * server as the single source of truth for ordering and pagination.
 */

const SCOPES = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'all', label: 'All' },
] as const;

type Scope = (typeof SCOPES)[number]['value'];

const PAGE_SIZE = 10;

export function AppointmentList() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('upcoming');
  const [page, setPage] = useState(1);

  const filters = useMemo(() => ({ scope, page, pageSize: PAGE_SIZE }), [scope, page]);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: queryKeys.appointments.list(filters),
    queryFn: () => appointmentsApi.list(filters),
    // Keeps the previous page visible while the next one loads, avoiding a
    // full-panel spinner on every pagination click.
    placeholderData: (previous) => previous,
  });

  const refreshList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
  }, [queryClient]);

  const socketHandlers = useMemo(
    () => ({
      'appointment:created': (_appointment: Appointment) => refreshList(),
      'appointment:updated': (_appointment: Appointment) => refreshList(),
    }),
    [refreshList],
  );

  useSocket(socketHandlers);

  const changeScope = (next: Scope): void => {
    setScope(next);
    // A page number from the previous filter is meaningless under the new one.
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b border-ink-15 pb-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="label-micro">Dashboard</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
            Your appointments
          </h1>
          <p className="mt-1 text-sm text-ink-50">
            Everything you have booked, from the assistant or the form.
          </p>
        </div>

        {/* Spans the width on phones so it reads as one deliberate segmented
            control, rather than three buttons stranded under the heading. */}
        <div
          className="flex w-full rounded-md border border-ink-15 p-0.5 sm:w-auto"
          role="tablist"
          aria-label="Filter appointments"
        >
          {SCOPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={scope === option.value}
              onClick={() => changeScope(option.value)}
              className={cn(
                'flex-1 rounded-sm px-3.5 py-2 text-[0.8125rem] font-medium transition-colors sm:flex-none sm:py-1.5',
                scope === option.value ? 'bg-ink text-paper' : 'text-ink-50 hover:text-ink',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <Loading label="Loading appointments" />
      ) : isError ? (
        <Alert tone="danger" title="Could not load your appointments">
          {toDisplayMessage(error)}
        </Alert>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          className="rounded-md border border-ink-15"
          icon={<CalendarX2 className="size-4" aria-hidden="true" />}
          title={scope === 'upcoming' ? 'No upcoming appointments' : 'Nothing here yet'}
          description="Chat with the assistant to book your first appointment."
          action={
            <Link
              href="/chat"
              className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-70"
            >
              Open the assistant
            </Link>
          }
        />
      ) : (
        <>
          <div className={cn('flex flex-col gap-3 transition-opacity', isFetching && 'opacity-60')}>
            {data?.items.map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>

          {data && data.meta.totalPages > 1 ? (
            <nav
              className="flex items-center justify-between border-t border-ink-15 pt-4"
              aria-label="Pagination"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>

              <span className="text-[0.8125rem] text-ink-50">
                Page {data.meta.page} of {data.meta.totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
