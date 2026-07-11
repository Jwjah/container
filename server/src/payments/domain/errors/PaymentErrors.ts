export class PaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Domain layer errors
export class PaymentDomainError extends PaymentError {}

export class InvalidStateTransitionError extends PaymentDomainError {
  constructor(from: string, to: string) {
    super(`Invalid payment state transition from ${from} to ${to}`);
  }
}

export class PaymentValidationError extends PaymentDomainError {
  constructor(message: string) {
    super(`Validation failed: ${message}`);
  }
}

// Gateway errors
export class PaymentGatewayError extends PaymentError {}

export class WebhookVerificationError extends PaymentGatewayError {
  constructor(message: string = 'Invalid webhook signature') {
    super(message);
  }
}

export class ProviderApiError extends PaymentGatewayError {
  public readonly gateway: string;
  public readonly rawError: any;

  constructor(gateway: string, message: string, rawError?: any) {
    super(`Gateway [${gateway}] API error: ${message}`);
    this.gateway = gateway;
    this.rawError = rawError;
  }
}

// Repository / Database errors
export class PaymentRepositoryError extends PaymentError {
  constructor(message: string, public readonly originalError?: any) {
    super(`Database error: ${message}`);
  }
}
