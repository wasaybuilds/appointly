import { cn } from '@/lib/utils/cn';

interface LoadingProps {
  variant?: 'inline' | 'block' | 'page';
  label?: string;
  className?: string;
}

/** The single loading indicator, so every pending state looks and is announced alike. */
export function Loading({ variant = 'block', label = 'Loading', className }: LoadingProps) {
  if (variant === 'inline') {
    return <Spinner className={cn('size-4', className)} label={label} />;
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        variant === 'page' ? 'min-h-[60vh]' : 'py-14',
        className,
      )}
    >
      <Spinner className="size-5" label={label} />
      <p className="text-sm text-ink-50">{label}</p>
    </div>
  );
}

function Spinner({ className, label }: { className?: string; label: string }) {
  return (
    <span role="status" aria-live="polite" aria-label={label} className="inline-flex">
      <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
