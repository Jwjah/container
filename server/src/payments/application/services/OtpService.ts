import crypto from 'crypto';

export class OtpService {
  public generateOtp(): string {
    // Generate a cryptographically secure random 6-digit number
    return crypto.randomInt(100000, 999999).toString();
  }

  public hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  public compareOtp(rawOtp: string, hashedOtp: string): boolean {
    const inputHash = this.hashOtp(rawOtp);
    return crypto.timingSafeEqual(
      Buffer.from(inputHash, 'hex'),
      Buffer.from(hashedOtp, 'hex')
    );
  }
}
