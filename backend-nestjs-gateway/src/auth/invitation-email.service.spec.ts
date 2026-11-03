import { ServiceUnavailableException } from '@nestjs/common';
import { InvitationEmailService } from './invitation-email.service';

describe('InvitationEmailService', () => {
  it('requires a real provider in production when neither SMTP nor Resend is set', () => {
    const service = new InvitationEmailService({ get: (key: string) => key === 'NODE_ENV' ? 'production' : undefined } as any);
    expect(() => service.assertConfigured()).toThrow(ServiceUnavailableException);
  });

  it('permits production when SMTP credentials are provided', () => {
    const service = new InvitationEmailService({
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SMTP_HOST') return 'smtp.gmail.com';
        if (key === 'SMTP_USER') return 'owner@studio.com';
        if (key === 'SMTP_PASSWORD') return 'app-pass';
        return undefined;
      },
    } as any);
    expect(() => service.assertConfigured()).not.toThrow();
  });

  it('permits copy-link development when delivery is not configured', async () => {
    const service = new InvitationEmailService({ get: () => undefined } as any);
    expect(await service.send({
      to: 'trainer@studio.in', fullName: 'Trainer', studioName: 'Studio', roleLabel: 'Trainer',
      setupUrl: 'http://localhost/setup', expiresAt: new Date(),
    })).toBe('not_configured');
  });

  it('sends invitation email via SMTP transporter when configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-123' });
    const mockTransporter: any = { sendMail };
    const config = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'SMTP_HOST') return 'smtp.gmail.com';
        if (key === 'SMTP_USER') return 'owner@studio.com';
        if (key === 'SMTP_PASSWORD') return 'app-password';
        if (key === 'SMTP_FROM') return 'Wellness Studio OS <owner@studio.com>';
        return undefined;
      },
    } as any;

    const service = new InvitationEmailService(config);
    service.setTransporter(mockTransporter);
    const result = await service.send({
      to: 'trainer@studio.in',
      fullName: 'Tahir',
      studioName: 'Fitness Workspace',
      roleLabel: 'Trainer',
      setupUrl: 'http://localhost:3000/staff-login?mode=setup&token=abc123token',
      expiresAt: new Date(),
    });

    expect(result).toBe('sent');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'trainer@studio.in',
      from: 'Wellness Studio OS <owner@studio.com>',
      subject: 'You are invited to Fitness Workspace',
    }));
  });

  it('does not attempt development delivery to recipients outside the Resend allowlist', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new InvitationEmailService({
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'RESEND_API_KEY') return 'test-key';
        return undefined;
      },
    } as any);

    const result = await service.send({
      to: 'trainer@studio.in', fullName: 'Trainer', studioName: 'Studio', roleLabel: 'Trainer',
      setupUrl: 'http://localhost/setup', expiresAt: new Date(),
    });

    expect(result).toBe('sandbox_restricted');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
