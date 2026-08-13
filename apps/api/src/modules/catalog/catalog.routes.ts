import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../lib/http/async-handler';
import { sendSuccess } from '../../lib/http/respond';
import { authenticate, requireActor } from '../../middleware/authenticate.middleware';
import { catalogRepository } from './catalog.repository';

/** Read-only catalogue routes; the handler stays inline because a pass-through service layer would add no behaviour. */
export const catalogRouter: Router = Router();

catalogRouter.use(authenticate);

catalogRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const actor = requireActor(req);
    const services = await catalogRepository.listActiveServices(actor.businessId);

    sendSuccess(res, services);
  }),
);
