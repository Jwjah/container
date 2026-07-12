import { Router } from 'express';
import { DeliveryController } from '../interfaces/controllers/DeliveryController';

export function createDeliveryRouter(controller: DeliveryController): Router {
  const router = Router();

  router.post('/dispatch', (req, res) => controller.dispatch(req, res));
  router.post('/:id/accept', (req, res) => controller.accept(req, res));
  router.post('/:id/reject', (req, res) => controller.reject(req, res));
  router.post('/:id/pickup', (req, res) => controller.pickup(req, res));
  router.post('/:id/complete', (req, res) => controller.complete(req, res));
  router.post('/:id/fail', (req, res) => controller.fail(req, res));
  router.post('/:id/reassign', (req, res) => controller.reassign(req, res));

  return router;
}
