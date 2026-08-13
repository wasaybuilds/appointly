'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, LogOut, MessagesSquare } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS = [
  { href: '/chat', label: 'Assistant', icon: MessagesSquare },
  { href: '/appointments', label: 'Appointments', icon: CalendarDays },
] as const;

function initialsOf(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function AppNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async (): Promise<void> => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b border-ink-15 bg-paper">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:gap-8 sm:px-5">
        <Link href="/chat" className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-sm bg-ink text-[0.75rem] font-bold text-paper">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">Appointly</span>
        </Link>

        {/* Labels drop to icons on phones, where the full row needs more width
            than the viewport has. An underline is too faint to carry the active
            state once the label is gone, so small screens get a filled pill and
            the flat underline returns with the labels at `sm`. */}
        <nav className="flex h-full items-center gap-2 sm:gap-6" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={cn(
                  'relative flex items-center gap-2 text-[0.8125rem] font-medium transition-colors',
                  'h-9 rounded-md px-2.5 sm:h-full sm:rounded-none sm:px-0',
                  'after:absolute after:inset-x-0 after:-bottom-px after:h-px',
                  isActive
                    ? 'bg-ink-08 text-ink after:bg-transparent sm:bg-transparent sm:after:bg-ink'
                    : 'text-ink-50 after:bg-transparent hover:text-ink',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2.5">
              {/* The initials stay on phones: without them the header is a logo
                  and two grey glyphs, with nothing to say whose account this is. */}
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-ink-15 text-[0.6875rem] font-semibold text-ink-70">
                {initialsOf(user.fullName)}
              </span>
              <span className="hidden text-[0.8125rem] text-ink-70 sm:inline">{user.fullName}</span>
            </div>
          ) : null}

          <span className="hidden h-5 w-px bg-ink-15 sm:block" aria-hidden="true" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            isLoading={isSigningOut}
            aria-label="Sign out"
            leadingIcon={<LogOut className="size-4 shrink-0" aria-hidden="true" />}
          >
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
