'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { CalendarCheck, MessagesSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { Loading } from '@/components/ui/loading';

const HIGHLIGHTS = [
  {
    icon: MessagesSquare,
    title: 'Book by conversation',
    body: 'Describe what you need in plain language; the assistant reads back the details it captured.',
  },
  {
    icon: CalendarCheck,
    title: 'Never double-booked',
    body: 'Overlapping slots are rejected by the database itself, not just by application checks.',
  },
  {
    icon: ShieldCheck,
    title: 'Sessions you control',
    body: 'Short-lived access tokens in httpOnly cookies, rotated silently in the background.',
  },
];

/** Redirects users who already have a session so a live cookie never lands on a pointless form. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/chat');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return <Loading variant="page" label="Checking your session" />;
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-ink p-12 text-paper lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-sm bg-paper text-[0.8125rem] font-bold text-ink">
            A
          </span>
          <span className="text-sm font-semibold tracking-tight">Appointly</span>
        </div>

        <div className="max-w-md">
          <h1 className="text-[2.5rem] leading-[1.1] font-semibold tracking-tight">
            Appointments,
            <br />
            settled in a sentence.
          </h1>
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-paper/55">
            An AI assistant that turns a message into a confirmed booking, with a structured form
            waiting whenever the conversation runs short of detail.
          </p>

          <ul className="mt-12 flex flex-col gap-7 border-t border-paper/15 pt-10">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <Icon className="mt-0.5 size-[1.125rem] shrink-0 text-paper/70" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-[0.8125rem] leading-relaxed text-paper/50">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-paper/40">Full Stack Technical Assessment</p>
      </section>

      <section className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-[26rem]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-7 items-center justify-center rounded-sm bg-ink text-[0.8125rem] font-bold text-paper">
              A
            </span>
            <span className="text-sm font-semibold tracking-tight text-ink">Appointly</span>
          </div>

          {children}
        </div>
      </section>
    </main>
  );
}
