import { Router } from 'express';
import { loginSchema, signupSchema } from '@appointly/shared';
import { asyncHandler } from '../../lib/http/async-handler';
import { authenticate } from '../../middleware/authenticate.middleware';
import { authRateLimit } from '../../middleware/rate-limit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { authController } from './auth.controller';

/** Auth routes; throttling comes first so an attacker cannot spend our CPU on password hashing. */
export const authRouter: Router = Router();

authRouter.post(
  '/signup',
  authRateLimit,
  validate({ body: signupSchema }),
  asyncHandler(authController.signup),
);

authRouter.post(
  '/login',
  authRateLimit,
  validate({ body: loginSchema }),
  asyncHandler(authController.login),
);

// Rotation is throttled too: an unauthenticated endpoint that writes to the database.
authRouter.post('/refresh', authRateLimit, asyncHandler(authController.refresh));

authRouter.post('/logout', asyncHandler(authController.logout));

authRouter.get('/me', authenticate, asyncHandler(authController.me));
