import { ProjectionEventHandler } from '../ProjectionEventHandler';
import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionContext } from '../ProjectionContext';
import { LifecycleState } from '../../domain/enums/LifecycleState';
import { ActorType } from '../../domain/enums/ActorType';

export class PaymentConfirmedProjectionHandler implements ProjectionEventHandler {
  public async handle(event: DomainEvent, context: ProjectionContext): Promise<void> {
    const { payload } = event;
    const orderId = Number(payload.orderId);
    const invoiceNumber = payload.invoiceNumber ? String(payload.invoiceNumber) : null;
    const paymentStatus = payload.paymentStatus ? String(payload.paymentStatus) : 'CAPTURED';

    await context.projectionUpdateService.transition(
      {
        orderId,
        event,
        targetState: LifecycleState.CONFIRMED,
        title: 'PAYMENT_CONFIRMED',
        description: invoiceNumber
          ? `Payment verified successfully. Invoice ${invoiceNumber} generated.`
          : 'Payment verified successfully.',
        actorType: ActorType.SYSTEM,
        actorId: null,
        metadata: {
          invoiceNumber,
          paymentStatus,
          paymentReference: payload.paymentReference,
          gatewayPaymentId: payload.gatewayPaymentId
        },
        applyChanges: (proj) => {
          proj.paymentStatus = paymentStatus;
          if (invoiceNumber) {
            proj.invoiceNumber = invoiceNumber;
          }
        }
      },
      context.connection
    );
  }
}
