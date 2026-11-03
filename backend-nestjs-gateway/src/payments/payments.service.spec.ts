import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PaymentsService } from './payments.service';

describe('PaymentsService idempotent order lifecycle', () => {
  const originalImportStore = process.env.IMPORT_STORE;
  const context = { tenantId: '123e4567-e89b-42d3-a456-426614174000', tenantCode: 'tenant-a', correlationId: 'corr-pay-1' };
  const request = { idempotency_key: '123e4567-e89b-42d3-a456-426614174001', member_id: 'WS-MEM-1', membership_id: 'WS-MSHIP-1', amount: 1500, payment_method: 'razorpay' as const };
  const requestHash = createHash('sha256').update(JSON.stringify({ member_id: request.member_id, membership_id: request.membership_id, booking_id: null, amount: request.amount, currency: 'INR', payment_method: request.payment_method })).digest('hex');

  afterEach(() => {
    if (originalImportStore === undefined) delete process.env.IMPORT_STORE;
    else process.env.IMPORT_STORE = originalImportStore;
  });

  it('lists tenant-scoped imported payments from PostgreSQL', async () => {
    process.env.IMPORT_STORE = 'postgres';
    const rows = [{ id: 'payment-1', tenantId: context.tenantId, memberId: 'member-1' }];
    const findMany = jest.fn(async () => rows);
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => any) => work({ studioPayment: { findMany } })) };
    const erpCall = jest.fn();
    const service = new PaymentsService({ call: erpCall } as any, {} as any, {} as any, prisma as any, {} as any);

    await expect(service.list(context)).resolves.toEqual(rows);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: context.tenantId } }));
    expect(erpCall).not.toHaveBeenCalled();
  });

  it('claims the request, validates ERP ownership, persists an ERP intent, and audits once', async () => {
    process.env.IMPORT_STORE = 'erp';
    const calls: Array<Record<string, any>> = [];
    const stored: any = { requestHash, responseBody: null, responseStatus: null, updatedAt: new Date() };
    const tx: any = {
      idempotencyKey: {
        findUnique: jest.fn(async () => { calls.push({ op: 'find' }); return stored; }),
        create: jest.fn(async (args: any) => { calls.push({ op: 'create' }); stored.requestHash = args.data.requestHash; return stored; }),
        updateMany: jest.fn(async (args: any) => { calls.push({ op: 'claim', args }); return { count: 1 }; }),
      },
      studioPayment: {
        create: jest.fn(async (args: any) => ({ id: 'pay-1', ...args.data })),
      },
    };
    let finds = 0;
    tx.idempotencyKey.findUnique.mockImplementation(async () => {
      finds += 1;
      calls.push({ op: 'find' });
      if (finds === 1) return null;
      return stored;
    });
    tx.idempotencyKey.updateMany.mockImplementation(async (args: any) => {
      calls.push({ op: 'update', args });
      if (args.data.responseStatus === 102) {
        stored.responseStatus = 102;
        stored.responseBody = args.data.responseBody;
      } else {
        stored.responseStatus = args.data.responseStatus;
        stored.responseBody = args.data.responseBody;
      }
      return { count: 1 };
    });
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => any) => work(tx)) };
    const erpCall = jest.fn(async (input: any) => {
      calls.push({ op: 'erp', method: input.method });
      if (input.method.endsWith('create_order_intent')) return { payment_id: 'WS-PAY-1' };
      return { valid: true };
    });
    const razorpay = {
      findOrder: jest.fn(async () => undefined),
      createOrder: jest.fn(async () => ({ id: 'order-1', amount: 150000, currency: 'INR', mode: 'mock', notes: { tenant_code: 'tenant-a', member_id: 'WS-MEM-1', membership_id: 'WS-MSHIP-1', booking_id: '' } })),
    };
    const recordInTransaction = jest.fn(async () => undefined);
    const service = new PaymentsService({ call: erpCall } as any, razorpay as any, { recordInTransaction } as any, prisma as any, {} as any);

    const result = await service.create(request, context.tenantId, context.tenantCode, context.correlationId, 'staff-1');

    expect(result).toMatchObject({ erp_payment_id: 'WS-PAY-1', razorpay_order_id: 'order-1', status: 'pending' });
    expect(erpCall).toHaveBeenCalledWith(expect.objectContaining({ method: 'wellness_studio.api.payment.validate_order_request' }));
    expect(erpCall).toHaveBeenCalledWith(expect.objectContaining({ method: 'wellness_studio.api.payment.create_order_intent', body: expect.objectContaining({ idempotency_key: expect.any(String) }) }));
    expect(erpCall).toHaveBeenCalledWith(expect.objectContaining({ method: 'wellness_studio.api.payment.attach_order_reference', body: expect.objectContaining({ provider_order_reference: 'order-1' }) }));
    expect(razorpay.findOrder).toHaveBeenCalledTimes(1);
    expect(recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ action: 'payment.order_created', resourceRef: 'WS-PAY-1' }));
  });

  it('does not call ERP or Razorpay when another request owns the active idempotency lease', async () => {
    const tx: any = {
      idempotencyKey: {
        findUnique: jest.fn<() => Promise<any>>().mockResolvedValue({ requestHash, responseBody: { state: 'creating' }, responseStatus: 102, updatedAt: new Date() }),
        create: jest.fn(),
        updateMany: jest.fn<() => Promise<{ count: number }>>().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = { withTenant: jest.fn(async (_tenant: string, work: (client: any) => any) => work(tx)) };
    const erpCall = jest.fn();
    const findOrder = jest.fn();
    const service = new PaymentsService({ call: erpCall } as any, { findOrder } as any, {} as any, prisma as any, {} as any);
    await expect(service.create(request, context.tenantId, context.tenantCode, context.correlationId, 'staff-1')).rejects.toBeInstanceOf(ConflictException);
    expect(erpCall).not.toHaveBeenCalled();
    expect(findOrder).not.toHaveBeenCalled();
  });

  describe('Studio Subscription Payment Infrastructure', () => {
    it('returns available platform tiers with verified prices', () => {
      const razorpay = { getConfig: jest.fn(() => ({ enabled: true, mode: 'test', keyId: 'rzp_test_123', currency: 'INR' })) };
      const service = new PaymentsService({} as any, razorpay as any, {} as any, {} as any, {} as any);
      const config = service.getStudioPlanConfig();

      expect(config.plans).toHaveLength(3);
      expect(config.plans.find((p: any) => p.name === 'Basic')?.priceINR).toBe(1000);
      expect(config.plans.find((p: any) => p.name === 'Premium')?.priceINR).toBe(2000);
      expect(config.plans.find((p: any) => p.name === 'Ultra Premium')?.priceINR).toBe(3000);
      expect(config.razorpay.keyId).toBe('rzp_test_123');
    });

    it('creates studio subscription order with exact server-side pricing', async () => {
      const razorpay = {
        getConfig: jest.fn(() => ({ enabled: true, mode: 'test', keyId: 'rzp_test_123', currency: 'INR' })),
        createOrder: jest.fn(async (args: any) => ({
          id: 'order_studio_test_1',
          amount: args.amount * 100,
          currency: 'INR',
          receipt: 'receipt_studio_1',
        })),
      };
      const service = new PaymentsService({} as any, razorpay as any, {} as any, {} as any, {} as any);

      const order = await service.createStudioOrder({
        plan_tier: 'Premium',
        studio_name: 'Iron & Grace Fitness',
        owner_email: 'owner@irongrace.com',
      });

      expect(order.amount_inr).toBe(2000);
      expect(order.amount).toBe(200000);
      expect(order.plan_tier).toBe('Premium');
      expect(razorpay.createOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 2000,
          currency: 'INR',
          membershipId: 'tier_premium',
        }),
      );
    });

    it('cryptographically verifies valid signature and rejects tampered signature', async () => {
      const razorpay = {
        verifyPaymentSignature: jest.fn((orderId: string, payId: string, sig: string) => sig === 'valid_signature'),
        fetchPayment: jest.fn(async (_payId: string) => ({ status: 'captured', amount: 200000 })),
      };
      const service = new PaymentsService({} as any, razorpay as any, {} as any, {} as any, {} as any);

      // Valid signature
      const result = await service.verifyStudioPayment({
        plan_tier: 'Premium',
        razorpay_order_id: 'order_1',
        razorpay_payment_id: 'pay_1',
        razorpay_signature: 'valid_signature',
      });
      expect(result.verified).toBe(true);
      expect(result.status).toBe('Paid');

      // Invalid signature
      await expect(
        service.verifyStudioPayment({
          plan_tier: 'Premium',
          razorpay_order_id: 'order_1',
          razorpay_payment_id: 'pay_1',
          razorpay_signature: 'tampered_signature',
        }),
      ).rejects.toThrow('Invalid Razorpay payment signature');
    });
  });
});
