/**
 * PrinterCapabilities — value object representing immutable physical printer specs.
 *
 * RFC-008 Refinement 4 Specification
 */
export class PrinterCapabilities {
  constructor(
    public readonly pagesPerMinute: number,
    public readonly duplexSupported: boolean,
    public readonly colorSupported: boolean,
    public readonly supportedPaperSizes: string[],
    public readonly maximumPaperWeight: number,
    public readonly printableMedia: string[],
    public readonly warmupTimeSeconds: number = 30
  ) {
    if (pagesPerMinute <= 0) {
      throw new Error('pagesPerMinute must be positive');
    }
    if (maximumPaperWeight <= 0) {
      throw new Error('maximumPaperWeight must be positive');
    }
    if (supportedPaperSizes.length === 0) {
      throw new Error('supportedPaperSizes cannot be empty');
    }
  }

  /**
   * Evaluates if this printer is compatible with a target print configuration request.
   */
  public isCompatible(requirements: {
    color: boolean;
    duplex: boolean;
    paperSize: string;
    paperWeight?: number;
    mediaType?: string;
  }): boolean {
    if (requirements.color && !this.colorSupported) {
      return false;
    }
    if (requirements.duplex && !this.duplexSupported) {
      return false;
    }
    if (!this.supportedPaperSizes.includes(requirements.paperSize)) {
      return false;
    }
    if (requirements.paperWeight && requirements.paperWeight > this.maximumPaperWeight) {
      return false;
    }
    if (requirements.mediaType && !this.printableMedia.includes(requirements.mediaType)) {
      return false;
    }
    return true;
  }
}
