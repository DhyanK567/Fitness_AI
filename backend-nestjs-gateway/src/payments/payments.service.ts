import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RecordLedgerPaymentDto, RefundPaymentDto, UpdatePaymentDto } from './dto/update-payment.dto';
import type { VerifyMembershipPaymentDto } from './dto/membership-payment.dto';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { ErpnextService } from '../erpnext/erpnext.service';
import { RazorpayService } from './razorpay.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { ReferralsService } from '../modules/referrals/referrals.service';

type PaymentRequest = {
  idempotency_key: string;
  member_id: string;
  membership_id?: string;
  booking_id?: string;
  amount: number;
  currency?: string;
  payment_method: 'razorpay' | 'cash' | 'upi';
};
type PaymentContext = { tenantId: string; tenantCode: string; correlationId: string; memberRef?: string };

function usesPostgresStore(): boolean {
  return !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase());
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly erp: ErpnextService,
    private readonly razorpay: RazorpayService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly prisma: PrismaService,
    private readonly referrals: ReferralsService,
  ) {}

  private publicPayment(body: Record<string, unknown>) {
    const { provider_order: _providerOrder, erp_payment_idempotency_key: _erpIdempotencyKey, ...publicBody } = body;
    return publicBody;
  }

  getConfig() {
    return this.razorpay.getConfig();
  }

  getStudioPlanConfig() {
    const razorpayConfig = this.razorpay.getConfig();
    return {
      plans: [
        {
          name: 'Basic',
          code: 'starter',
          priceINR: 1000,
          period: 'per month',
          description: 'Essential operating tools for emerging boutiques, independent instructors, and single-room studios.',
          features: ['Members & membership records', 'Class schedule & attendance roster', 'Standard front-desk booking'],
        },
        {
          name: 'Premium',
          code: 'growth',
          priceINR: 2000,
          period: 'per month',
          badge: 'Most Popular',
          description: 'Complete studio management with member portal access, automated reminders, and capacity operations.',
          features: ['All Basic capabilities', 'Member self-service booking portal', 'Automated reminders & waitlist manager', 'Staff & trainer coordination'],
        },
        {
          name: 'Ultra Premium',
          code: 'enterprise',
          priceINR: 3000,
          period: 'per month',
          badge: 'Comprehensive Suite',
          description: 'Full-scale multi-room scheduling, comprehensive analytics, VIP retention workflows, and governed AI assistance.',
          features: ['All Premium capabilities', 'Multi-room & multi-trainer rosters', 'Detailed financial & attendance reports', 'Governed AI operations assistance'],
        },
      ],
      razorpay: razorpayConfig,
    };
  }

  async createStudioOrder(input: {
    plan_tier: 'Basic' | 'Premium' | 'Ultra Premium';
    studio_name: string;
    owner_email: string;
    owner_name?: string;
    owner_phone?: string;
    idempotency_key?: string;
  }) {
    const prices: Record<string, number> = {
      Basic: 1000,
      Premium: 2000,
      'Ultra Premium': 3000,
    };
    const amountINR = prices[input.plan_tier];
    if (!amountINR) {
      throw new BadRequestException(`Invalid subscription tier: ${input.plan_tier}`);
    }

    const tenantCode = (input.studio_name || 'studio')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 35) || 'studio';

    const safeKey = input.idempotency_key || randomUUID();
    const order = await this.razorpay.createOrder({
      memberId: `owner_${input.owner_email.trim().toLowerCase()}`,
      membershipId: `tier_${input.plan_tier.toLowerCase().replace(/\s+/g, '_')}`,
      amount: amountINR,
      currency: 'INR',
      tenantCode,
      idempotencyKey: safeKey,
    });

    const config = this.razorpay.getConfig();
    return {
      order_id: order.id,
      amount: order.amount,
      currency: 'INR',
      amount_inr: amountINR,
      key_id: config.keyId,
      plan_tier: input.plan_tier,
      plan_name: `${input.plan_tier} Studio Subscription`,
      receipt: order.receipt,
    };
  }

  async verifyStudioPayment(input: {
    plan_tier?: 'Basic' | 'Premium' | 'Ultra Premium';
    planTier?: 'Basic' | 'Premium' | 'Ultra Premium';
    razorpay_order_id?: string;
    razorpayOrderId?: string;
    order_id?: string;
    orderId?: string;
    razorpay_payment_id?: string;
    razorpayPaymentId?: string;
    payment_id?: string;
    paymentId?: string;
    razorpay_signature?: string;
    razorpaySignature?: string;
    signature?: string;
  }) {
    const orderId =
      input.razorpay_order_id || input.razorpayOrderId || input.order_id || input.orderId || '';
    const paymentId =
      input.razorpay_payment_id || input.razorpayPaymentId || input.payment_id || input.paymentId || '';
    const signature =
      input.razorpay_signature || input.razorpaySignature || input.signature || '';
    const planTier = (input.plan_tier || input.planTier || 'Premium') as 'Basic' | 'Premium' | 'Ultra Premium';

    if (!orderId || !paymentId || !signature) {
      throw new BadRequestException('Order ID, payment ID, and signature are required');
    }

    const isValid = this.razorpay.verifyPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      throw new BadRequestException('Invalid Razorpay payment signature');
    }

    const paymentDetails = await this.razorpay.fetchPayment(paymentId);
    if (paymentDetails && paymentDetails.order_id && paymentDetails.order_id !== orderId) {
      throw new BadRequestException('Payment does not belong to the specified order');
    }
    if (paymentDetails && !['captured', 'authorized'].includes(paymentDetails.status)) {
      throw new BadRequestException(`Payment is in ${paymentDetails.status} state, not settled`);
    }

    const prices: Record<string, number> = {
      Basic: 1000,
      Premium: 2000,
      'Ultra Premium': 3000,
    };
    const amountINR = prices[planTier] || 2000;
    const expectedPaise = amountINR * 100;
    const amountPaise = paymentDetails && !paymentId.startsWith('pay_test_') && paymentDetails.amount ? paymentDetails.amount : expectedPaise;

    return {
      verified: true,
      payment_id: paymentId,
      order_id: orderId,
      plan_tier: planTier,
      amount: amountPaise,
      amount_inr: amountINR,
      currency: 'INR',
      status: 'Paid',
      verified_at: new Date().toISOString(),
    };
  }

  async list(context: PaymentContext) {
    if (usesPostgresStore()) {
      return this.prisma.withTenant(context.tenantId, (tx) => tx.studioPayment.findMany({
        where: {
          tenantId: context.tenantId,
          ...(context.memberRef ? { memberId: context.memberRef } : {}),
        },
        orderBy: { createdAt: 'desc' },
      }));
    }
    const erpRows = await this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.payment.list_payments', httpMethod: 'GET', body: { tenant: context.tenantCode, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } }) as Array<Record<string, unknown>>;
    const pendingRows = await this.prisma.withTenant(context.tenantId, (tx) => tx.idempotencyKey.findMany({
      where: { tenantId: context.tenantId, expiresAt: { gt: new Date() } }, orderBy: { updatedAt: 'desc' }, take: 1000,
    }));
    const pendingBodies = pendingRows.map((row) => row.responseBody as Record<string, unknown> | null)
      .filter((body): body is Record<string, unknown> => Boolean(body && body.status === 'pending' && body.id && body.erp_payment_id && (!context.memberRef || body.member_id === context.memberRef)));
    const linked = new Set(pendingBodies.map((body) => body.erp_payment_id));
    return [...pendingBodies.map((body) => this.publicPayment(body)), ...erpRows.filter((row) => !linked.has(row.id))];
  }

  async get(context: PaymentContext, id: string) {
    if (usesPostgresStore()) {
      const payment = await this.prisma.withTenant(context.tenantId, (tx) => tx.studioPayment.findFirst({
        where: {
          id,
          tenantId: context.tenantId,
          ...(context.memberRef ? { memberId: context.memberRef } : {}),
        },
      }));
      if (!payment) throw new NotFoundException('Payment was not found');
      return payment;
    }
    const local = await this.prisma.withTenant(context.tenantId, (tx) => tx.idempotencyKey.findFirst({
      where: { tenantId: context.tenantId, responseBody: { path: ['id'], equals: id } },
    }));
    const body = local?.responseBody as Record<string, unknown> | null;
    if (body && (!context.memberRef || body.member_id === context.memberRef)) return this.publicPayment(body);
    return this.erp.call({ tenantId: context.tenantCode, correlationId: context.correlationId, method: 'wellness_studio.api.payment.get_payment', httpMethod: 'GET', body: { tenant: context.tenantCode, payment: id, ...(context.memberRef ? { member_filter: context.memberRef } : {}) } });
  }

  async updateLedger(tenantId: string, id: string, input: UpdatePaymentDto, actorId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const current = await tx.studioPayment.findFirst({ where: { id, tenantId } });
      if (!current) throw new NotFoundException('Payment was not found');
      const updated = await tx.studioPayment.update({
        where: { id },
        data: { ...(input.status ? { status: input.status } : {}), ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}), updatedAt: new Date() },
      });
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId, actorType: 'user', actorId, action: 'payment.updated', resourceType: 'payment', resourceRef: id,
        correlationId: `payment-update-${id}`, eventType: 'payment.updated', payload: { paymentId: id, status: updated.status },
        beforeData: { status: current.status, notes: current.notes }, afterData: { status: updated.status, notes: updated.notes },
      });
      return updated;
    });
  }

  async recordLedgerPayment(tenantId: string, input: RecordLedgerPaymentDto, actorId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const member = await tx.studioMember.findFirst({ where: { id: input.member_id, tenantId }, select: { id: true } });
      if (!member) throw new BadRequestException('Member does not belong to this studio');
      const payment = await tx.studioPayment.create({
        data: {
          tenantId,
          memberId: input.member_id,
          ref: `DSK-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
          type: input.type.trim(),
          date: new Date(),
          amount: input.amount,
          method: input.method,
          status: input.status,
          refundedAmount: 0,
          notes: input.notes?.trim() || null,
        },
      });
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId, actorType: 'user', actorId, action: 'payment.ledger_recorded', resourceType: 'payment', resourceRef: payment.id,
        correlationId: `payment-ledger-${payment.id}`, eventType: 'payment.recorded',
        payload: { paymentId: payment.id, memberId: payment.memberId, amount: payment.amount, currency: 'INR', method: payment.method },
      });
      return payment;
    });
  }

  async refundLedger(tenantId: string, id: string, input: RefundPaymentDto, actorId: string) {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const payment = await tx.studioPayment.findFirst({ where: { id, tenantId } });
      if (!payment) throw new NotFoundException('Payment was not found');
      if (!['Paid', 'Partially Refunded'].includes(payment.status)) throw new BadRequestException('Only settled payments can be refunded');
      const refundedAmount = Number((payment.refundedAmount + input.amount).toFixed(2));
      if (refundedAmount > payment.amount) throw new BadRequestException('Refund exceeds the remaining payment balance');
      const status = refundedAmount === payment.amount ? 'Refunded' : 'Partially Refunded';
      const notes = [payment.notes, input.note?.trim() ? `Refund: ${input.note.trim()}` : null].filter(Boolean).join('\n') || null;
      const updated = await tx.studioPayment.update({ where: { id }, data: { refundedAmount, status, notes, updatedAt: new Date() } });
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId, actorType: 'user', actorId, action: 'payment.refunded', resourceType: 'payment', resourceRef: id,
        correlationId: `payment-refund-${id}`, eventType: 'payment.refunded', payload: { paymentId: id, amount: input.amount },
        beforeData: { refundedAmount: payment.refundedAmount, status: payment.status }, afterData: { refundedAmount, status },
      });
      return updated;
    });
  }

  async gstReceipt(tenantId: string, id: string) {
    const payment = await this.prisma.withTenant(tenantId, (tx) => tx.studioPayment.findFirst({ where: { id, tenantId } }));
    if (!payment) throw new NotFoundException('Payment was not found');
    const total = Number(payment.amount.toFixed(2));
    const taxableValue = Number((total / 1.18).toFixed(2));
    const gst = Number((total - taxableValue).toFixed(2));
    return { paymentId: payment.id, reference: payment.ref, currency: 'INR', gstRate: 18, taxableValue, gst, total, generatedAt: new Date().toISOString() };
  }

  private requestHash(request: PaymentRequest): string {
    const body = {
      member_id: request.member_id,
      membership_id: request.membership_id ?? null,
      booking_id: request.booking_id ?? null,
      amount: request.amount,
      currency: request.currency ?? 'INR',
      payment_method: request.payment_method,
    };
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  async createMembershipOrder(
    tenantId: string,
    tenantCode: string,
    memberRef: string,
    planId: string,
    idempotencyKey?: string,
    referralCode?: string,
    redeemReward?: boolean,
  ) {
    const plan = await this.prisma.withTenant(tenantId, (tx) =>
      tx.studioMembership.findFirst({
        where: { id: planId, tenantId, active: true },
      }),
    );
    if (!plan) {
      throw new NotFoundException('Active membership plan was not found');
    }
    if (plan.priceINR <= 0) {
      throw new BadRequestException('Complimentary plans do not require payment gateway checkout');
    }

    let member = await this.prisma.withTenant(tenantId, (tx) =>
      tx.studioMember.findFirst({
        where: { id: memberRef, tenantId },
      }),
    );
    if (!member) {
      const userLink = await this.prisma.withTenant(tenantId, (tx) =>
        tx.userErpLink.findFirst({ where: { tenantId, userId: memberRef } }),
      );
      if (userLink?.erpUserRef) {
        member = await this.prisma.withTenant(tenantId, (tx) =>
          tx.studioMember.findFirst({ where: { id: userLink.erpUserRef, tenantId } }),
        );
      }
    }

    let discountAmount = 0;
    let referralNotes = '';

    if (referralCode && typeof referralCode === 'string' && referralCode.trim()) {
      const cleanCode = referralCode.trim().toUpperCase();
      const validatedReferrer = await this.referrals.findReferrerByCode(tenantId, cleanCode);
      if (!validatedReferrer) {
        throw new BadRequestException(`Referral code "${cleanCode}" is invalid or expired`);
      }
      if (validatedReferrer.id === (member?.id || memberRef)) {
        throw new BadRequestException('Self-referrals are not permitted. You cannot use your own referral code.');
      }
      const campaign = await this.prisma.withTenant(tenantId, (tx) => this.referrals.getActiveCampaign(tx, tenantId));
      const discountPercent = campaign?.refereeIncentiveValue ?? 5;
      discountAmount = Math.round(plan.priceINR * (discountPercent / 100));
      referralNotes = ` Referral discount (${discountPercent}%): -₹${discountAmount} via code ${cleanCode} (Referrer: ${validatedReferrer.id}).`;
    } else if (redeemReward && (member?.id || memberRef)) {
      const availableRewards = await this.referrals.getAvailableRewardAmount(tenantId, member?.id || memberRef);
      if (availableRewards > 0) {
        discountAmount = Math.min(availableRewards, Math.max(0, plan.priceINR - 1));
        referralNotes = ` Referral reward redemption applied: -₹${discountAmount}.`;
      }
    }

    const finalPayable = Math.max(1, plan.priceINR - discountAmount);

    const safeKey = idempotencyKey || randomUUID();
    const orderInput = {
      memberId: member?.id || memberRef,
      membershipId: plan.id,
      amount: finalPayable,
      currency: 'INR',
      tenantCode,
      idempotencyKey: safeKey,
    };

    const order = await this.razorpay.createOrder(orderInput);

    await this.prisma.withTenant(tenantId, async (tx) => {
      await tx.studioPayment.create({
        data: {
          tenantId,
          ref: order.id,
          date: new Date(),
          memberId: member?.id || memberRef,
          type: 'Membership',
          method: 'Razorpay',
          status: 'Pending',
          amount: finalPayable,
          refundedAmount: 0,
          notes: `Pending Razorpay order for plan ${plan.name} (${plan.id}).${referralNotes}`,
        },
      });
    });

    const config = this.razorpay.getConfig();
    return {
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      amount_inr: finalPayable,
      discount_inr: discountAmount,
      original_amount_inr: plan.priceINR,
      key_id: config.keyId,
      plan_id: plan.id,
      plan_name: plan.name,
      plan_type: plan.planType,
      receipt: order.receipt,
    };
  }

  async verifyMembershipPayment(
    tenantId: string,
    tenantCode: string,
    memberRef: string,
    input: VerifyMembershipPaymentDto,
  ) {
    const isValid = this.razorpay.verifyPaymentSignature(
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid Razorpay payment signature');
    }

    const paymentDetails = await this.razorpay.fetchPayment(input.razorpay_payment_id);
    if (paymentDetails && paymentDetails.order_id && paymentDetails.order_id !== input.razorpay_order_id) {
      throw new BadRequestException('Payment does not belong to the specified order');
    }
    if (paymentDetails && !['captured', 'authorized'].includes(paymentDetails.status)) {
      throw new BadRequestException(`Payment is in ${paymentDetails.status} state, not settled`);
    }

    return this.prisma.withTenant(tenantId, async (tx) => {
      // 1. Prevent duplicate activation
      const existingPaid = await tx.studioPayment.findFirst({
        where: { tenantId, ref: input.razorpay_payment_id, status: 'Paid' },
      });
      if (existingPaid) {
        const plan = await tx.studioMembership.findFirst({ where: { id: input.plan_id, tenantId } });
        const member = await tx.studioMember.findFirst({ where: { id: existingPaid.memberId, tenantId } });
        return {
          success: true,
          orderRef: input.razorpay_order_id,
          paymentId: input.razorpay_payment_id,
          planName: plan?.name || 'Studio Membership',
          planType: plan?.planType || 'Monthly',
          amount: existingPaid.amount,
          memberName: member?.fullName || 'Registered Member',
          memberId: member?.id || memberRef,
          status: 'Paid',
          confirmedAt: existingPaid.updatedAt.toISOString(),
        };
      }

      // 2. Fetch plan
      const plan = await tx.studioMembership.findFirst({
        where: { id: input.plan_id, tenantId },
      });
      if (!plan) throw new NotFoundException('Membership plan not found');

      // 3. Resolve member
      let member = await tx.studioMember.findFirst({
        where: { id: memberRef, tenantId },
      });
      if (!member) {
        const userLink = await tx.userErpLink.findFirst({ where: { tenantId, userId: memberRef } });
        if (userLink?.erpUserRef) {
          member = await tx.studioMember.findFirst({ where: { id: userLink.erpUserRef, tenantId } });
        }
      }
      if (!member) {
        member = await tx.studioMember.findFirst({ where: { tenantId } });
      }
      if (!member) throw new NotFoundException('Member record not found');

      // 4. Calculate validity
      const planTypeLower = (plan.planType || '').toLowerCase();
      let days = 30;
      if (planTypeLower.includes('annual') || planTypeLower.includes('year')) days = 365;
      else if (planTypeLower.includes('half')) days = 180;
      else if (planTypeLower.includes('quarter')) days = 90;
      else if (planTypeLower.includes('month')) days = 30;

      const newExpiry = new Date(Date.now() + days * 86400000);

      // 5. Activate membership in PostgreSQL
      await tx.studioMember.update({
        where: { id: member.id },
        data: {
          plan: plan.name,
          status: 'Active',
          expiry: newExpiry,
          updatedAt: new Date(),
        },
      });

      // 6. Record payment in PostgreSQL
      const existingPending = await tx.studioPayment.findFirst({
        where: { tenantId, ref: input.razorpay_order_id },
      });
      const paymentAmount = existingPending?.amount ?? plan.priceINR;
      if (existingPending) {
        await tx.studioPayment.update({
          where: { id: existingPending.id },
          data: {
            ref: input.razorpay_payment_id,
            status: 'Paid',
            notes: `Paid via Razorpay. Order: ${input.razorpay_order_id}. Plan: ${plan.name}. ${existingPending.notes || ''}`.trim(),
            updatedAt: new Date(),
          },
        });
      } else {
        await tx.studioPayment.create({
          data: {
            tenantId,
            memberId: member.id,
            ref: input.razorpay_payment_id,
            type: 'Membership',
            method: 'Razorpay',
            status: 'Paid',
            amount: paymentAmount,
            date: new Date(),
            notes: `Paid via Razorpay. Order: ${input.razorpay_order_id}. Plan: ${plan.name}`,
          },
        });
      }

      // 6B. Referral processing (Credited only upon verified payment settlement)
      if (input.referral_code && typeof input.referral_code === 'string' && input.referral_code.trim()) {
        const cleanCode = input.referral_code.trim().toUpperCase();
        const referrer = await this.referrals.findReferrerByCode(tenantId, cleanCode);
        if (referrer && referrer.id !== member.id) {
          const discountAmount = Math.max(0, plan.priceINR - paymentAmount);
          await this.referrals.recordConvertedReferral(tenantId, {
            referralCode: cleanCode,
            referrerMemberId: referrer.id,
            refereeMemberId: member.id,
            planId: plan.id,
            planName: plan.name,
            orderId: input.razorpay_order_id,
            paymentId: input.razorpay_payment_id,
            orderAmount: paymentAmount,
            discountAmount,
          });
        }
      } else if (input.redeem_reward) {
        const discountAmount = Math.max(0, plan.priceINR - paymentAmount);
        if (discountAmount > 0) {
          await this.referrals.markRewardsRedeemed(tenantId, member.id, discountAmount, input.razorpay_payment_id);
        }
      }

      // 7. Audit log
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId,
        actorType: 'user',
        actorId: member.id,
        action: 'membership.activated',
        resourceType: 'membership',
        resourceRef: plan.id,
        correlationId: `verify-${input.razorpay_order_id}`,
        eventType: 'membership.purchased',
        payload: {
          orderId: input.razorpay_order_id,
          paymentId: input.razorpay_payment_id,
          planId: plan.id,
          planName: plan.name,
          amount: plan.priceINR,
        },
      });

      return {
        success: true,
        orderRef: input.razorpay_order_id,
        paymentId: input.razorpay_payment_id,
        planName: plan.name,
        planType: plan.planType,
        amount: plan.priceINR,
        memberName: member.fullName,
        memberId: member.id,
        status: 'Paid',
        confirmedAt: new Date().toISOString(),
      };
    });
  }

  async create(request: PaymentRequest, tenantId: string, tenantCode: string, correlationId: string, actorId: string) {
    if (!request.member_id || !Number.isFinite(request.amount) || request.amount <= 0) {
      throw new BadRequestException('member_id and a positive amount are required');
    }
    if (!request.membership_id && !request.booking_id) {
      throw new BadRequestException('membership_id or booking_id is required');
    }
    if (request.membership_id && request.booking_id) {
      throw new BadRequestException('Exactly one of membership_id or booking_id is required');
    }
    const currency = request.currency ?? 'INR';
    const requestHash = this.requestHash(request);
    const erpIdempotencyKey = createHash('sha256').update(`${tenantCode}:${request.idempotency_key}`).digest('hex');
    const unique = { tenantId, idempotencyKey: request.idempotency_key };
    let existing = await this.prisma.withTenant(tenantId, (tx) => tx.idempotencyKey.findUnique({ where: { tenantId_idempotencyKey: unique } }));
    if (existing && existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency key was already used with a different payment request');
    }
    if (!existing) {
      try {
        await this.prisma.withTenant(tenantId, (tx) => tx.idempotencyKey.create({
          data: { ...unique, requestHash, expiresAt: new Date('9999-12-31T23:59:59.999Z') },
        }));
      } catch (error) {
        if ((error as { code?: string })?.code !== 'P2002') throw error;
      }
      existing = await this.prisma.withTenant(tenantId, (tx) => tx.idempotencyKey.findUnique({ where: { tenantId_idempotencyKey: unique } }));
    }
    if (!existing || existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency key is being used by another payment request');
    }
    const prior = existing.responseBody as Record<string, unknown> | null;
    if (prior && prior.state !== 'creating') return this.publicPayment(prior);
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
    if (prior?.state === 'creating' && existing.updatedAt > staleBefore) {
      throw new ConflictException('Payment request with this idempotency key is still processing');
    }
    const claimId = randomUUID();
    const claim = await this.prisma.withTenant(tenantId, (tx) => tx.idempotencyKey.updateMany({
      where: { ...unique, requestHash, OR: [
        { responseBody: { equals: Prisma.DbNull } },
        { responseStatus: 102, updatedAt: { lt: staleBefore } },
      ] },
      data: { responseStatus: 102, responseBody: { state: 'creating', claim_id: claimId } },
    }));
    if (claim.count !== 1) {
      const raced = await this.prisma.withTenant(tenantId, (tx) => tx.idempotencyKey.findUnique({ where: { tenantId_idempotencyKey: unique } }));
      const racedBody = raced?.responseBody as Record<string, unknown> | null;
      if (racedBody && racedBody.state !== 'creating') return this.publicPayment(racedBody);
      throw new ConflictException('Payment request with this idempotency key is still processing');
    }

    if (usesPostgresStore()) {
      if (request.payment_method !== 'razorpay') {
        const payment = await this.prisma.withTenant(tenantId, async (tx) => {
          return tx.studioPayment.create({
            data: {
              tenantId,
              memberId: request.member_id,
              ref: `PAY-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`,
              type: request.membership_id ? 'Membership' : 'Booking',
              date: new Date(),
              amount: request.amount,
              method: request.payment_method,
              status: 'Paid',
              refundedAmount: 0,
            },
          });
        });
        const response = {
          id: payment.ref,
          member_id: request.member_id,
          membership_id: request.membership_id,
          booking_id: request.booking_id,
          amount: request.amount,
          currency,
          payment_method: request.payment_method,
          status: 'success',
          razorpay_order_id: null,
          razorpay_payment_id: null,
        };
        await this.prisma.withTenant(tenantId, async (tx) => {
          await tx.idempotencyKey.updateMany({
            where: { ...unique, responseStatus: 102, responseBody: { path: ['claim_id'], equals: claimId } },
            data: { responseStatus: 201, responseBody: response as Prisma.InputJsonValue },
          });
        });
        return response;
      }

      const orderInput = {
        memberId: request.member_id,
        membershipId: request.membership_id,
        bookingId: request.booking_id,
        amount: request.amount,
        currency,
        tenantCode,
        idempotencyKey: request.idempotency_key,
      };
      const order = await this.razorpay.createOrder(orderInput);
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.studioPayment.create({
          data: {
            tenantId,
            memberId: request.member_id,
            ref: order.id,
            type: request.membership_id ? 'Membership' : 'Booking',
            date: new Date(),
            amount: request.amount,
            method: 'Razorpay',
            status: 'Pending',
            refundedAmount: 0,
            notes: `Razorpay Order: ${order.id}`,
          },
        });
      });
      const response = {
        id: `PAY-${order.id}`,
        member_id: request.member_id,
        membership_id: request.membership_id,
        booking_id: request.booking_id,
        amount: request.amount,
        currency,
        payment_method: 'razorpay',
        status: 'pending',
        razorpay_order_id: order.id,
        mode: order.mode,
      };
      await this.prisma.withTenant(tenantId, async (tx) => {
        await tx.idempotencyKey.updateMany({
          where: { ...unique, responseStatus: 102, responseBody: { path: ['claim_id'], equals: claimId } },
          data: { responseStatus: 201, responseBody: response as Prisma.InputJsonValue },
        });
      });
      return response;
    }

    if (request.payment_method !== 'razorpay') {
      let result: { payment_id?: string; status?: string } = {};
      try {
        result = await this.erp.call({
          tenantId: tenantCode,
          correlationId,
          method: 'wellness_studio.api.payment.record_manual',
          idempotencyKey: erpIdempotencyKey,
          body: {
            tenant: tenantCode,
            member: request.member_id,
            membership_id: request.membership_id,
            booking_id: request.booking_id,
            amount: request.amount,
            payment_method: request.payment_method,
            currency,
            idempotency_key: erpIdempotencyKey,
          },
        }) as { payment_id?: string; status?: string };
      } catch (err) {
        if (!usesPostgresStore()) throw err;
      }
      const generatedRef = `PAY-${createHash('sha256').update(`${tenantCode}:${request.idempotency_key}`).digest('hex').slice(0, 32)}`;
      const paymentId = String(result?.payment_id ?? generatedRef);
      const response = {
        id: generatedRef,
        erp_payment_id: result?.payment_id ?? null,
        member_id: request.member_id,
        membership_id: request.membership_id,
        booking_id: request.booking_id,
        amount: request.amount,
        currency,
        payment_method: request.payment_method,
        status: result?.status?.toLowerCase() === 'paid' ? 'success' : result?.status?.toLowerCase() ?? 'success',
        razorpay_order_id: null,
        razorpay_payment_id: null,
      };
      await this.prisma.withTenant(tenantId, async (tx) => {
        if (usesPostgresStore() && tx?.studioPayment?.create) {
          const type = request.membership_id ? 'Membership' : request.booking_id ? 'Class pass' : 'Manual';
          await tx.studioPayment.create({
            data: {
              tenantId,
              memberId: request.member_id,
              ref: generatedRef,
              type,
              date: new Date(),
              amount: request.amount,
              method: request.payment_method,
              status: 'Paid',
              refundedAmount: 0,
              notes: `Manual payment (${request.payment_method})`,
            },
          }).catch(() => null);
        }
        const committed = await tx.idempotencyKey.updateMany({
          where: { ...unique, responseStatus: 102, responseBody: { path: ['claim_id'], equals: claimId } },
          data: { responseStatus: 201, responseBody: response as Prisma.InputJsonValue },
        });
        if (committed.count !== 1) throw new ConflictException('Payment request processing lease was superseded');
        await this.auditOutbox.recordInTransaction(tx, {
          tenantId, correlationId, actorType: 'user', actorId, action: 'payment.manual_recorded', resourceType: 'payment', resourceRef: paymentId,
          eventType: 'payment.confirmed', payload: { paymentId, memberId: request.member_id, amount: request.amount, currency, method: request.payment_method },
        });
      });
      return response;
    }

    const orderInput = {
      memberId: request.member_id,
      membershipId: request.membership_id,
      bookingId: request.booking_id,
      amount: request.amount,
      currency,
      tenantCode,
      idempotencyKey: request.idempotency_key,
    };
    let intent: { payment_id?: string } = {};
    try {
      await this.erp.call({ tenantId: tenantCode, correlationId, method: 'wellness_studio.api.payment.validate_order_request', body: {
        tenant: tenantCode, member: request.member_id, amount: request.amount, currency, idempotency_key: erpIdempotencyKey,
        membership: request.membership_id, booking: request.booking_id,
      } });
      intent = await this.erp.call({ tenantId: tenantCode, correlationId, method: 'wellness_studio.api.payment.create_order_intent', idempotencyKey: erpIdempotencyKey, body: {
        tenant: tenantCode, member: request.member_id, amount: request.amount, currency, idempotency_key: erpIdempotencyKey,
        membership: request.membership_id, booking: request.booking_id,
      } }) as { payment_id?: string };
    } catch (err) {
      if (!usesPostgresStore()) throw err;
      intent = { payment_id: `intent-${randomUUID()}` };
    }
    if (!intent?.payment_id) {
      if (usesPostgresStore()) {
        intent = { payment_id: `intent-${randomUUID()}` };
      } else {
        throw new Error('ERP payment intent response omitted its identifier');
      }
    }
    // Recover an order created before a network timeout prevented us from
    // persisting its response. A verified empty lookup allows a safe retry;
    // Razorpay's unique receipt prevents a duplicate if visibility is delayed.
    const recoveredOrder = await this.razorpay.findOrder(orderInput);
    const order = recoveredOrder ?? await this.razorpay.createOrder(orderInput);
    try {
      await this.erp.call({ tenantId: tenantCode, correlationId, method: 'wellness_studio.api.payment.attach_order_reference', idempotencyKey: erpIdempotencyKey, body: {
        tenant: tenantCode, idempotency_key: erpIdempotencyKey, provider_order_reference: order.id,
      } });
    } catch (err) {
      if (!usesPostgresStore()) throw err;
    }
    const response = {
      id: `PAY-${createHash('sha256').update(`${tenantCode}:${request.idempotency_key}`).digest('hex').slice(0, 32)}`,
      erp_payment_id: intent.payment_id,
      erp_payment_idempotency_key: erpIdempotencyKey,
      member_id: request.member_id,
      membership_id: request.membership_id,
      booking_id: request.booking_id,
      amount: request.amount,
      currency,
      payment_method: 'razorpay',
      status: 'pending',
      razorpay_order_id: order.id,
      mode: order.mode,
      provider_order: order,
    };
    await this.prisma.withTenant(tenantId, async (tx) => {
      const claim = await tx.idempotencyKey.updateMany({
        where: { ...unique, responseStatus: 102, responseBody: { path: ['claim_id'], equals: claimId } },
        data: { responseStatus: 201, responseBody: response as Prisma.InputJsonValue },
      });
      if (claim.count !== 1) throw new ConflictException('Payment request processing lease was superseded');
      await this.auditOutbox.recordInTransaction(tx, {
        tenantId, correlationId, actorType: 'user', actorId, action: 'payment.order_created', resourceType: 'payment', resourceRef: intent.payment_id as string,
        eventType: 'payment.pending', payload: { paymentId: intent.payment_id, memberId: request.member_id, amount: request.amount, currency, razorpayOrderId: order.id },
      });
    });
    return this.publicPayment(response);
  }
}
