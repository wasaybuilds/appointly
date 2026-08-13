'use client';

import type { ReactNode } from 'react';
import { CalendarCheck, ClipboardList, Sparkles } from 'lucide-react';
import type { Appointment, BookingResult, Service } from '@appointly/shared';
import { BookingForm } from '@/components/appointments/booking-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatFriendlyDateTime } from '@/lib/utils/format';

/**
 * The panel beside the conversation.
 *
 * It makes the assistant's state legible: what it has understood so far, what
 * it still needs, and — the moment interpretation stops being reliable — the
 * structured form, pre-filled with everything already gathered. The customer is
 * never stuck in a conversation that cannot conclude, and never re-enters
 * details they have already given.
 */

interface BookingPanelProps {
  booking: BookingResult | null;
  services: Service[];
  sessionId: string | null;
  aiEnabled: boolean;
  onBooked: (appointment: Appointment) => void;
}

/**
 * Full-bleed on phones, where this panel is a whole screen rather than a column
 * beside the conversation, so its side borders would sit on the screen edges.
 */
const PANEL_CARD = 'rounded-none border-x-0 sm:rounded-md sm:border-x';

const FIELD_LABELS: Record<string, string> = {
  serviceName: 'which service',
  startsAt: 'a date and time',
  customerName: 'your name',
  customerEmail: 'your email',
};

/**
 * Identity of a prefill, used as the form's React `key`.
 *
 * Changing the key remounts the form with the new values, which is how the
 * assistant's latest extraction reaches the inputs without the form having to
 * synchronise props into state internally.
 */
function prefillKey(booking: BookingResult | null): string {
  const prefill = booking?.prefill;

  if (!prefill) return 'empty';

  return [
    prefill.serviceId,
    prefill.startsAt,
    prefill.customerName,
    prefill.customerEmail,
    prefill.customerPhone,
    prefill.notes,
  ].join('|');
}

export function BookingPanel({
  booking,
  services,
  sessionId,
  aiEnabled,
  onBooked,
}: BookingPanelProps) {
  if (booking?.outcome === 'booked' && booking.appointment) {
    return <ConfirmationCard appointment={booking.appointment} />;
  }

  if (booking?.outcome === 'needs_form') {
    return (
      <Card className={PANEL_CARD}>
        <CardHeader
          title="Finish your booking"
          description="Everything the assistant understood is already filled in."
        />
        <CardBody className="flex flex-col gap-4">
          {booking.reason ? <Alert tone="warning">{booking.reason}</Alert> : null}
          <BookingForm
            key={prefillKey(booking)}
            services={services}
            prefill={booking.prefill}
            source="chat"
            chatSessionId={sessionId}
            onBooked={onBooked}
          />
        </CardBody>
      </Card>
    );
  }

  if (booking?.outcome === 'collecting') {
    return (
      <Card className={PANEL_CARD}>
        <CardHeader title="Booking in progress" description="The assistant is gathering details." />
        <CardBody className="flex flex-col gap-4">
          <ExtractedDetails booking={booking} />

          {booking.missingFields.length > 0 ? (
            <Alert tone="info" title="Still needed">
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {booking.missingFields.map((field) => (
                  <li key={field}>{FIELD_LABELS[field] ?? field}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <FormDisclosure label="Prefer to fill in a form?">
            <BookingForm
              key={prefillKey(booking)}
              services={services}
              prefill={booking.prefill}
              source="form"
              chatSessionId={sessionId}
              onBooked={onBooked}
            />
          </FormDisclosure>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className={PANEL_CARD}>
      <CardHeader
        title="Booking"
        description={aiEnabled ? 'Details appear here as you chat.' : 'The assistant is offline.'}
      />
      <CardBody>
        {aiEnabled ? (
          <EmptyState
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            title="Nothing to confirm yet"
            description="Tell the assistant which service you want and when, and the details will show up here."
          />
        ) : null}

        <FormDisclosure
          label="Book with the form instead"
          icon={<ClipboardList className="size-4" aria-hidden="true" />}
          defaultOpen={!aiEnabled}
        >
          <BookingForm
            services={services}
            source="form"
            chatSessionId={sessionId}
            onBooked={onBooked}
          />
        </FormDisclosure>
      </CardBody>
    </Card>
  );
}

function FormDisclosure({
  label,
  icon,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="border-t border-ink-15 pt-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[0.8125rem] font-medium text-ink underline underline-offset-4 hover:text-accent">
        {icon}
        {label}
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
      <dt className="shrink-0 text-xs text-ink-50">{label}</dt>
      <dd className="min-w-0 truncate text-[0.8125rem] text-ink">{value}</dd>
    </div>
  );
}

function ExtractedDetails({ booking }: { booking: BookingResult }) {
  const prefill = booking.prefill;

  if (!prefill) return null;

  const rows = [
    { label: 'Service', value: prefill.serviceName },
    { label: 'When', value: prefill.startsAt ? formatFriendlyDateTime(prefill.startsAt) : null },
    { label: 'Name', value: prefill.customerName },
    { label: 'Email', value: prefill.customerEmail },
  ].filter((row) => Boolean(row.value));

  if (rows.length === 0) return null;

  return (
    <dl className="divide-y divide-ink-15 rounded-md border border-ink-15">
      {rows.map((row) => (
        <DetailRow key={row.label} label={row.label} value={row.value} />
      ))}
    </dl>
  );
}

function ConfirmationCard({ appointment }: { appointment: Appointment }) {
  return (
    <Card className={PANEL_CARD}>
      <CardHeader title="Appointment confirmed" />
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-md border border-ink-15 bg-ink-04 px-3.5 py-3">
          <CalendarCheck className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{appointment.service.name}</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-50">
              {formatFriendlyDateTime(appointment.startsAt)} · {appointment.service.durationMinutes}{' '}
              minutes
            </p>
          </div>
        </div>

        <dl className="divide-y divide-ink-15 rounded-md border border-ink-15">
          <DetailRow label="Status" value={<StatusBadge status={appointment.status} />} />
          <DetailRow label="Booked for" value={appointment.customerName} />
          <DetailRow label="Email" value={appointment.customerEmail} />
        </dl>
      </CardBody>
    </Card>
  );
}
