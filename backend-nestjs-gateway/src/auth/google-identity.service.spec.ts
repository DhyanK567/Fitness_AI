import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdentityService } from './google-identity.service';

describe('GoogleIdentityService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('validates the ID token signature and configured audience through Google Auth Library', async () => {
    const verify: any = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    verify.mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject-123', email_verified: true }),
    } as any);
    const service = new GoogleIdentityService({ get: () => 'web-client-id' } as any);

    await expect(service.verify('valid.google.id.token')).resolves.toEqual({ subject: 'google-subject-123' });
    expect(verify).toHaveBeenCalledWith({ idToken: 'valid.google.id.token', audience: 'web-client-id' });
  });

  it('rejects tokens whose Google identity is not verified', async () => {
    const verify: any = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    verify.mockResolvedValue({
      getPayload: () => ({ sub: 'google-subject-123', email_verified: false }),
    } as any);
    const service = new GoogleIdentityService({ get: () => 'web-client-id' } as any);

    await expect(service.verify('unverified.google.id.token')).rejects.toThrow(UnauthorizedException);
  });

  it('reports verification-provider transport failures as unavailable, not bad credentials', async () => {
    const verify: any = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    verify.mockRejectedValue(Object.assign(new Error('certificate service timeout'), { code: 'ETIMEDOUT' }));
    const service = new GoogleIdentityService({ get: () => 'web-client-id' } as any);
    await expect(service.verify('otherwise.valid.google.id.token')).rejects.toThrow(ServiceUnavailableException);
  });

  it('fails closed when no Google client ID is configured', async () => {
    const service = new GoogleIdentityService({ get: () => undefined } as any);
    await expect(service.verify('google.id.token')).rejects.toThrow(ServiceUnavailableException);
  });
});
