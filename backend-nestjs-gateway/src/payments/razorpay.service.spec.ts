import { jest } from '@jest/globals';
import { of } from 'rxjs';
import { createHmac } from 'node:crypto';
import { RazorpayService } from './razorpay.service';

describe('RazorpayService order identity', () => {
  it('scopes deterministic receipt identifiers by tenant without exposing the idempotency key', async () => {
    const config = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'key-id', RAZORPAY_KEY_SECRET: 'key-secret' })[key] };
    const post = jest.fn(() => of({ data: { id: 'order-test' } } as any));
    const service = new RazorpayService({ post } as any, config as any);
    const input = {
      memberId: 'MEM-1', bookingId: 'BKG-1', amount: 1500, currency: 'INR',
      idempotencyKey: 'same-client-key',
    };
    await service.createOrder({ ...input, tenantCode: 'tenant-a' });
    await service.createOrder({ ...input, tenantCode: 'tenant-b' });
    const firstOrderBody = (post.mock.calls[0] as any)[1];
    const secondOrderBody = (post.mock.calls[1] as any)[1];

    expect(firstOrderBody.receipt).not.toBe(secondOrderBody.receipt);
    expect(firstOrderBody.receipt).not.toContain(input.idempotencyKey);
    expect(firstOrderBody.amount).toBe(150000);
    expect(firstOrderBody.notes.booking_id).toBe('BKG-1');
  });

  it('correctly reports payment configuration based on environment variables', () => {
    const activeConfig = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'rzp_test_123', RAZORPAY_KEY_SECRET: 'test_sec_456' })[key] };
    const activeService = new RazorpayService({} as any, activeConfig as any);
    expect(activeService.getConfig()).toEqual({
      enabled: true,
      mode: 'test',
      keyId: 'rzp_test_123',
      currency: 'INR',
    });

    const unconfigured = { get: () => undefined };
    const pendingService = new RazorpayService({} as any, unconfigured as any);
    expect(pendingService.getConfig()).toEqual({
      enabled: false,
      mode: 'test',
      keyId: null,
      currency: 'INR',
    });
  });

  it('validates HMAC-SHA256 signatures accurately and rejects tampering', () => {
    const config = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_SECRET: 'test_secret_123' })[key] };
    const service = new RazorpayService({} as any, config as any);

    const orderId = 'order_9A33XWu170gUtm';
    const paymentId = 'pay_29Ae35XDuqA3vi';
    const validSignature = createHmac('sha256', 'test_secret_123')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(service.verifyPaymentSignature(orderId, paymentId, validSignature)).toBe(true);
    expect(service.verifyPaymentSignature(orderId, paymentId, 'tampered_signature')).toBe(false);
    expect(service.verifyPaymentSignature('different_order', paymentId, validSignature)).toBe(false);
  });

  it('recovers only an exactly matching Razorpay order by deterministic receipt', async () => {
    const config = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'key-id', RAZORPAY_KEY_SECRET: 'key-secret' })[key] };
    const input = { memberId: 'MEM-1', bookingId: 'BKG-1', amount: 1500, currency: 'INR', tenantCode: 'tenant-a', idempotencyKey: 'key-1' };
    const post = jest.fn(() => of({ data: { id: 'unused' } } as any));
    const get = jest.fn((...args: any[]) => of({ data: { items: [{
      id: 'order-recovered', receipt: args[1].params.receipt, amount: 150000, currency: 'INR',
      notes: { tenant_code: 'tenant-a', member_id: 'MEM-1', membership_id: '', booking_id: 'BKG-1' },
    }] } } as any));
    const service = new RazorpayService({ post, get } as any, config as any);
    const recovered = await service.findOrder(input);
    expect(recovered).toMatchObject({ id: 'order-recovered', mode: 'test' });
    expect(get).toHaveBeenCalledWith('https://api.razorpay.com/v1/orders', expect.objectContaining({
      params: { receipt: expect.stringMatching(/^fitness_[a-f0-9]{24}$/), count: 100 },
    }));
    expect(post).not.toHaveBeenCalled();
  });

  it('fails closed when the receipt lookup returns a mismatched payment order', async () => {
    const config = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'key-id', RAZORPAY_KEY_SECRET: 'key-secret' })[key] };
    const input = { memberId: 'MEM-1', bookingId: 'BKG-1', amount: 1500, currency: 'INR', tenantCode: 'tenant-a', idempotencyKey: 'key-1' };
    const get = jest.fn((...args: any[]) => of({ data: { items: [{
      id: 'order-wrong', receipt: args[1].params.receipt, amount: 1, currency: 'INR',
      notes: { tenant_code: 'tenant-a', member_id: 'MEM-1', membership_id: '', booking_id: 'BKG-1' },
    }] } } as any));
    const service = new RazorpayService({ get } as any, config as any);
    await expect(service.findOrder(input)).rejects.toThrow('Razorpay returned an order that does not match');
  });

  it('returns no order for a verified empty receipt lookup', async () => {
    const config = { get: (key: string) => ({ RAZORPAY_MODE: 'test', RAZORPAY_KEY_ID: 'key-id', RAZORPAY_KEY_SECRET: 'key-secret' })[key] };
    const get = jest.fn(() => of({ data: { items: [] } } as any));
    const service = new RazorpayService({ get } as any, config as any);
    await expect(service.findOrder({ memberId: 'MEM-1', amount: 1500, currency: 'INR', tenantCode: 'tenant-a', idempotencyKey: 'key-1' })).resolves.toBeUndefined();
  });
});
