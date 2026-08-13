import type { AppointmentStatus } from '@appointly/shared';
import { cn } from '@/lib/utils/cn';

/*
  Status is carried by a dot and a label rather than by background colour, which
  keeps the palette at four colours and stays legible without relying on hue
  alone.
*/
const STATUS: Record<AppointmentStatus, { label: string; dot: string; text: string }> = {
  pending: { label: 'Pending', dot: 'bg-ink-50', text: 'text-ink-70' },
  confirmed: { label: 'Confirmed', dot: 'bg-accent', text: 'text-ink' },
  cancelled: { label: 'Cancelled', dot: 'bg-alert', text: 'text-ink-50' },
  completed: { label: 'Completed', dot: 'bg-ink-30', text: 'text-ink-50' },
};

export function StatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
  className?: string;
}) {
  const style = STATUS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[0.75rem] font-medium',
        style.text,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {style.label}
    </span>
  );
}

const SOURCE_LABELS: Record<'chat' | 'form' | 'staff', string> = {
  chat: 'Assistant',
  form: 'Form',
  staff: 'Staff',
};

export function SourceBadge({ source }: { source: 'chat' | 'form' | 'staff' }) {
  return (
    <span className="rounded-sm border border-ink-15 px-1.5 py-0.5 text-[0.6875rem] text-ink-50">
      {SOURCE_LABELS[source]}
    </span>
  );
}
