import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-md border border-ink-15 bg-paper', className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-ink-15 px-5 py-3.5',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[0.8125rem] text-ink-50">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}
