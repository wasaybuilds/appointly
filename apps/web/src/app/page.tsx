import { redirect } from 'next/navigation';

/**
 * Root route.
 *
 * There is no marketing page in scope, so `/` sends visitors straight to the
 * chat. The authenticated layout decides whether that means the assistant or
 * the sign-in screen — putting the decision there keeps one guard instead of
 * two that could disagree.
 */
export default function HomePage() {
  redirect('/chat');
}
