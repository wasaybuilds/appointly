import { z } from 'zod';

/**
 * Authentication contracts.
 *
 * Password rules are enforced here (shared) rather than only in the API so the
 * browser can give immediate feedback while the server still re-validates every
 * request: client-side validation is a UX affordance, never a security control.
 */

const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a number');

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(120, 'Name must be at most 120 characters'),
  email: z.email('Please enter a valid email address').max(255).toLowerCase().trim(),
  password: passwordSchema,
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s()-]{7,20}$/, 'Please enter a valid phone number')
    .optional()
    .or(z.literal('')),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email('Please enter a valid email address').max(255).toLowerCase().trim(),
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  businessId: z.uuid(),
  businessName: z.string(),
  email: z.email(),
  fullName: z.string(),
  phone: z.string().nullable(),
  role: z.enum(['customer', 'staff', 'admin']),
  createdAt: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

export interface AuthSessionResponse {
  user: AuthUser;
  /** Seconds until the access cookie expires; the client refreshes just before. */
  expiresIn: number;
}
