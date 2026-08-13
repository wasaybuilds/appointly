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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-5">
        <Link href="/chat" className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-sm bg-ink text-[0.75rem] font-bold text-paper">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight text-ink">Appointly</span>
        </Link>

        {/* The active tab is marked with an underline rule rather than a filled
            pill, which keeps the header flat and the palette narrow. */}
        <nav className="flex h-full items-center gap-6" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex h-full items-center gap-2 text-[0.8125rem] font-medium transition-colors',
                  'after:absolute after:inset-x-0 after:-bottom-px after:h-px',
                  isActive
                    ? 'text-ink after:bg-ink'
                    : 'text-ink-50 after:bg-transparent hover:text-ink',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <div className="hidden items-center gap-2.5 sm:flex">
              <span className="flex size-7 items-center justify-center rounded-full border border-ink-15 text-[0.6875rem] font-semibold text-ink-70">
                {initialsOf(user.fullName)}
              </span>
              <span className="text-[0.8125rem] text-ink-70">{user.fullName}</span>
            </div>
          ) : null}

          <span className="hidden h-5 w-px bg-ink-15 sm:block" aria-hidden="true" />

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            isLoading={isSigningOut}
            leadingIcon={<LogOut className="size-4" aria-hidden="true" />}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
