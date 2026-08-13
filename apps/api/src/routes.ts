import { Router } from 'express';
import type { Request, Response } from 'express';
import { env } from './config/env';
import { sendSuccess } from './lib/http/respond';
import { appointmentRouter } from './modules/appointments/appointment.routes';
import { authRouter } from './modules/auth/auth.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { chatRouter } from './modules/chat/chat.routes';

/** Versioned from day one so a breaking change can ship as `/api/v2` beside the current contract. */
export const API_PREFIX = '/api/v1';

export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/services', catalogRouter);
apiRouter.use('/appointments', appointmentRouter);
apiRouter.use('/chat', chatRouter);

// Non-secret runtime config, so the client can tell the user why the assistant is in fallback mode.
apiRouter.get('/meta', (_req: Request, res: Response) => {
  sendSuccess(res, {
    aiEnabled: env.ai.isConfigured,
    aiModel: env.ai.isConfigured ? env.ai.model : null,
    businessHours: {
      timezone: env.business.timezone,
      openHour: env.business.openHour,
      closeHour: env.business.closeHour,
    },
  });
});
