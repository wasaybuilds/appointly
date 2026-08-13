import type { Request, Response } from 'express';
import type {
  AvailabilityQuery,
  CreateAppointmentInput,
  ListAppointmentsQuery,
  RescheduleAppointmentInput,
  UpdateAppointmentStatusInput,
} from '@appointly/shared';
import { sendPaginated, sendSuccess } from '../../lib/http/respond';
import { requireActor } from '../../middleware/authenticate.middleware';
import { getValidated } from '../../middleware/validate.middleware';
import { notifier } from '../../realtime/notifier';
import { appointmentService } from './appointment.service';

// Handlers are arrow functions because the router receives them detached, so there is no `this` to lose.
// Realtime events are emitted here, after the write has committed, keeping the service free of transport concerns.

interface AppointmentParams {
  id: string;
}

export const appointmentController = {
  create: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { body } = getValidated<CreateAppointmentInput>(req);

    const appointment = await appointmentService.create(actor, body);

    notifier.appointmentCreated(actor.userId, appointment);
    sendSuccess(res, appointment, 201);
  },

  list: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { query } = getValidated<unknown, ListAppointmentsQuery>(req);

    const { appointments, meta } = await appointmentService.list(actor, query);

    sendPaginated(res, appointments, meta);
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { params } = getValidated<unknown, unknown, AppointmentParams>(req);

    const appointment = await appointmentService.getById(actor, params.id);

    sendSuccess(res, appointment);
  },

  reschedule: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { body, params } = getValidated<RescheduleAppointmentInput, unknown, AppointmentParams>(
      req,
    );

    const appointment = await appointmentService.reschedule(actor, params.id, body.startsAt);

    notifier.appointmentUpdated(actor.userId, appointment);
    sendSuccess(res, appointment);
  },

  updateStatus: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { body, params } = getValidated<UpdateAppointmentStatusInput, unknown, AppointmentParams>(
      req,
    );

    const appointment = await appointmentService.updateStatus(actor, params.id, body.status);

    notifier.appointmentUpdated(actor.userId, appointment);
    sendSuccess(res, appointment);
  },

  availability: async (req: Request, res: Response): Promise<void> => {
    const actor = requireActor(req);
    const { query } = getValidated<unknown, AvailabilityQuery>(req);

    const slots = await appointmentService.getAvailability(actor, query.serviceId, query.date);

    sendSuccess(res, slots);
  },
};
