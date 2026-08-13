'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Appointment } from '@appointly/shared';
import { isApiError, toDisplayMessage } from '@/lib/api/api-error';
import { appointmentsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils/cn';
import { formatTime, toDateInputValue, todayAsDateInput } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { Loading } from '@/components/ui/loading';

/**
 * Inline reschedule control.
 *
 * Reuses the availability endpoint rather than accepting a typed time, so the
 * same "closed / too soon / already taken" rules that govern booking apply here
 * without being restated on the client. The appointment's current slot is
 * reported as taken by the server — it blocks itself — so it never appears as
 * an option, which is the correct behaviour for a move.
 */
export function ReschedulePanel({
  appointment,
  onClose,
}: {
  appointment: Appointment;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => toDateInputValue(appointment.startsAt));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availability = useQuery({
    queryKey: queryKeys.appointments.availability(appointment.service.id, date),
    queryFn: () => appointmentsApi.availability(appointment.service.id, date),
    enabled: Boolean(date),
    staleTime: 15_000,
  });

  const rescheduleMutation = useMutation({
    mutationFn: (startsAt: string) => appointmentsApi.reschedule(appointment.id, startsAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      onClose();
    },
    onError: (mutationError) => {
      // A lost slot is recoverable: refresh so the user sees what is still free.
      if (isApiError(mutationError) && mutationError.code === 'APPOINTMENT_SLOT_TAKEN') {
        void availability.refetch();
        setSelectedSlot(null);
      }

      setError(toDisplayMessage(mutationError));
    },
  });

  const openSlots = (availability.data ?? []).filter((slot) => slot.available);

  return (
    <section
      aria-label="Reschedule appointment"
      className="mt-4 flex flex-col gap-4 border-t border-ink-15 pt-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="label-micro">Move to a new time</p>
        <button
          type="button"
          onClick={onClose}
          className="text-[0.8125rem] text-ink-50 transition-colors hover:text-ink"
        >
          Close
        </button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <TextField
        label="Date"
        type="date"
        min={todayAsDateInput()}
        value={date}
        onChange={(event) => {
          setDate(event.target.value);
          // The chosen time belongs to the previous date and must not survive it.
          setSelectedSlot(null);
          setError(null);
        }}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-medium text-ink">New time</span>

        {availability.isLoading ? (
          <Loading label="Checking availability" className="py-6" />
        ) : availability.isError ? (
          <Alert tone="danger">Could not load availability. Please try another date.</Alert>
        ) : openSlots.length === 0 ? (
          <Alert tone="warning">No times are free on this date. Please choose another day.</Alert>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Available times">
            {openSlots.map((slot) => {
              const isSelected = selectedSlot === slot.startsAt;

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedSlot(slot.startsAt)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
                    isSelected
                      ? 'border-ink bg-ink text-paper'
                      : 'border-ink-15 text-ink-70 hover:border-ink hover:text-ink',
                  )}
                >
                  {formatTime(slot.startsAt)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!selectedSlot}
          isLoading={rescheduleMutation.isPending}
          onClick={() => {
            if (selectedSlot) {
              setError(null);
              rescheduleMutation.mutate(selectedSlot);
            }
          }}
        >
          Confirm new time
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Keep current time
        </Button>
      </div>
    </section>
  );
}
