import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import { Prisma } from '@prisma/client';

interface OutboxEvent {
  id: string;
  tenantId: string;
  eventType: string;
  subjectType: string;
  subjectRef: string;
  payload: Prisma.JsonValue;
  correlationId: string;
  status: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export type DeliveryExecutionMode = 'simulated' | 'live' | 'unknown';

export type DeliverySemanticStatus =
  | 'simulated'
  | 'accepted_for_processing'
  | 'provider_accepted'
  | 'confirmed_delivered'
  | 'unknown';

export interface DeliveryResult {
  success: boolean;
  deliveryMode: DeliveryExecutionMode;
  deliveryStatus: DeliverySemanticStatus;
  provider: string;
  providerMessageId?: string | null;
  recipient?: string;
  template?: string;
  rawResponse?: Record<string, unknown>;
}

interface DispatchHandler {
  (event: OutboxEvent): Promise<DeliveryResult | void>;
}

@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly handlers = new Map<string, DispatchHandler>();
  private isRunning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisClient,
  ) {
    this.batchSize = parseInt(config.get('OUTBOX_BATCH_SIZE') ?? '100', 10);
    this.pollIntervalMs = parseInt(config.get('OUTBOX_POLL_INTERVAL_MS') ?? '5000', 10);
    this.maxAttempts = parseInt(config.get('OUTBOX_MAX_ATTEMPTS') ?? '5', 10);
  }

  onModuleInit() {
    // Register default handlers
    this.registerHandler('booking.created', this.handleBookingCreated.bind(this));
    this.registerHandler('booking.cancelled', this.handleBookingCancelled.bind(this));
    this.registerHandler('booking.promoted', this.handleBookingPromoted.bind(this));
    this.registerHandler('payment.received', this.handlePaymentReceived.bind(this));
    this.registerHandler('lead.created', this.handleLeadCreated.bind(this));
    this.registerHandler('member.created', this.handleMemberCreated.bind(this));
    this.registerHandler('membership.activated', this.handleMembershipActivated.bind(this));
    this.registerHandler('membership.expired', this.handleMembershipExpired.bind(this));
    this.registerHandler('attendance.checked_in', this.handleAttendanceCheckedIn.bind(this));
    this.registerHandler('event.registration.confirmed', this.handleEventRegistrationConfirmed.bind(this));
    this.registerHandler('ai.enquiry.escalated', this.handleAiEnquiryEscalated.bind(this));

    // Start polling
    this.startPolling();
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  registerHandler(eventType: string, handler: DispatchHandler): void {
    this.handlers.set(eventType, handler);
  }

  private startPolling(): void {
    this.isRunning = true;
    this.poll();
  }

  private stopPolling(): void {
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    // If notifications are explicitly disabled via configuration, pause dispatching
    // so events remain safely in 'pending' and are not marked delivered or failed.
    const isDeliveryDisabled =
      this.config.get('OUTBOX_DELIVERY_DISABLED') === 'true' ||
      this.config.get('NOTIFICATIONS_ENABLED') === 'false';

    if (isDeliveryDisabled) {
      this.logger.debug(
        'Outbox notification delivery is explicitly disabled via configuration; skipping dispatch cycle.',
      );
      if (this.isRunning) {
        this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
      }
      return;
    }

    try {
      await this.processBatch();
    } catch (error) {
      this.logger.error('Outbox polling error', error);
    }

    if (this.isRunning) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }

  private async processBatch(): Promise<void> {
    const tenants = await this.getActiveTenants();

    for (const tenantId of tenants) {
      await this.processTenantBatch(tenantId);
    }
  }

  private async getActiveTenants(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT DISTINCT tenant_id FROM ops.outbox_events
      WHERE status IN ('pending', 'failed') AND attempts < ${this.maxAttempts}
        AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
    `;
    return result.map((r) => r.tenant_id);
  }

  /** Exponential backoff: base * 2^attempts, capped at `maxBackoffMs`. */
  private computeBackoffMs(attempt: number): number {
    const baseMs = parseInt(this.config.get('OUTBOX_BACKOFF_BASE_MS') ?? '5000', 10);
    const maxMs = parseInt(this.config.get('OUTBOX_BACKOFF_MAX_MS') ?? '3600000', 10);
    return Math.min(baseMs * 2 ** Math.max(attempt, 0), maxMs);
  }

  private async processTenantBatch(tenantId: string): Promise<void> {
    // 1. Recover stale dispatching claims older than 5 minutes (crashed worker recovery)
    // If a worker crashed while dispatching, reset the row to 'failed' with next_attempt_at = NOW()
    // so it can be retried by the next poll cycle without getting permanently stuck.
    try {
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.$executeRaw`
          UPDATE ops.outbox_events
          SET status = 'failed',
              next_attempt_at = NOW(),
              updated_at = NOW()
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'dispatching'
            AND updated_at < NOW() - INTERVAL '5 minutes'
        `;
      });
    } catch (recoverErr) {
      this.logger.warn(`Failed to recover stale dispatching claims for tenant ${tenantId}:`, recoverErr);
    }

    // 2. Claim atomically by flipping pending/failed -> dispatching inside the tenant
    // transaction. Two workers running concurrently will not claim the same
    // row: the inner SELECT ... FOR UPDATE SKIP LOCKED only sees eligible rows,
    // and the UPDATE commits before we start processing.
    const events = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.$queryRaw<OutboxEvent[]>`
        UPDATE ops.outbox_events
        SET status = 'dispatching', updated_at = NOW()
        WHERE id IN (
          SELECT id FROM ops.outbox_events
          WHERE tenant_id = ${tenantId}::uuid
            AND status IN ('pending', 'failed')
            AND attempts < ${this.maxAttempts}
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
          ORDER BY created_at ASC
          LIMIT ${this.batchSize}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, tenant_id as "tenantId", event_type as "eventType",
                  subject_type as "subjectType", subject_ref as "subjectRef",
                  payload, correlation_id as "correlationId", status, attempts,
                  created_at as "createdAt", updated_at as "updatedAt"
      `;
    });

    for (const event of events) {
      await this.processEvent(tenantId, event);
    }
  }

  private async processEvent(tenantId: string, event: OutboxEvent): Promise<void> {
    const eventType = event.eventType || (event as any).event_type;
    const handler = this.handlers.get(eventType);
    if (!handler) {
      this.logger.warn(`No handler for event type: ${eventType}`);
      await this.markFailed(tenantId, event, `No handler for event type: ${eventType}`);
      return;
    }

    try {
      const result = await handler(event);
      await this.markSuccess(tenantId, event, (result as DeliveryResult) || undefined);
    } catch (error) {
      this.logger.error(`Failed to process event ${event.id}:`, error);
      await this.markFailed(tenantId, event, error instanceof Error ? error.message : String(error));
    }
  }

  private async markSuccess(
    tenantId: string,
    event: OutboxEvent,
    result?: DeliveryResult,
  ): Promise<void> {
    const isSimulated =
      result?.deliveryMode === 'simulated' || result?.deliveryStatus === 'simulated';

    // Extract and preserve existing payload
    let existingPayload: Record<string, unknown> = {};
    if (typeof event.payload === 'object' && event.payload !== null && !Array.isArray(event.payload)) {
      existingPayload = { ...(event.payload as Record<string, unknown>) };
    } else if (typeof event.payload === 'string') {
      try {
        existingPayload = JSON.parse(event.payload);
      } catch {
        existingPayload = { rawPayload: event.payload };
      }
    }

    const deliveryAudit = {
      delivery_mode: result?.deliveryMode ?? (isSimulated ? 'simulated' : 'unknown'),
      delivery_status: result?.deliveryStatus ?? (isSimulated ? 'simulated' : 'unknown'),
      provider: result?.provider ?? (isSimulated ? 'whatsapp_mock' : 'unknown'),
      provider_message_id: result?.providerMessageId ?? null,
      dispatched_at: new Date().toISOString(),
      is_simulated: isSimulated,
      is_real_delivery:
        !isSimulated &&
        (result?.deliveryMode === 'live' ||
          result?.deliveryStatus === 'provider_accepted' ||
          result?.deliveryStatus === 'confirmed_delivered'),
      correlation_id: event.correlationId,
    };

    const updatedPayload = {
      ...existingPayload,
      _delivery: deliveryAudit,
    };

    await this.prisma.withTenant(tenantId, async (tx) => {
      if (isSimulated) {
        this.logger.log(
          `[MOCK DISPATCH] Outbox event ${event.id} (${event.eventType}) completed in SIMULATED mode. Not recorded as real delivery. Provider: ${result?.provider ?? 'whatsapp_mock'}`,
        );
        await tx.$executeRaw`
          UPDATE ops.outbox_events
          SET status = 'delivered',
              attempts = attempts + 1,
              delivered_at = NULL,
              payload = ${JSON.stringify(updatedPayload)}::jsonb,
              updated_at = NOW()
          WHERE id = ${event.id}::uuid
        `;
      } else {
        this.logger.log(
          `[LIVE DISPATCH] Outbox event ${event.id} (${event.eventType}) dispatched to provider ${result?.provider ?? 'unknown'} (msgId=${result?.providerMessageId || 'none'}, status=${result?.deliveryStatus ?? 'unknown'})`,
        );
        await tx.$executeRaw`
          UPDATE ops.outbox_events
          SET status = 'delivered',
              attempts = attempts + 1,
              delivered_at = NOW(),
              payload = ${JSON.stringify(updatedPayload)}::jsonb,
              updated_at = NOW()
          WHERE id = ${event.id}::uuid
        `;
      }
    });
  }

  private async markFailed(tenantId: string, event: OutboxEvent, error: string): Promise<void> {
    const nextAttempt = event.attempts + 1;
    const status = nextAttempt >= this.maxAttempts ? 'dead' : 'failed';
    const nextAttemptAt =
      status === 'failed' ? new Date(Date.now() + this.computeBackoffMs(event.attempts)) : new Date();

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.$executeRaw`
        UPDATE ops.outbox_events
        SET status = ${status}, attempts = ${nextAttempt}, next_attempt_at = ${nextAttemptAt}, updated_at = NOW()
        WHERE id = ${event.id}::uuid
      `;
    });

    if (status === 'dead') {
      await this.alertDeadLetter(tenantId, event, error);
    }
  }

  private async alertDeadLetter(tenantId: string, event: OutboxEvent, error: string): Promise<void> {
    this.logger.error(`DEAD LETTER: Event ${event.id} (${event.eventType}) failed permanently: ${error}`);
    // In production, could send alert to monitoring system
  }

  // ==================== Event Handlers ====================

  private async handleBookingCreated(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; session_id: string; booking_id: string };
    return await this.sendNotification(event.tenantId, {
      template: 'booking-confirmation',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleBookingCancelled(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; session_id: string; booking_id: string; reason?: string };
    return await this.sendNotification(event.tenantId, {
      template: 'booking-cancellation',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleBookingPromoted(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; session_id: string; booking_id: string };
    return await this.sendNotification(event.tenantId, {
      template: 'booking-promoted',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handlePaymentReceived(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; amount: number; payment_id: string; purpose: string };
    return await this.sendNotification(event.tenantId, {
      template: 'payment-received',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleLeadCreated(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { lead_id: string; name: string; phone: string; email?: string };
    return await this.sendNotification(event.tenantId, {
      template: 'lead-confirmation',
      to: payload.lead_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleMemberCreated(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; name: string; email?: string; phone: string };
    return await this.sendNotification(event.tenantId, {
      template: 'welcome',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleMembershipActivated(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; membership_id: string; plan_name: string; end_date: string };
    return await this.sendNotification(event.tenantId, {
      template: 'membership-activated',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleMembershipExpired(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; membership_id: string; plan_name: string };
    return await this.sendNotification(event.tenantId, {
      template: 'membership-expired',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleAttendanceCheckedIn(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; session_id: string; class_name: string };
    return await this.sendNotification(event.tenantId, {
      template: 'attendance-confirmed',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleEventRegistrationConfirmed(event: OutboxEvent): Promise<DeliveryResult> {
    const payload = event.payload as { member_id: string; event_id: string; event_name: string; event_date: string };
    return await this.sendNotification(event.tenantId, {
      template: 'event-registration',
      to: payload.member_id,
      data: payload,
      eventId: event.id,
      correlationId: event.correlationId,
    });
  }

  private async handleAiEnquiryEscalated(event: OutboxEvent): Promise<DeliveryResult | void> {
    if (event.status === 'delivered') {
      this.logger.warn(`Event ${event.id} already delivered. Skipping duplicate dispatch.`);
      return;
    }

    let payload = event.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (err) {
        throw new Error(
          `Malformed JSON payload in enquiry escalation event ${event.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error(`Invalid payload for enquiry escalation event ${event.id}: expected JSON object`);
    }

    const data = payload as Record<string, unknown>;
    const sessionId = (data.sessionId || data.session_id) as string | undefined;
    const handoffId = (data.handoffId || data.handoff_id) as string | undefined;
    const reason = (data.reason as string) || 'Prospect requested human assistance';
    const contact = (data.contact as string) || null;

    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new Error(`Missing required sessionId in enquiry escalation event ${event.id}`);
    }

    // Mask contact to avoid exposing sensitive PII in log streams
    const maskedContact = contact
      ? contact.length > 4
        ? `***${contact.slice(-4)}`
        : '***'
      : 'none';
    this.logger.log(
      `Dispatching enquiry escalation: tenant=${event.tenantId}, session=${sessionId}, handoff=${handoffId || 'none'}, contact=${maskedContact}`,
    );

    return await this.sendNotification(event.tenantId, {
      template: 'enquiry-escalated',
      to: contact || sessionId,
      eventId: event.id,
      correlationId: event.correlationId,
      data: {
        sessionId,
        handoffId: handoffId || event.subjectRef,
        reason,
        contact,
        escalatedAt: new Date().toISOString(),
      },
    });
  }

  private async sendNotification(
    tenantId: string,
    notification: {
      template: string;
      to: string;
      data: Record<string, unknown>;
      eventId?: string;
      correlationId?: string;
    },
  ): Promise<DeliveryResult> {
    const isDeliveryDisabled =
      this.config.get('OUTBOX_DELIVERY_DISABLED') === 'true' ||
      this.config.get('NOTIFICATIONS_ENABLED') === 'false';

    if (isDeliveryDisabled) {
      throw new Error(
        `Notification delivery is explicitly disabled via configuration (template=${notification.template})`,
      );
    }

    const n8nWebhookUrl =
      this.config.get<string>('N8N_WEBHOOK_URL') || process.env.N8N_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      throw new Error(
        `Delivery provider endpoint (N8N_WEBHOOK_URL) is not configured for template=${notification.template}`,
      );
    }

    const payload = {
      tenantId,
      eventId: notification.eventId || null,
      correlationId: notification.correlationId || null,
      idempotencyKey: notification.eventId ? `outbox_${notification.eventId}` : undefined,
      template: notification.template,
      to: notification.to,
      data: notification.data,
      timestamp: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeoutMs = parseInt(this.config.get('OUTBOX_WEBHOOK_TIMEOUT_MS') ?? '10000', 10);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${n8nWebhookUrl}/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
          ...(notification.eventId ? { 'X-Idempotency-Key': notification.eventId } : {}),
          ...(notification.correlationId ? { 'X-Correlation-Id': notification.correlationId } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(`n8n webhook returned HTTP ${response.status}: ${responseText}`);
      }

      let parsedBody: Record<string, unknown> = {};
      try {
        parsedBody = JSON.parse(responseText);
      } catch {
        // Non-JSON response (e.g. plain "OK")
      }

      // Check if response contains an application-level failure indicator
      if (parsedBody && parsedBody.success === false) {
        const errorMsg = (parsedBody.error || parsedBody.errorMessage || parsedBody.message || 'Notification dispatch failed') as string;
        const errorCode = (parsedBody.errorCode || parsedBody.error_code) as string;
        throw new Error(`n8n reported dispatch failure${errorCode ? ` [${errorCode}]` : ''}: ${errorMsg}`);
      }

      return this.classifyDeliveryResponse(parsedBody, notification);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send notification via n8n: ${errorMsg}`);
      throw error; // Re-throw to trigger retry/backoff lifecycle; event is never marked delivered
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private classifyDeliveryResponse(
    body: Record<string, unknown>,
    notification: { template: string; to: string },
  ): DeliveryResult {
    const rawDeliveryMode = String(body.deliveryMode || body.delivery_mode || '').toLowerCase();
    const rawStatus = String(body.status || '').toLowerCase();
    const rawDeliveryStatus = String(body.deliveryStatus || body.delivery_status || '').toLowerCase();
    const rawProvider = String(body.provider || '').toLowerCase();
    const whatsappMessageId = (body.whatsappMessageId || body.whatsapp_message_id || body.messageId || body.message_id) as string | undefined;

    // 1. Simulated / Mock Execution
    // Checked when mock indicators are present in response (Mock Delivery Log)
    const isMock =
      rawDeliveryMode === 'mock' ||
      rawStatus === 'mock' ||
      rawDeliveryStatus === 'mock_delivered' ||
      rawProvider === 'whatsapp_mock';

    if (isMock) {
      return {
        success: true,
        deliveryMode: 'simulated',
        deliveryStatus: 'simulated',
        provider: body.provider ? String(body.provider) : 'whatsapp_mock',
        providerMessageId: null,
        recipient: (body.recipient as string) || notification.to,
        template: (body.template as string) || notification.template,
        rawResponse: body,
      };
    }

    // 2. Confirmed Delivery (if supported by webhook or provider response)
    if (rawDeliveryStatus === 'delivered' || rawStatus === 'delivered' || body.confirmedDelivery === true) {
      return {
        success: true,
        deliveryMode: 'live',
        deliveryStatus: 'confirmed_delivered',
        provider: body.provider ? String(body.provider) : 'whatsapp_cloud_api',
        providerMessageId: whatsappMessageId || null,
        recipient: (body.recipient as string) || notification.to,
        template: (body.template as string) || notification.template,
        rawResponse: body,
      };
    }

    // 3. Provider / API Acceptance (Meta WhatsApp Cloud API accepted message with message ID)
    if (
      rawDeliveryMode === 'live' ||
      rawStatus === 'sent' ||
      rawDeliveryStatus === 'sent' ||
      rawProvider === 'whatsapp_cloud_api' ||
      Boolean(whatsappMessageId)
    ) {
      return {
        success: true,
        deliveryMode: 'live',
        deliveryStatus: 'provider_accepted',
        provider: body.provider ? String(body.provider) : 'whatsapp_cloud_api',
        providerMessageId: whatsappMessageId || null,
        recipient: (body.recipient as string) || notification.to,
        template: (body.template as string) || notification.template,
        rawResponse: body,
      };
    }

    // 4. Accepted for Processing (Sub-workflows like booking-confirmation returning 'dispatched')
    if (rawStatus === 'dispatched' || rawStatus === 'accepted' || rawStatus === 'queued') {
      return {
        success: true,
        deliveryMode: rawDeliveryMode === 'mock' ? 'simulated' : 'live',
        deliveryStatus: 'accepted_for_processing',
        provider: body.provider ? String(body.provider) : 'n8n_sub_workflow',
        providerMessageId: null,
        recipient: (body.recipient as string) || notification.to,
        template: (body.template as string) || notification.template,
        rawResponse: body,
      };
    }

    // Default / Unknown Fallback for plain text or generic HTTP 200 responses
    return {
      success: true,
      deliveryMode: 'unknown',
      deliveryStatus: 'unknown',
      provider: 'unknown',
      providerMessageId: null,
      recipient: notification.to,
      template: notification.template,
      rawResponse: body,
    };
  }
}