import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/components/providers/auth-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

/**
 * Root layout.
 *
 * Providers are nested outermost-first: query caching must exist before the
 * auth provider, because the auth provider is itself a query.
 */

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  // `swap` shows text immediately in a fallback face rather than blocking the
  // first paint on a font download.
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Appointly — AI appointment booking',
  description:
    'Book appointments by chatting with an AI assistant, with a structured form always available as a fallback.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      {/*
        Browser extensions commonly inject attributes onto <body> before React
        hydrates, which React reports as a mismatch. Suppression is scoped to
        this element only, and <body> renders no dynamic content of our own, so
        a real hydration bug in the app would still surface normally.
      */}
      <body className="min-h-dvh antialiased" suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
