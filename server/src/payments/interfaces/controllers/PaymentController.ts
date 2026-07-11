import { Request, Response } from 'express';
import { PaymentService } from '../../application/services/PaymentService';
import { CreatePaymentDTO } from '../../application/dtos/CreatePaymentDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { 
  PaymentValidationError, 
  InvalidStateTransitionError, 
  ProviderApiError, 
  PaymentRepositoryError 
} from '../../domain/errors/PaymentErrors';

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * HTTP handler to initiate a payment session for an order.
   * POST /api/payments
   */
  public initiate = async (req: Request, res: Response): Promise<void> => {
    // Generate/Extract correlation ID for request tracing
    const correlationHeader = req.headers['x-correlation-id'] as string | undefined;
    const cid = CorrelationId.fromString(correlationHeader);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const { orderId, paymentMethod, gateway, idempotencyKey } = req.body;

      // Authenticated user check (populated by authenticate middleware)
      const student = (req as any).user;
      if (!student || !student.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const dto: CreatePaymentDTO = {
        orderId: parseInt(orderId),
        studentId: student.id,
        paymentMethod,
        gateway,
        idempotencyKey
      };

      // Delegate to PaymentService
      const paymentResponse = await this.paymentService.initiatePayment(dto, cid);

      // Generate checkout payload for frontend Razorpay SDK integration
      const checkoutPayload = {
        key: process.env.RAZORPAY_KEY_ID || 'dummy_key',
        amount: paymentResponse.amount,
        currency: paymentResponse.currency,
        name: 'CampusPrint',
        description: `Payment for Print Order #${paymentResponse.paymentReference}`,
        order_id: paymentResponse.gatewayOrderId,
        prefill: {
          name: student.name,
          email: student.email
        },
        notes: {
          paymentUuid: paymentResponse.uuid
        }
      };

      // If it is a fresh session vs an existing session, we can return 201 vs 200
      // In this case, we return 201 Created by default
      res.status(201).json({
        message: 'Payment session initiated successfully',
        payment: paymentResponse,
        checkoutPayload
      });

    } catch (err: any) {
      console.error(`[${cid.value}] [PaymentController] Exception caught in handler:`, err);

      if (err instanceof PaymentValidationError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof InvalidStateTransitionError) {
        res.status(400).json({ error: err.message });
      } else if (err instanceof ProviderApiError) {
        res.status(502).json({ error: err.message });
      } else if (err instanceof PaymentRepositoryError) {
        res.status(500).json({ error: err.message });
      } else {
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  };
}
