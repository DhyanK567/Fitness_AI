import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { verifyHmacSignature } from '../common/signature';
import { ErpnextService } from '../erpnext/erpnext.service';

type WebhookContext = { tenantId: string; tenantCode: string; correlationId: string; ipAddress?: string; route?: string; signature: string; rawBody: string };

@Injectable()
export class PaymentWebhookService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly erp: ErpnextService,
  ) {}

  async process(context: WebhookContext) {
    const secret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!secret || !verifyHmacSignature(context.rawBody, context.signature, secret)) {
      try {
        await this.prisma.withTenant(context.tenantId, (tx) => tx.securityEvent.create({
          data: { tenantId: context.tenantId, eventType: 'razorpay.invalid_signature', severity: 'high', ipAddress: context.ipAddress, route: context.route?.slice(0, 200), correlationId: context.correlationId, details: { provider: 'razorpay' } },
        }));
      } catch { /* Authentication failure still wins if audit storage is unavailable. */ }
      throw new UnauthorizedException('Invalid payment webhook signature');
    }
    let payload: Record<string, any>;
    try { payload = JSON.parse(context.rawBody); } catch { throw new BadRequestException('Invalid payment webhook payload'); }
    const eventId = String(payload.id ?? '');
    if (!eventId) throw new BadRequestException('Payment webhook event ID is required');
    const key = { tenantId: context.tenantId, provider: 'razorpay', providerEventId: eventId };
    if (payload.event !== 'payment.captured') {
      try {
        await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.create({ data: { ...key, payload, status: 'ignored', processedAt: new Date() } }));
        return { event_id: eventId, status: 'pending', duplicate: false, ignored: true };
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        return { event_id: eventId, status: 'ignored', duplicate: true };
      }
    }
    const existing = await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.findUnique({ where: { tenantId_provider_providerEventId: key } }));
    if (existing && !['received', 'failed', 'processing'].includes(existing.status)) return { event_id: eventId, status: existing.status, duplicate: true };
    const payment = payload.payment ?? payload.payload?.payment?.entity;
    if (!payment?.id || !payment?.order_id || !payment?.currency || !Number.isInteger(payment.amount) || payment.amount <= 0) {
      throw new BadRequestException('Payment webhook is missing required payment fields');
    }
    const orderRecord = await this.prisma.withTenant(context.tenantId, (tx) => tx.idempotencyKey.findFirst({
      where: {
        tenantId: context.tenantId,
        responseBody: { path: ['provider_order', 'id'], equals: String(payment.order_id) },
      },
    }));
    const stored = orderRecord?.responseBody as {
      member_id?: string;
      erp_payment_idempotency_key?: string;
      amount?: number;
      currency?: string;
      membership_id?: string;
      booking_id?: string;
      provider_order?: { id?: string; amount?: number; currency?: string; notes?: Record<string, string> };
    } | null;
    if (!orderRecord || !stored || stored.provider_order?.id !== String(payment.order_id)
      || !stored.member_id || !stored.erp_payment_idempotency_key
      || Number(stored.provider_order.amount) !== Number(payment.amount)
      || String(stored.provider_order.currency).toUpperCase() !== String(payment.currency).toUpperCase()
      || stored.provider_order.notes?.tenant_code !== context.tenantCode
      || stored.provider_order.notes?.member_id !== stored.member_id
      || String(stored.provider_order.notes?.membership_id ?? '') !== (stored.membership_id ?? '')
      || String(stored.provider_order.notes?.booking_id ?? '') !== (stored.booking_id ?? '')) {
      throw new BadRequestException('Captured payment does not match a pending order for this tenant');
    }
    if (existing) {
      const recoveryThreshold = Date.now() - 5 * 60 * 1000;
      if (existing.status === 'processing' && existing.updatedAt.getTime() > recoveryThreshold) {
        return { event_id: eventId, status: 'processing', duplicate: true };
      }
      const claimed = await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.updateMany({
        where: { ...key, status: existing.status, ...(existing.status === 'processing' ? { updatedAt: existing.updatedAt } : {}) },
        data: { status: 'processing' },
      }));
      if (claimed.count !== 1) return { event_id: eventId, status: 'processing', duplicate: true };
    } else {
      try {
        await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.create({ data: { ...key, payload, status: 'processing' } }));
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
        const raced = await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.findUnique({ where: { tenantId_provider_providerEventId: key } }));
        return { event_id: eventId, status: raced?.status ?? 'processing', duplicate: true };
      }
    }
    let result: { payment_id: string; status: string };
    try {
      result = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.payment.post_payment', idempotencyKey: stored.erp_payment_idempotency_key, body: {
        tenant: context.tenantCode,
        member: stored.member_id,
        membership: stored.membership_id || undefined,
        booking: stored.booking_id,
        purpose: stored.membership_id ? 'membership' : 'other',
        provider: 'razorpay',
        amount: Number(payment.amount) / 100,
        currency: String(payment.currency ?? 'INR'),
        idempotency_key: stored.erp_payment_idempotency_key,
        provider_reference: payment.id,
        provider_order_reference: String(payment.order_id),
      } });
    } catch (error) {
      await this.prisma.withTenant(context.tenantId, (tx) => tx.webhookInbox.updateMany({ where: { ...key, status: 'processing' }, data: { status: 'failed' } }));
      throw error;
    }
    await this.prisma.withTenant(context.tenantId, async (tx) => {
      await this.auditOutbox.recordInTransaction(tx, { tenantId: context.tenantId, correlationId: context.correlationId, actorType: 'system', action: 'payment.webhook.processed', resourceType: 'payment', resourceRef: String(result.payment_id), eventType: 'payment.confirmed', payload: { eventId, paymentId: result.payment_id } });
      const currentOrder = await tx.idempotencyKey.findUnique({ where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: orderRecord.idempotencyKey } } });
      const previousOrderResponse = currentOrder?.responseBody as Record<string, unknown> | null;
      const previousProviderOrder = previousOrderResponse?.provider_order as Record<string, unknown> | undefined;
      if (!previousOrderResponse || previousProviderOrder?.id !== String(payment.order_id)) {
        throw new BadRequestException('Pending payment response no longer matches the captured order');
      }
      await tx.idempotencyKey.update({
        where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey: orderRecord.idempotencyKey } },
        data: { responseStatus: 200, responseBody: { ...previousOrderResponse, status: 'success', erp_payment_id: result.payment_id, razorpay_payment_id: String(payment.id), paid_at: new Date().toISOString() } },
      });
      await tx.webhookInbox.update({ where: { tenantId_provider_providerEventId: key }, data: { status: 'processed', processedAt: new Date() } });
    });
    return { event_id: eventId, status: result.status, duplicate: false };
  }
}
