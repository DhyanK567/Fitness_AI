import { createHmac } from 'node:crypto';
import { jest } from '@jest/globals';
import { PaymentWebhookService } from './payment-webhook.service';

describe('PaymentWebhookService', () => {
  const secret = 'razorpay-test-secret';
  const prisma: any = {
    securityEvent: { create: jest.fn() },
    webhookInbox: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })) },
    idempotencyKey: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  };
  prisma.withTenant = jest.fn((_tenantId: string, work: (tx: any) => unknown) => work(prisma));
  const audit = { record: jest.fn(), recordInTransaction: jest.fn() } as any;
  const erp = { call: jest.fn() } as any;
  const config = { get: jest.fn(() => secret) } as any;
  const service = new PaymentWebhookService(config, prisma, audit, erp);
  const context = (rawBody: string) => ({
    tenantId: '123e4567-e89b-42d3-a456-426614174000', tenantCode: 'tenant-a', correlationId: 'correlation-a', ipAddress: '192.0.2.44', route: '/api/payments/webhook', rawBody,
    signature: createHmac('sha256', secret).update(rawBody).digest('hex'),
  });

  beforeEach(() => jest.clearAllMocks());

  const matchingOrder = (id: string) => ({ idempotencyKey: 'order-key-1', responseBody: { id: 'PAY-LOCAL-1', status: 'pending', erp_payment_id: 'WS-PAY-1', erp_payment_idempotency_key: 'erp-key-1', member_id: 'MEM-1', amount: 1500, currency: 'INR', provider_order: { id, amount: 150000, currency: 'INR', notes: { tenant_code: 'tenant-a', member_id: 'MEM-1', membership_id: '', booking_id: '' } } } });

  it('posts exactly one captured payment to ERP and records its audit/outbox event', async () => {
    const rawBody = JSON.stringify({ id: 'evt-1', event: 'payment.captured', payment: { id: 'pay-1', order_id: 'order-1', amount: 150000, currency: 'INR', notes: { member_id: 'MEM-1', tenant_code: 'tenant-a' } } });
    prisma.webhookInbox.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.findFirst.mockResolvedValue(matchingOrder('order-1'));
    prisma.idempotencyKey.findUnique.mockResolvedValue(matchingOrder('order-1'));
    erp.call.mockResolvedValue({ payment_id: 'PAY-1', status: 'Paid' });
    await expect(service.process(context(rawBody))).resolves.toMatchObject({ event_id: 'evt-1', status: 'Paid', duplicate: false });
    expect(erp.call).toHaveBeenCalledWith(expect.objectContaining({ method: 'wellness_studio.api.payment.post_payment', idempotencyKey: 'erp-key-1', body: expect.objectContaining({ provider_order_reference: 'order-1', idempotency_key: 'erp-key-1' }) }));
    expect(prisma.idempotencyKey.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ responseBody: expect.objectContaining({ status: 'success', razorpay_payment_id: 'pay-1' }) }) }));
    expect(audit.recordInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'payment.confirmed' }));
  });

  it('does not post a delayed signed payment event as Paid', async () => {
    const rawBody = JSON.stringify({ id: 'evt-delayed', event: 'payment.authorized' });
    prisma.webhookInbox.findUnique.mockResolvedValue(null);
    await expect(service.process(context(rawBody))).resolves.toMatchObject({ status: 'pending', ignored: true });
    expect(erp.call).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });

  it('does not process a replayed provider event twice', async () => {
    const rawBody = JSON.stringify({ id: 'evt-replay', event: 'payment.captured' });
    prisma.webhookInbox.findUnique.mockResolvedValue({ status: 'processed' });
    await expect(service.process(context(rawBody))).resolves.toMatchObject({ duplicate: true, status: 'processed' });
    expect(erp.call).not.toHaveBeenCalled();
  });

  it('releases a failed claim so a provider retry can complete safely', async () => {
    const rawBody = JSON.stringify({ id: 'evt-retry', event: 'payment.captured', payment: { id: 'pay-retry', order_id: 'order-retry', amount: 150000, currency: 'INR', notes: { member_id: 'MEM-1', tenant_code: 'tenant-a' } } });
    prisma.webhookInbox.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: 'failed' });
    prisma.idempotencyKey.findFirst.mockResolvedValue(matchingOrder('order-retry'));
    prisma.idempotencyKey.findUnique.mockResolvedValue(matchingOrder('order-retry'));
    erp.call.mockRejectedValueOnce(new Error('ERP temporarily unavailable')).mockResolvedValueOnce({ payment_id: 'PAY-RETRY', status: 'Paid' });
    await expect(service.process(context(rawBody))).rejects.toThrow('ERP temporarily unavailable');
    expect(prisma.webhookInbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'processing' }), data: { status: 'failed' } }));
    await expect(service.process(context(rawBody))).resolves.toMatchObject({ status: 'Paid', duplicate: false });
    expect(erp.call).toHaveBeenCalledTimes(2);
  });

  it('rejects a forged signature before persisting an event', async () => {
    const rawBody = JSON.stringify({ id: 'evt-forged', event: 'payment.captured' });
    await expect(service.process({ ...context(rawBody), signature: 'forged' })).rejects.toThrow('Invalid payment webhook signature');
    expect(prisma.securityEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      eventType: 'razorpay.invalid_signature', ipAddress: '192.0.2.44', route: '/api/payments/webhook',
    }) });
    expect(prisma.webhookInbox.create).not.toHaveBeenCalled();
  });

  it('rejects a captured payment whose amount does not match the tenant order', async () => {
    const rawBody = JSON.stringify({ id: 'evt-mismatch', event: 'payment.captured', payment: { id: 'pay-1', order_id: 'order-1', amount: 250000, currency: 'INR', notes: { member_id: 'MEM-1', tenant_code: 'tenant-a' } } });
    prisma.webhookInbox.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.findFirst.mockResolvedValue(matchingOrder('order-1'));
    await expect(service.process(context(rawBody))).rejects.toThrow('does not match a pending order');
    expect(erp.call).not.toHaveBeenCalled();
  });

  it('validates and persists the booking linked to a captured booking payment', async () => {
    const rawBody = JSON.stringify({ id: 'evt-booking', event: 'payment.captured', payment: { id: 'pay-booking', order_id: 'order-booking', amount: 150000, currency: 'INR', notes: { member_id: 'ATTACKER-MEMBER', booking_id: 'ATTACKER-BOOKING' } } });
    prisma.webhookInbox.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.findFirst.mockResolvedValue({ idempotencyKey: 'booking-order-key', responseBody: { erp_payment_idempotency_key: 'erp-booking-key', member_id: 'MEM-1', booking_id: 'BKG-1', amount: 1500, currency: 'INR', provider_order: { id: 'order-booking', amount: 150000, currency: 'INR', notes: { tenant_code: 'tenant-a', member_id: 'MEM-1', membership_id: '', booking_id: 'BKG-1' } } } });
    prisma.idempotencyKey.findUnique.mockResolvedValue({ responseBody: { provider_order: { id: 'order-booking' } } });
    erp.call.mockResolvedValue({ payment_id: 'PAY-BOOKING', status: 'Paid' });

    await expect(service.process(context(rawBody))).resolves.toMatchObject({ status: 'Paid' });
    expect(erp.call).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ booking: 'BKG-1' }) }));
  });

  it('rejects a captured payment when its booking differs from the stored order', async () => {
    const rawBody = JSON.stringify({ id: 'evt-booking-mismatch', event: 'payment.captured', payment: { id: 'pay-booking', order_id: 'order-booking', amount: 150000, currency: 'INR', notes: { member_id: 'MEM-1', booking_id: 'BKG-OTHER', tenant_code: 'tenant-a' } } });
    prisma.webhookInbox.findUnique.mockResolvedValue(null);
    prisma.idempotencyKey.findFirst.mockResolvedValue({ responseBody: { member_id: 'MEM-1', booking_id: 'BKG-1', amount: 1500, currency: 'INR', provider_order: { id: 'order-booking', amount: 150000, currency: 'INR', notes: { tenant_code: 'tenant-a', member_id: 'MEM-1', membership_id: '', booking_id: 'BKG-OTHER' } } } });

    await expect(service.process(context(rawBody))).rejects.toThrow('does not match a pending order');
    expect(erp.call).not.toHaveBeenCalled();
  });
});
