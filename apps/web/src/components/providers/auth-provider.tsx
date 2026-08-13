'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { AuthUser, LoginInput, SignupInput } from '@appointly/shared';
import { isApiError } from '@/lib/api/api-error';
import { authApi } from '@/lib/api/endpoints';
import { queryKeys } from '@/lib/query-keys';

/*
  The session lives in httpOnly cookies JavaScript cannot read, so `GET
  /auth/me` is the source of truth for who is signed in. Better than decoding a
  readable token: it also catches sessions the server has revoked.
*/

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  signup: (input: SignupInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authApi.me,
    // A 401 here is the expected answer for a signed-out visitor, not a failure to retry.
    retry: false,
    staleTime: 5 * 60_000,
  });

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.auth.me, session.user);
    },
  });

  const signupMutation = useMutation({
    mutationFn: authApi.signup,
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.auth.me, session.user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Cleared even on failure: leaving one user's data in the cache is far
      // worse than a redundant sign-out.
      queryClient.clear();
      router.replace('/login');
    },
  });

  const login = useCallback(
    async (input: LoginInput) => {
      const session = await loginMutation.mutateAsync(input);
      return session.user;
    },
    [loginMutation],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const session = await signupMutation.mutateAsync(input);
      return session.user;
    },
    [signupMutation],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
  }, [logoutMutation]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: user ?? null,
      isLoading,
      login,
      signup,
      logout,
    }),
    [user, isLoading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Reads the auth context, throwing outside {@link AuthProvider} — a wiring mistake that should fail loudly. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }

  return context;
}

/** True when an error means "not signed in" rather than "request failed". */
export function isUnauthenticatedError(error: unknown): boolean {
  return isApiError(error) && error.status === 401;
}
