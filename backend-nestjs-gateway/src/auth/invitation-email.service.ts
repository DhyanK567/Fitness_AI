import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

type InvitationEmail = {
  to: string;
  fullName: string;
  studioName: string;
  roleLabel: string;
  setupUrl: string;
  expiresAt: Date;
};

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character] as string));

@Injectable()
export class InvitationEmailService {
  private smtpTransporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    this.initTransporter();
  }

  setTransporter(transporter: nodemailer.Transporter | null): void {
    this.smtpTransporter = transporter;
  }

  private initTransporter(): void {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASSWORD');
    const secure = this.config.get<string>('SMTP_SECURE') === 'true' || port === 465;

    if (host && user && pass) {
      this.smtpTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });
    }
  }

  assertConfigured(): void {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const hasSmtp = Boolean(
      this.config.get<string>('SMTP_HOST') &&
      this.config.get<string>('SMTP_USER') &&
      this.config.get<string>('SMTP_PASSWORD'),
    );
    const hasResend = Boolean(this.config.get<string>('RESEND_API_KEY'));

    if (isProduction && !hasSmtp && !hasResend) {
      throw new ServiceUnavailableException('Team invitation email delivery is not configured');
    }
  }

  private logSetupLink(input: InvitationEmail, sandboxFallback = false): void {
    console.log(`\n-------------------------------------------------------------`);
    console.log(`[TEAM INVITATION ONBOARDING LINK${sandboxFallback ? ' (SANDBOX FALLBACK)' : ''}]`);
    console.log(`Recipient : ${input.fullName} <${input.to}> (${input.roleLabel})`);
    console.log(`Setup URL : ${input.setupUrl}`);
    console.log(`Expires   : ${input.expiresAt.toISOString()}`);
    console.log(`-------------------------------------------------------------\n`);
  }

  async send(input: InvitationEmail): Promise<'sent' | 'not_configured' | 'sandbox_restricted'> {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    // SMTP remains the unrestricted production transport. Development delivery is
    // deliberately limited to the explicitly authorized Resend sandbox recipient.
    if (isProduction && this.smtpTransporter) {
      try {
        const from =
          this.config.get<string>('SMTP_FROM') ??
          this.config.get<string>('SMTP_USER') ??
          'Wellness Studio OS <onboarding@wellnessstudio.com>';

        await this.smtpTransporter.sendMail({
          from,
          to: input.to,
          subject: `You are invited to ${input.studioName}`,
          text: `${input.fullName}, you have been invited to ${input.studioName} as ${input.roleLabel}. Set your password and Google Authenticator before ${input.expiresAt.toISOString()}: ${input.setupUrl}`,
          html: `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#4f46e5">Wellness Studio OS</p><h1 style="font-size:26px">Join ${escapeHtml(input.studioName)}</h1><p>Hello ${escapeHtml(input.fullName)},</p><p>You have been invited as <strong>${escapeHtml(input.roleLabel)}</strong>. Use the secure button below to create your password and enroll Google Authenticator.</p><p style="margin:28px 0"><a href="${escapeHtml(input.setupUrl)}" style="background:#e11d48;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Set up my account</a></p><p style="font-size:13px;color:#64748b">This single-use link expires at ${escapeHtml(input.expiresAt.toISOString())}. If you did not expect this invitation, you can ignore this email.</p></div>`,
        });
        return 'sent';
      } catch (smtpError) {
        console.error('[InvitationEmailService] SMTP delivery error:', smtpError);
      }
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logSetupLink(input);
      return 'not_configured';
    }

    const developmentRecipient = (
      this.config.get<string>('RESEND_DEVELOPMENT_RECIPIENT') ?? 'marqetrondev@gmail.com'
    ).trim().toLowerCase();
    if (!isProduction && input.to.trim().toLowerCase() !== developmentRecipient) {
      this.logSetupLink(input, true);
      return 'sandbox_restricted';
    }

    const from = this.config.get<string>('INVITATION_FROM_EMAIL') ?? 'Wellness Studio OS <onboarding@example.com>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `You are invited to ${input.studioName}`,
        text: `${input.fullName}, you have been invited to ${input.studioName} as ${input.roleLabel}. Set your password and Google Authenticator before ${input.expiresAt.toISOString()}: ${input.setupUrl}`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a"><p style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#4f46e5">Wellness Studio OS</p><h1 style="font-size:26px">Join ${escapeHtml(input.studioName)}</h1><p>Hello ${escapeHtml(input.fullName)},</p><p>You have been invited as <strong>${escapeHtml(input.roleLabel)}</strong>. Use the secure button below to create your password and enroll Google Authenticator.</p><p style="margin:28px 0"><a href="${escapeHtml(input.setupUrl)}" style="background:#e11d48;color:white;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Set up my account</a></p><p style="font-size:13px;color:#64748b">This single-use link expires at ${escapeHtml(input.expiresAt.toISOString())}. If you did not expect this invitation, you can ignore this email.</p></div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const errorBody: any = await response.json().catch(() => ({}));
      if (!isProduction && response.status === 403) {
        console.warn(
          `[InvitationEmailService] Resend sandbox restriction: ${errorBody?.message ?? 'Testing emails can only be sent to the registered Resend account'}. Returning sandbox_restricted for link fallback.`,
        );
        this.logSetupLink(input, true);
        return 'sandbox_restricted';
      }
      throw new ServiceUnavailableException(`Invitation email provider rejected the request (${response.status})`);
    }

    return 'sent';
  }
}
