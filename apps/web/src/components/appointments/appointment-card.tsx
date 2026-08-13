'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Clock, Mail, StickyNote } from 'lucide-react';
import { useState } from 'react';
import type { Appointment } from '@appointly/shared';
import { toDisplayMessage } from '@/lib/api/api-error';
import { appointmentsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils/cn';
import { formatFriendlyDateTime, isInPast } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { SourceBadge, StatusBadge } from '@/components/ui/status-badge';
import { ReschedulePanel } from './reschedule-panel';

/**
 * One appointment in the list.
 *
 * Cancellation asks for confirmation inline rather than through a modal: the
 * action is destructive enough to need a deliberate second click, but not
 * disruptive enough to justify taking over the screen.
 */
export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => appointmentsApi.updateStatus(appointment.id, 'cancelled'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      setIsConfirmingCancel(false);
    },
    onError: (mutationError) => {
      setError(toDisplayMessage(mutationError));
    },
  });

  const isFinished = appointment.status === 'cancelled' || appointment.status === 'completed';

  // The API refuses to move or cancel a terminal booking, so the actions are
  // hidden rather than offered and then rejected.
  const canModify = !isFinished && !isInPast(appointment.startsAt);

  return (
    <article
      className={cn(
        'group rounded-md border border-ink-15 px-4 py-4 transition-colors hover:border-ink-30 sm:px-5',
        isFinished && 'opacity-60',
      )}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-[0.9375rem] font-semibold text-ink">{appointment.service.name}</h3>
            <StatusBadge status={appointment.status} />
            <SourceBadge source={appointment.source} />
          </div>

          <p className="mt-2.5 flex items-center gap-2 text-sm text-ink">
            <CalendarClock className="size-4 shrink-0 text-ink-50" aria-hidden="true" />
            {formatFriendlyDateTime(appointment.startsAt)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.8125rem] text-ink-50">
            <span className="flex shrink-0 items-center gap-1.5">
              <Clock className="size-3.5 shrink-0" aria-hidden="true" />
              {appointment.service.durationMinutes} minutes
            </span>
            {/* An address has no break points, so an untruncated long one widens
                the card past the viewport and scrolls the whole page sideways. */}
            <span className="flex min-w-0 items-center gap-1.5">
              <Mail className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{appointment.customerEmail}</span>
            </span>
          </div>

          {appointment.notes ? (
            <p className="mt-3 flex items-start gap-2 border-t border-ink-15 pt-3 text-[0.8125rem] text-ink-50">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{appointment.notes}</span>
            </p>
          ) : null}
        </div>

        {/* On phones the actions become a divided footer with the buttons
            sharing the width, which reads as part of the card instead of two
            controls left stranded under the text by a wrap. */}
        {canModify ? (
          <div className="flex items-center gap-2 border-t border-ink-15 pt-3.5 sm:shrink-0 sm:border-0 sm:pt-0">
            {isConfirmingCancel ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  className="h-9 flex-1 sm:h-8 sm:flex-none"
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Confirm cancel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 flex-1 sm:h-8 sm:flex-none"
                  onClick={() => setIsConfirmingCancel(false)}
                >
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 flex-1 sm:h-8 sm:flex-none"
                  aria-expanded={isRescheduling}
                  onClick={() => {
                    setIsRescheduling((open) => !open);
                    setError(null);
                  }}
                >
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 flex-1 sm:h-8 sm:flex-none"
                  onClick={() => {
                    setIsConfirmingCancel(true);
                    setIsRescheduling(false);
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {error ? (
        <Alert tone="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {canModify && isRescheduling && !isConfirmingCancel ? (
        <ReschedulePanel appointment={appointment} onClose={() => setIsRescheduling(false)} />
      ) : null}
    </article>
  );
}
