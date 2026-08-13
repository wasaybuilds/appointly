import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="label-micro">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-ink-50">
        The page you are looking for does not exist or has moved.
      </p>
      <Link
        href="/chat"
        className="mt-3 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-paper transition-colors hover:bg-ink-70"
      >
        Back to the assistant
      </Link>
    </main>
  );
}
