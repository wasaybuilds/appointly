import { Router } from 'express';
import { z } from 'zod';
import {
  createChatSessionSchema,
  listChatSessionsQuerySchema,
  sendMessageSchema,
} from '@appointly/shared';
import { asyncHandler } from '../../lib/http/async-handler';
import { authenticate } from '../../middleware/authenticate.middleware';
import { chatRateLimit } from '../../middleware/rate-limit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { chatController } from './chat.controller';

/** Chat routes; only the message endpoint takes the stricter rate limit, since it is the one that can trigger a paid model call. */
export const chatRouter: Router = Router();

const sessionParamsSchema = z.object({
  id: z.uuid('Invalid conversation id'),
});

chatRouter.use(authenticate);

chatRouter.post('/sessions/active', asyncHandler(chatController.startSession));

chatRouter.get(
  '/sessions',
  validate({ query: listChatSessionsQuerySchema }),
  asyncHandler(chatController.listSessions),
);

chatRouter.post(
  '/sessions',
  validate({ body: createChatSessionSchema }),
  asyncHandler(chatController.createSession),
);

chatRouter.get(
  '/sessions/:id',
  validate({ params: sessionParamsSchema }),
  asyncHandler(chatController.getSession),
);

chatRouter.post(
  '/sessions/:id/messages',
  chatRateLimit,
  validate({ params: sessionParamsSchema, body: sendMessageSchema }),
  asyncHandler(chatController.sendMessage),
);
