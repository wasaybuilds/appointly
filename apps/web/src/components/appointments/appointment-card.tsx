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
        'group rounded-md border border-ink-15 px-5 py-4 transition-colors hover:border-ink-30',
        isFinished && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
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
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {appointment.service.durationMinutes} minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5" aria-hidden="true" />
              {appointment.customerEmail}
            </span>
          </div>

          {appointment.notes ? (
            <p className="mt-3 flex items-start gap-2 border-t border-ink-15 pt-3 text-[0.8125rem] text-ink-50">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{appointment.notes}</span>
            </p>
          ) : null}
        </div>

        {canModify ? (
          <div className="flex items-center gap-2">
            {isConfirmingCancel ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  isLoading={cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Confirm cancel
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsConfirmingCancel(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
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
