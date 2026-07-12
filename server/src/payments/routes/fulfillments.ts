import { Router } from 'express';
import { FulfillmentController } from '../interfaces/controllers/FulfillmentController';

const { authenticate } = require('../../middleware/auth');

export function createFulfillmentRouter(controller: FulfillmentController): Router {
  const router = Router();

  router.post('/:id/assign-agent', authenticate, controller.assignAgent);
  router.post('/:id/start-delivery', authenticate, controller.startDelivery);
  router.post('/:id/verify-otp', authenticate, controller.verifyOtp);
  router.post('/:id/complete-delivery', authenticate, controller.completeDelivery);
  router.post('/:id/complete-pickup', authenticate, controller.completePickup);
  router.post('/:id/fail-delivery', authenticate, controller.failDelivery);
  router.post('/:id/regenerate-otp', authenticate, controller.regenerateOtp);

  return router;
}
