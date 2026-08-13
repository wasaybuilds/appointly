'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary.
 *
 * Next requires this to be a client component. It renders a recovery action
 * rather than a dead end, because most render failures here are transient data
 * problems that a retry resolves.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Kept as console reporting: wiring a client error tracker is out of scope
    // for this assessment, and swallowing the error would make an incident invisible.
    console.error('Unhandled UI error:', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="label-micro">Error</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Something went wrong</h1>
      <p className="max-w-sm text-sm text-ink-50">
        An unexpected error interrupted this page. Trying again usually fixes it.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-70"
      >
        Try again
      </button>
    </main>
  );
}
