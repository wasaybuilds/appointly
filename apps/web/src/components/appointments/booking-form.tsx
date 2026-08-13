'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  createAppointmentSchema,
  type Appointment,
  type AppointmentSource,
  type BookingFormPrefill,
  type CreateAppointmentInput,
  type Service,
} from '@appointly/shared';
import { isApiError, toDisplayMessage } from '@/lib/api/api-error';
import { appointmentsApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils/cn';
import { formatPrice, formatTime, todayAsDateInput } from '@/lib/utils/format';
import { Button } from '@/components/ui/button';
import { PhoneField, SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { Loading } from '@/components/ui/loading';

/**
 * Structured booking form — the guaranteed path to a booking, used standalone
 * and as the chat's fallback.
 *
 * Time is picked from server-provided availability rather than typed, which
 * removes the whole class of "you chose a time we are closed" errors before the
 * user can make one; that is why `startsAt` is set imperatively rather than
 * registered. `prefill` is read once into the initial state, and the caller
 * remounts via `key` when the assistant extracts new details.
 */

/** The schema's *input* type: fields with defaults, like `source`, are optional going in and guaranteed coming out. */
type BookingFormValues = z.input<typeof createAppointmentSchema>;

interface BookingFormProps {
  services: Service[];
  prefill?: BookingFormPrefill | null;
  source?: AppointmentSource;
  chatSessionId?: string | null;
  onBooked?: (appointment: Appointment) => void;
  submitLabel?: string;
}

export function BookingForm({
  services,
  prefill = null,
  source = 'form',
  chatSessionId = null,
  onBooked,
  submitLabel = 'Confirm booking',
}: BookingFormProps) {
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() =>
    prefill?.startsAt ? prefill.startsAt.slice(0, 10) : todayAsDateInput(),
  );

  const {
    register,
    handleSubmit,
    setValue,
    control,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues, unknown, CreateAppointmentInput>({
    resolver: zodResolver(createAppointmentSchema),
    defaultValues: {
      serviceId: prefill?.serviceId ?? services[0]?.id ?? '',
      startsAt: prefill?.startsAt ?? '',
      customerName: prefill?.customerName ?? '',
      customerEmail: prefill?.customerEmail ?? '',
      customerPhone: prefill?.customerPhone ?? '',
      notes: prefill?.notes ?? '',
      source,
      chatSessionId: chatSessionId ?? undefined,
    },
  });

  // `useWatch` rather than `watch()`: it returns a stable value, where `watch()`
  // hands back a fresh function each render and defeats memoisation.
  const serviceId = useWatch({ control, name: 'serviceId' });
  const startsAt = useWatch({ control, name: 'startsAt' });

  const availability = useQuery({
    queryKey: queryKeys.appointments.availability(serviceId, selectedDate),
    queryFn: () => appointmentsApi.availability(serviceId, selectedDate),
    enabled: Boolean(serviceId && selectedDate),
    // Slots go stale quickly — someone else may take one at any moment.
    staleTime: 15_000,
  });

  const bookingMutation = useMutation({
    mutationFn: (input: CreateAppointmentInput) => appointmentsApi.create(input),
    onSuccess: (appointment) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.appointments.all });
      setConfirmed(appointment);
      onBooked?.(appointment);
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await bookingMutation.mutateAsync({
        ...values,
        customerPhone: values.customerPhone || undefined,
        notes: values.notes || undefined,
      });
    } catch (error) {
      if (isApiError(error) && error.isValidationError) {
        for (const [field, message] of Object.entries(error.toFieldErrors())) {
          setError(field as keyof BookingFormValues, { type: 'server', message });
        }
        return;
      }

      // A rejected slot is recoverable: refresh availability so the user
      // immediately sees the times that are actually still free.
      if (isApiError(error) && error.code === 'APPOINTMENT_SLOT_TAKEN') {
        void availability.refetch();
      }

      setFormError(toDisplayMessage(error));
    }
  });

  if (confirmed) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Appointment confirmed">
          {confirmed.service.name} on {new Date(confirmed.startsAt).toLocaleString()}.
        </Alert>
        <Button
          variant="outline"
          onClick={() => {
            setConfirmed(null);
            reset();
          }}
        >
          Book another
        </Button>
      </div>
    );
  }

  const slots = availability.data ?? [];
  const openSlots = slots.filter((slot) => slot.available);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      <SelectField
        label="Service"
        required
        error={errors.serviceId?.message}
        {...register('serviceId')}
      >
        {services.length === 0 ? <option value="">No services available</option> : null}
        {services.map((service) => {
          const price = formatPrice(service.priceCents);
          return (
            <option key={service.id} value={service.id}>
              {service.name} · {service.durationMinutes} min{price ? ` · ${price}` : ''}
            </option>
          );
        })}
      </SelectField>

      <TextField
        label="Date"
        type="date"
        required
        min={todayAsDateInput()}
        value={selectedDate}
        onChange={(event) => {
          setSelectedDate(event.target.value);
          // The old time must not be silently submitted against the new date.
          setValue('startsAt', '');
        }}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[0.8125rem] font-medium text-ink">
          Time<span className="ml-1 text-ink-30">*</span>
        </span>

        {availability.isLoading ? (
          <Loading label="Checking availability" className="py-6" />
        ) : availability.isError ? (
          <Alert tone="danger">Could not load availability. Please try another date.</Alert>
        ) : openSlots.length === 0 ? (
          <Alert tone="warning">No times are free on this date. Please choose another day.</Alert>
        ) : (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Available times">
            {openSlots.map((slot) => {
              const isSelected = startsAt === slot.startsAt;

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setValue('startsAt', slot.startsAt, { shouldValidate: true })}
                  className={cn(
                    'rounded-md border px-3 py-2 text-[0.8125rem] font-medium transition-colors sm:py-1.5',
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

        {errors.startsAt ? (
          <p role="alert" className="text-xs text-alert">
            {errors.startsAt.message}
          </p>
        ) : null}
      </div>

      <TextField
        label="Your name"
        required
        autoComplete="name"
        error={errors.customerName?.message}
        {...register('customerName')}
      />

      <TextField
        label="Email"
        type="email"
        required
        autoComplete="email"
        error={errors.customerEmail?.message}
        {...register('customerEmail')}
      />

      <Controller
        control={control}
        name="customerPhone"
        render={({ field }) => (
          <PhoneField
            label="Phone"
            hint="Optional"
            value={field.value ?? undefined}
            onChange={(value) => field.onChange(value ?? '')}
            error={errors.customerPhone?.message}
          />
        )}
      />

      <TextAreaField
        label="Notes"
        placeholder="Anything we should know before your visit?"
        error={errors.notes?.message}
        {...register('notes')}
      />

      <Button type="submit" size="lg" isLoading={isSubmitting} disabled={!startsAt}>
        {submitLabel}
      </Button>
    </form>
  );
}
