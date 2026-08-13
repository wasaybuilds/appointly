'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from '@appointly/shared';
import { isApiError, toDisplayMessage } from '@/lib/api/api-error';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { PhoneField, TextField } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';

/**
 * Sign-in and sign-up form.
 *
 * One component for both modes: the fields, validation strategy and error
 * handling are identical apart from two extra inputs, and splitting them would
 * duplicate the interesting part — mapping server-side field errors back onto
 * the form. Validation uses the same zod schemas the API validates with, so the
 * rules cannot drift between client and server.
 */

type AuthMode = 'login' | 'signup';

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { login, signup } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const isSignup = mode === 'signup';

  const form = useForm<SignupInput | LoginInput>({
    resolver: zodResolver(isSignup ? signupSchema : loginSchema),
    // Validate on blur rather than on every keystroke: flagging a half-typed
    // email as invalid is noise, not help.
    mode: 'onBlur',
    defaultValues: isSignup
      ? { email: '', password: '', fullName: '', phone: '' }
      : { email: '', password: '' },
  });

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = form;

  const fieldErrors = errors as Record<string, { message?: string } | undefined>;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      if (isSignup) {
        await signup(values as SignupInput);
      } else {
        await login(values);
      }

      router.replace('/chat');
    } catch (error) {
      // Field-level problems belong next to their input; anything else is shown
      // as a form-level banner.
      if (isApiError(error) && error.isValidationError) {
        for (const [field, message] of Object.entries(error.toFieldErrors())) {
          setError(field as keyof SignupInput, { type: 'server', message });
        }
        return;
      }

      setFormError(toDisplayMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? <Alert tone="danger">{formError}</Alert> : null}

      {isSignup ? (
        <TextField
          label="Full name"
          autoComplete="name"
          placeholder="Alex Morgan"
          required
          error={fieldErrors.fullName?.message}
          {...register('fullName')}
        />
      ) : null}

      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        required
        error={errors.email?.message}
        {...register('email')}
      />

      <TextField
        label="Password"
        type={showPassword ? 'text' : 'password'}
        autoComplete={isSignup ? 'new-password' : 'current-password'}
        placeholder={isSignup ? 'At least 10 characters' : '••••••••'}
        required
        hint={
          isSignup ? 'At least 10 characters, with upper case, lower case and a number.' : undefined
        }
        error={errors.password?.message}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="flex text-ink-50 transition-colors hover:text-ink"
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        }
        {...register('password')}
      />

      {isSignup ? (
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <PhoneField
              label="Phone"
              hint="Optional. Used to reach you about a booking."
              value={typeof field.value === 'string' ? field.value : undefined}
              onChange={(value) => field.onChange(value ?? '')}
              error={fieldErrors.phone?.message}
            />
          )}
        />
      ) : null}

      <Button type="submit" size="lg" fullWidth isLoading={isSubmitting} className="mt-2">
        {isSignup ? 'Create account' : 'Sign in'}
      </Button>

      <p className="mt-1 text-center text-[0.8125rem] text-ink-50">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-medium text-ink underline underline-offset-4 hover:text-accent"
        >
          {isSignup ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </form>
  );
}
