import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { PaymentsService } from './payments.service';
import { RequirePermission } from '../common/permission.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { MemberOrStaffAccessGuard } from '../modules/bookings/booking-access.guard';
import { RequireAnyRole, RequireTier } from '../common/tier-entitlement.decorator';
import { RecordLedgerPaymentDto, RefundPaymentDto, UpdatePaymentDto } from './dto/update-payment.dto';
import { CreateMembershipOrderDto, VerifyMembershipPaymentDto } from './dto/membership-payment.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get('config')
  @UseGuards(TenantContextGuard)
  getConfig() {
    return this.service.getConfig();
  }

  @Get('studio-plan-config')
  getStudioPlanConfig() {
    return this.service.getStudioPlanConfig();
  }

  @Post('studio-order')
  createStudioOrder(
    @Body() body: { plan_tier: 'Basic' | 'Premium' | 'Ultra Premium'; studio_name: string; owner_email: string; owner_name?: string; owner_phone?: string; idempotency_key?: string },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createStudioOrder({ ...body, idempotency_key: body.idempotency_key || idempotencyKey });
  }

  @Post('studio-verify')
  verifyStudioPayment(
    @Body() body: { plan_tier: 'Basic' | 'Premium' | 'Ultra Premium'; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
  ) {
    return this.service.verifyStudioPayment(body);
  }

  @Post('membership-order')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  createMembershipOrder(
    @Req() request: RequestWithContext,
    @Body() body: CreateMembershipOrderDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.createMembershipOrder(
      request.tenantId as string,
      request.tenantCode as string,
      (request.auth?.memberRef || request.auth?.userId) as string,
      body.plan_id,
      body.idempotency_key || idempotencyKey,
      body.referral_code,
      body.redeem_reward,
    );
  }

  @Post('verify')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  verifyMembershipPayment(
    @Req() request: RequestWithContext,
    @Body() body: VerifyMembershipPaymentDto,
  ) {
    return this.service.verifyMembershipPayment(
      request.tenantId as string,
      request.tenantCode as string,
      (request.auth?.memberRef || request.auth?.userId) as string,
      body,
    );
  }

  @Get('my-payments')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  getMyPayments(@Req() request: RequestWithContext) {
    if (!request.auth?.memberRef) throw new ForbiddenException('Only authenticated members can access their payment ledger');
    return this.service.list({
      tenantId: request.tenantId as string,
      tenantCode: request.tenantCode as string,
      correlationId: request.correlationId as string,
      memberRef: request.auth.memberRef,
    });
  }

  @Get()
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:read')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  list(@Req() request: RequestWithContext) {
    return this.service.list({ tenantId: request.tenantId as string, tenantCode: request.tenantCode as string, correlationId: request.correlationId as string, memberRef: request.auth?.memberRef });
  }

  @Get(':id')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:read')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  get(@Req() request: RequestWithContext, @Param('id') id: string) {
    return this.service.get({ tenantId: request.tenantId as string, tenantCode: request.tenantCode as string, correlationId: request.correlationId as string, memberRef: request.auth?.memberRef }, id);
  }

  @Post()
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  create(
    @Req() request: RequestWithContext & Request,
    @Body() body: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!request.auth?.memberRef && !body.member_id) throw new BadRequestException('member_id is required for staff-created payments');
    if (request.auth?.memberRef && body.payment_method !== 'razorpay') {
      throw new ForbiddenException('Members can only initiate Razorpay payments');
    }
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('A valid Idempotency-Key UUID header is required');
    }
    return this.service.create(
      { ...body, member_id: request.auth?.memberRef ?? body.member_id as string, idempotency_key: idempotencyKey },
      request.tenantId as string,
      request.tenantCode as string,
      request.correlationId as string,
      request.auth?.userId as string,
    );
  }

  @Post('ledger')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:write')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  recordLedgerPayment(@Req() request: RequestWithContext, @Body() body: RecordLedgerPaymentDto) {
    return this.service.recordLedgerPayment(request.tenantId as string, body, request.auth?.userId as string);
  }

  @Patch(':id')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:write')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  update(@Req() request: RequestWithContext, @Param('id') id: string, @Body() body: UpdatePaymentDto) {
    return this.service.updateLedger(request.tenantId as string, id, body, request.auth?.userId as string);
  }

  @Post(':id/refund')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:write')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  refund(@Req() request: RequestWithContext, @Param('id') id: string, @Body() body: RefundPaymentDto) {
    return this.service.refundLedger(request.tenantId as string, id, body, request.auth?.userId as string);
  }

  @Get(':id/gst-receipt')
  @UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
  @RequirePermission('payments:read')
  @RequireTier('enterprise')
  @RequireAnyRole('owner', 'admin', 'biller', 'accountant')
  gstReceipt(@Req() request: RequestWithContext, @Param('id') id: string) {
    return this.service.gstReceipt(request.tenantId as string, id);
  }
}
