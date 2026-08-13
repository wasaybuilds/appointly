import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

/*
  Only danger gets a hue of its own. The rest lean on the neutral scale so the
  interface never turns into a traffic light, while the icon still carries the
  meaning for anyone who cannot rely on colour.
*/
const TONE_STYLES: Record<AlertTone, { container: string; icon: ReactNode }> = {
  info: {
    container: 'border-accent/25 bg-accent-tint',
    icon: <Info className="size-4 shrink-0 text-accent" aria-hidden="true" />,
  },
  success: {
    container: 'border-ink-15 bg-ink-04',
    icon: <CheckCircle2 className="size-4 shrink-0 text-ink" aria-hidden="true" />,
  },
  warning: {
    container: 'border-ink-30 bg-ink-04',
    icon: <TriangleAlert className="size-4 shrink-0 text-ink-70" aria-hidden="true" />,
  },
  danger: {
    container: 'border-alert/25 bg-alert-tint',
    icon: <AlertCircle className="size-4 shrink-0 text-alert" aria-hidden="true" />,
  },
};

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      // Errors interrupt; everything else is announced politely so it does not
      // talk over whatever the user is doing.
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2.5 rounded-md border px-3.5 py-2.5 text-[0.8125rem]',
        styles.container,
        className,
      )}
    >
      {styles.icon}
      {/* Alerts carry server and model text, which can contain long unbroken
          values, so wrapping is forced rather than assumed. */}
      <div className="min-w-0 flex-1 break-words">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        <div className={cn('text-ink-70', title && 'mt-0.5')}>{children}</div>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-md border border-ink-15 text-ink-50">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-ink-50">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
