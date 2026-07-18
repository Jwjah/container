import { Request, Response } from 'express';
import { PaymentService } from '../../application/services/PaymentService';
import { IOrderFinalizationService } from '../../application/services/IOrderFinalizationService';
import { CreatePaymentDTO } from '../../application/dtos/CreatePaymentDTO';
import { VerifyPaymentDTO } from '../../application/dtos/VerifyPaymentDTO';
import { CorrelationId } from '../../domain/value-objects/CorrelationId';
import { 
  PaymentValidationError, 
  InvalidStateTransitionError, 
  ProviderApiError, 
  PaymentRepositoryError 
} from '../../domain/errors/PaymentErrors';

export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly finalizationService: IOrderFinalizationService
  ) {}

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
          email: student.email,
          contact: student.phone || ''
        },
        readonly: {
          contact: true,
          email: true
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

  /**
   * HTTP handler to verify a checkout payment session.
   * POST /api/payments/verify
   */
  public verify = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'] as string | undefined;
    const cid = CorrelationId.fromString(correlationHeader);
    res.setHeader('x-correlation-id', cid.value);

    try {
      const { paymentUuid, gatewayPaymentId, gatewayOrderId, signature, rawProviderPayload } = req.body;

      const student = (req as any).user;
      if (!student || !student.id) {
        res.status(401).json({ error: 'Unauthorized: Authentication required' });
        return;
      }

      const dto: VerifyPaymentDTO = {
        paymentUuid,
        gatewayPaymentId,
        gatewayOrderId,
        signature,
        rawProviderPayload
      };

      const verificationResponse = await this.paymentService.verifyPayment(dto, student.id, cid);

      if (verificationResponse.status === 'CAPTURED') {
        await this.finalizationService.finalizeOrder(paymentUuid, cid);
      }

      res.status(200).json({
        message: 'Payment verified successfully',
        verification: verificationResponse
      });

    } catch (err: any) {
      console.error(`[${cid.value}] [PaymentController] Exception caught in verify handler:`, err);

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

  /**
   * HTTP handler to process incoming Razorpay webhooks.
   * POST /api/payments/webhook
   */
  public webhook = async (req: Request, res: Response): Promise<void> => {
    const correlationHeader = req.headers['x-correlation-id'] as string | undefined;
    const cid = CorrelationId.fromString(correlationHeader);
    res.setHeader('x-correlation-id', cid.value);

    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    const rawPayload = (req as any).rawBody;

    console.log(`[${cid.value}] [PaymentController] Webhook request received. Signature: ${signature ? 'present' : 'missing'}`);

    if (!signature) {
      res.status(400).json({ error: 'Missing x-razorpay-signature header' });
      return;
    }

    if (!rawPayload) {
      res.status(400).json({ error: 'Missing raw request body payload for verification' });
      return;
    }

    try {
      const paymentUuid = await this.paymentService.processWebhook(req.body, req.headers, signature, rawPayload, cid);
      
      if (paymentUuid) {
        try {
          await this.finalizationService.finalizeOrder(paymentUuid, cid);
        } catch (finalizeErr: any) {
          console.error(`[${cid.value}] [PaymentController] Warning: Order finalization failed on webhook. Will retry. Error:`, finalizeErr.message);
        }
      }

      // Return HTTP 200 for processed, duplicate, ignored, or permanent business validation errors
      res.status(200).json({ received: true });

    } catch (err: any) {
      console.error(`[${cid.value}] [PaymentController] Webhook processing failed:`, err);

      // Return HTTP 400 Bad Request ONLY for invalid signatures
      if (err instanceof PaymentValidationError && err.message.includes('Invalid webhook signature')) {
        res.status(400).json({ error: err.message });
        return;
      }

      // Return HTTP 500 ONLY for transient infrastructure errors so Razorpay retries
      res.status(500).json({ error: 'Transient infrastructure processing failure' });
    }
  };
}
