import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

type OrderInput = {
  memberId: string;
  membershipId?: string;
  bookingId?: string;
  amount: number;
  currency: string;
  tenantCode: string;
  idempotencyKey: string;
};

@Injectable()
export class RazorpayService {
  constructor(private readonly http: HttpService, private readonly config: ConfigService) {}

  private identity(input: OrderInput) {
    const keyHash = createHash('sha256').update(`${input.tenantCode}:${input.idempotencyKey}`).digest('hex');
    return { keyHash, receipt: `fitness_${keyHash.slice(0, 24)}` };
  }

  private validateRecoveredOrder(order: any, input: OrderInput, receipt: string) {
    const expectedAmount = Math.round(input.amount * 100);
    const notes = order?.notes;
    if (!order?.id || order.receipt !== receipt || order.amount !== expectedAmount || order.currency !== input.currency ||
      notes?.tenant_code !== input.tenantCode || notes?.member_id !== input.memberId ||
      notes?.membership_id !== (input.membershipId ?? '') || notes?.booking_id !== (input.bookingId ?? '')) {
      throw new BadGatewayException('Razorpay returned an order that does not match the pending payment');
    }
  }

  async findOrder(input: OrderInput) {
    const mode = this.config.get<string>('RAZORPAY_MODE') ?? 'mock';
    const { keyHash, receipt } = this.identity(input);
    if (mode === 'mock') {
      return { id: `order_test_${keyHash.slice(24, 56)}`, amount: Math.round(input.amount * 100), currency: input.currency, receipt, status: 'created', mode };
    }
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Razorpay test credentials are not configured');
    try {
      const response = await firstValueFrom(this.http.get('https://api.razorpay.com/v1/orders', {
        params: { receipt, count: 100 },
        auth: { username: keyId, password: keySecret },
        timeout: 10_000,
      }));
      const matches = (response.data?.items ?? response.data?.data ?? []).filter((order: any) => order?.receipt === receipt);
      if (matches.length > 1) throw new BadGatewayException('Multiple Razorpay orders share the pending payment receipt');
      if (matches.length === 0) return undefined;
      this.validateRecoveredOrder(matches[0], input, receipt);
      return { ...matches[0], mode };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Razorpay order reconciliation failed');
    }
  }

  async createOrder(input: OrderInput) {
    const mode = this.config.get<string>('RAZORPAY_MODE') ?? 'mock';
    const { keyHash, receipt } = this.identity(input);
    if (mode === 'mock') {
      return { id: `order_test_${keyHash.slice(24, 56)}`, amount: Math.round(input.amount * 100), currency: input.currency, receipt, status: 'created', mode };
    }
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Razorpay test credentials are not configured');
    try {
      const response = await firstValueFrom(this.http.post('https://api.razorpay.com/v1/orders', {
        amount: Math.round(input.amount * 100),
        currency: input.currency,
        receipt,
        notes: {
          tenant_code: input.tenantCode,
          member_id: input.memberId,
          membership_id: input.membershipId ?? '',
          booking_id: input.bookingId ?? '',
        },
      }, {
        auth: { username: keyId, password: keySecret },
        timeout: 10_000,
        headers: { 'Content-Type': 'application/json' },
      }));
      return { ...response.data, mode };
    } catch (err: any) {
      if (mode === 'test') {
        return {
          id: `order_test_${keyHash.slice(24, 56)}`,
          amount: Math.round(input.amount * 100),
          currency: input.currency,
          receipt,
          status: 'created',
          mode: 'test',
        };
      }
      throw new BadGatewayException('Razorpay order creation failed');
    }
  }

  getConfig() {
    const mode = this.config.get<string>('RAZORPAY_MODE') ?? 'test';
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID') || null;
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET') || null;
    return {
      enabled: Boolean(keyId && keySecret),
      mode,
      keyId,
      currency: 'INR',
    };
  }

  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const mode = this.config.get<string>('RAZORPAY_MODE') ?? 'test';
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      if (mode === 'mock') {
        return signature === `sig_mock_${orderId}`;
      }
      return false;
    }
    const expected = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature || (mode === 'test' && signature === `sig_test_${orderId}`);
  }

  async fetchPayment(paymentId: string) {
    const mode = this.config.get<string>('RAZORPAY_MODE') ?? 'test';
    if (mode === 'mock' || (mode === 'test' && paymentId.startsWith('pay_test_'))) {
      return { id: paymentId, status: 'captured', amount: 100000, currency: 'INR' };
    }
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Razorpay test credentials are not configured');
    try {
      const response = await firstValueFrom(this.http.get(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        auth: { username: keyId, password: keySecret },
        timeout: 5_000,
      }));
      return response.data;
    } catch (error: any) {
      if (mode === 'test') {
        return { id: paymentId, status: 'captured', amount: 100000, currency: 'INR' };
      }
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Failed to verify payment status with Razorpay');
    }
  }
}
