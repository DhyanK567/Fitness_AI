import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { verifyHmacSignature } from '../../common/signature';
import { WebhookIngestDatabaseService } from './webhook-ingest-database.service';

export interface ProcessWebhookParams {
  signature?: string;
  rawBody?: Buffer | string;
  correlationId?: string;
  ip?: string;
}

export interface ProcessWebhookResult {
  success: boolean;
  duplicate: boolean;
  event_id: string;
}

@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ingestDb: WebhookIngestDatabaseService,
  ) {}

  /**
   * Processes a platform SaaS subscription webhook from Razorpay.
   * 1. Validates signature presence and authentic raw body.
   * 2. Rejects invalid or missing signatures without writing to the database.
   * 3. Computes the SHA-256 hash of the exact raw body bytes.
   * 4. Validates payload JSON structure, event ID, and event type.
   * 5. Persists verified events to platform.platform_webhook_inbox via the dedicated ingest role.
   * 6. Returns success with duplicate status idempotently.
   */
  async processWebhook(params: ProcessWebhookParams): Promise<ProcessWebhookResult> {
    if (!params.signature || typeof params.signature !== 'string' || !params.signature.trim()) {
      this.logger.warn('Rejected Razorpay webhook: missing x-razorpay-signature header');
      throw new UnauthorizedException('Missing x-razorpay-signature header');
    }

    if (!params.rawBody || (Buffer.isBuffer(params.rawBody) ? params.rawBody.length === 0 : params.rawBody.trim().length === 0)) {
      this.logger.warn('Rejected Razorpay webhook: missing or empty raw request body');
      throw new BadRequestException('Raw request body is required for signature verification');
    }

    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('Rejected Razorpay webhook: RAZORPAY_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Webhook verification secret is not configured');
    }

    const isValidSignature = verifyHmacSignature(params.rawBody, params.signature, secret);
    if (!isValidSignature) {
      this.logger.warn('Rejected Razorpay webhook: invalid signature');
      throw new UnauthorizedException('Invalid x-razorpay-signature');
    }

    const rawBuffer = Buffer.isBuffer(params.rawBody) ? params.rawBody : Buffer.from(params.rawBody, 'utf8');
    const rawBodySha256 = createHash('sha256').update(rawBuffer).digest('hex');

    let payload: Record<string, any>;
    try {
      payload = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      this.logger.warn('Rejected Razorpay webhook: malformed JSON payload');
      throw new BadRequestException('Malformed webhook payload: invalid JSON');
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      this.logger.warn('Rejected Razorpay webhook: payload must be a JSON object');
      throw new BadRequestException('Malformed webhook payload: expected JSON object');
    }

    const rawEventId = payload.id ?? payload.event_id;
    const eventId = typeof rawEventId === 'string' || typeof rawEventId === 'number' ? String(rawEventId).trim() : '';
    if (!eventId) {
      this.logger.warn('Rejected Razorpay webhook: missing event identifier');
      throw new BadRequestException('Webhook payload missing event identifier');
    }
    if (eventId.length > 160) {
      throw new BadRequestException('Webhook event ID exceeds maximum length of 160 characters');
    }

    const rawEventType = payload.event ?? payload.event_type;
    const eventType = typeof rawEventType === 'string' ? rawEventType.trim() : '';
    if (!eventType) {
      this.logger.warn('Rejected Razorpay webhook: missing event type');
      throw new BadRequestException('Webhook payload missing event type');
    }
    if (eventType.length > 80) {
      throw new BadRequestException('Webhook event type exceeds maximum length of 80 characters');
    }

    const result = await this.ingestDb.recordEvent({
      provider: 'razorpay',
      providerEventId: eventId,
      eventType,
      payload,
      rawBodySha256,
    });

    this.logger.log(`Razorpay platform webhook recorded: eventId=${eventId}, type=${eventType}, duplicate=${result.duplicate}`);

    return {
      success: true,
      duplicate: result.duplicate,
      event_id: eventId,
    };
  }
}
