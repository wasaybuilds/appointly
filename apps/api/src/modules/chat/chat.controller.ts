import type { Request, Response } from 'express';
import type { CreateChatSessionInput, PaginationQuery, SendMessageInput } from '@appointly/shared';
import { sendPaginated, sendSuccess } from '../../lib/http/respond';
import { requireActor } from '../../middleware/authenticate.middleware';
import { getValidated } from '../../middleware/validate.middleware';
import { chatService } from './chat.service';

// Handlers are arrow functions so they stay correct when the router passes them detached.
// Send-message returns the whole turn, so a client works from the HTTP response alone and the socket layer stays an enhancement.

interface SessionParams {
  id: string;
}

export const chatController = {
  startSession: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const result = await chatService.startSession(actor);

    sendSuccess(res, result);
  },

  createSession: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { body } = getValidated<CreateChatSessionInput>(req);

    const session = await chatService.createSession(actor, body.title ?? null);

    sendSuccess(res, session, 201);
  },

  listSessions: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { query } = getValidated<unknown, PaginationQuery>(req);

    const { sessions, meta } = await chatService.listSessions(actor, query);

    sendPaginated(res, sessions, meta);
  },

  getSession: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { params } = getValidated<unknown, unknown, SessionParams>(req);

    const result = await chatService.getSession(actor, params.id);

    sendSuccess(res, result);
  },

  sendMessage: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { body, params } = getValidated<SendMessageInput, unknown, SessionParams>(req);

    const turn = await chatService.sendMessage(actor, params.id, body.content);

    sendSuccess(res, turn, 201);
  },
};
