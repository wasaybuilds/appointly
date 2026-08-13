import { AuthForm } from '@/components/auth/auth-form';

export default function LoginPage() {
  return (
    <>
      <header className="mb-8">
        <p className="label-micro">Welcome back</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
        <p className="mt-1.5 text-sm text-ink-50">
          Pick up your conversation and upcoming appointments.
        </p>
      </header>

      <AuthForm mode="login" />
    </>
  );
}
