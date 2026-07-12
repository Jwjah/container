import { Router } from 'express';
import { PrintProductionController } from '../interfaces/controllers/PrintProductionController';
import { PrintProductionService } from '../application/services/PrintProductionService';
import { PrintJobAuthorizationService } from '../application/services/PrintJobAuthorizationService';
import { SqlPrintJobRepository } from '../infrastructure/persistence/SqlPrintJobRepository';
import { SqlPrintJobHistoryRepository } from '../infrastructure/persistence/SqlPrintJobHistoryRepository';
import { SqlOutboxRepository } from '../infrastructure/persistence/SqlOutboxRepository';

// Import auth middleware
const { authenticate } = require('../../middleware/auth');

const router = Router();

// Dependency Injection
const printJobRepository = new SqlPrintJobRepository();
const printJobHistoryRepository = new SqlPrintJobHistoryRepository();
const authorizationService = new PrintJobAuthorizationService(printJobRepository);
const outboxRepository = new SqlOutboxRepository();

const printProductionService = new PrintProductionService(
  printJobRepository,
  printJobHistoryRepository,
  authorizationService,
  outboxRepository
);

const controller = new PrintProductionController(printProductionService);

// Route mappings
router.post('/:id/accept', authenticate, controller.accept);
router.post('/:id/start-print', authenticate, controller.startPrint);
router.post('/:id/mark-ready', authenticate, controller.markReady);
router.post('/:id/cancel', authenticate, controller.cancel);
router.patch('/:id/scheduling', authenticate, controller.updateScheduling);

export default router;
