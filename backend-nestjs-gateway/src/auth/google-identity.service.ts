import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export type VerifiedGoogleIdentity = { subject: string };

@Injectable()
export class GoogleIdentityService {
  private client?: OAuth2Client;
  private clientId?: string;

  constructor(private readonly config: ConfigService) {}

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new ServiceUnavailableException('Google sign-in is not configured');
    if (!this.client || this.clientId !== clientId) {
      this.client = new OAuth2Client(clientId);
      this.clientId = clientId;
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.sub || payload.email_verified !== true) throw new Error('Unverified Google identity');
      return { subject: payload.sub };
    } catch (error) {
      if (typeof error === 'object' && error !== null && ('response' in error || 'code' in error)) {
        throw new ServiceUnavailableException('Google identity verification is unavailable');
      }
      throw new UnauthorizedException('Google ID token is invalid or its email is unverified');
    }
  }
}
