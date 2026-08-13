'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppNav } from '@/components/layout/app-nav';
import { useAuth } from '@/components/providers/auth-provider';
import { Loading } from '@/components/ui/loading';

/**
 * Authenticated app shell and route guard.
 *
 * The guard runs client-side because the session cookie is set by the API,
 * which in production lives on another origin, so middleware could not read it
 * reliably. This is a redirect for the user's benefit, not a security boundary:
 * every API route rejects unauthenticated requests regardless of what renders.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <Loading variant="page" label="Loading your account" />;
  }

  if (!user) {
    return <Loading variant="page" label="Redirecting to sign in" />;
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <AppNav />
      {/*
        `overflow-x-clip` is a backstop against sideways scroll on phones, where
        one over-wide child otherwise drags the whole document. `clip` rather
        than `hidden` because `hidden` would make this a scroll container and
        change how sticky positioning resolves inside it. Clipping happens at
        the padding box, so the chat panes that bleed into the gutters with a
        negative margin still reach the screen edges untouched.
      */}
      <main className="mx-auto w-full max-w-6xl flex-1 overflow-x-clip px-5 py-7">{children}</main>
    </div>
  );
}
