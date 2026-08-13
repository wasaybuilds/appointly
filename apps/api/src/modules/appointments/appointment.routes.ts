import { Router } from 'express';
import { z } from 'zod';
import {
  availabilityQuerySchema,
  createAppointmentSchema,
  listAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
  updateAppointmentStatusSchema,
} from '@appointly/shared';
import { asyncHandler } from '../../lib/http/async-handler';
import { authenticate } from '../../middleware/authenticate.middleware';
import { validate } from '../../middleware/validate.middleware';
import { appointmentController } from './appointment.controller';

/** Appointment routes; authentication is applied router-wide so a new endpoint cannot accidentally omit it. */
export const appointmentRouter: Router = Router();

const appointmentParamsSchema = z.object({
  id: z.uuid('Invalid appointment id'),
});

appointmentRouter.use(authenticate);

// Declared before `/:id` so the literal path is not captured as an identifier.
appointmentRouter.get(
  '/availability',
  validate({ query: availabilityQuerySchema }),
  asyncHandler(appointmentController.availability),
);

appointmentRouter.get(
  '/',
  validate({ query: listAppointmentsQuerySchema }),
  asyncHandler(appointmentController.list),
);

appointmentRouter.post(
  '/',
  validate({ body: createAppointmentSchema }),
  asyncHandler(appointmentController.create),
);

appointmentRouter.get(
  '/:id',
  validate({ params: appointmentParamsSchema }),
  asyncHandler(appointmentController.getById),
);

appointmentRouter.patch(
  '/:id/reschedule',
  validate({ params: appointmentParamsSchema, body: rescheduleAppointmentSchema }),
  asyncHandler(appointmentController.reschedule),
);

appointmentRouter.patch(
  '/:id/status',
  validate({ params: appointmentParamsSchema, body: updateAppointmentStatusSchema }),
  asyncHandler(appointmentController.updateStatus),
);
