import { AuthForm } from '@/components/auth/auth-form';

export default function SignupPage() {
  return (
    <>
      <header className="mb-8">
        <p className="label-micro">Get started</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Create your account</h2>
        <p className="mt-1.5 text-sm text-ink-50">
          Takes a minute. You can book your first appointment straight after.
        </p>
      </header>

      <AuthForm mode="signup" />
    </>
  );
}
