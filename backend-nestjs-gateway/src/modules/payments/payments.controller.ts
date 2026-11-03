import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req, RawBodyRequest, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, UpdatePaymentDto, PaymentResponseDto } from './dto';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { RequirePermission } from '../../common/permission.decorator';
import { RequireAnyRole, RequireTier } from '../../common/tier-entitlement.decorator';
import type { RequestWithContext } from '../../common/request-context.types';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(TenantContextGuard, StaffAccessGuard)
@RequireTier('enterprise')
@RequireAnyRole('owner', 'admin', 'biller', 'accountant')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  @RequirePermission('payments:write')
  @ApiOperation({ summary: 'Create a payment record' })
  async create(
    @Body() dto: CreatePaymentDto,
    @Req() req: RequestWithContext,
  ): Promise<any> {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      role: req.auth!.roles[0],
      correlationId: `payment_${Date.now()}`,
    };
    return this.service.create(context, dto);
  }

  @Get()
  @RequirePermission('payments:read')
  @ApiOperation({ summary: 'List payments' })
  async findAll(
    @Req() req: RequestWithContext,
    @Query('member_id') memberId?: string,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      role: req.auth!.roles[0],
      correlationId: `list_${Date.now()}`,
    };
    return this.service.findAll(context, memberId);
  }

  @Get(':id')
  @RequirePermission('payments:read')
  @ApiOperation({ summary: 'Get payment by ID' })
  async findOne(
    @Param('id') id: string,
    @Req() req: RequestWithContext,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      role: req.auth!.roles[0],
      correlationId: `get_${Date.now()}`,
    };
    return this.service.findOne(context, id);
  }

  @Patch(':id')
  @RequirePermission('payments:write')
  @ApiOperation({ summary: 'Update payment status' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePaymentDto,
    @Req() req: RequestWithContext,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      role: req.auth!.roles[0],
      correlationId: `update_${Date.now()}`,
    };
    return this.service.update(context, id, dto);
  }

  @Post(':id/refund')
  @RequirePermission('payments:write')
  @ApiOperation({ summary: 'Refund a payment' })
  async refund(
    @Param('id') id: string,
    @Req() req: RequestWithContext,
  ) {
    const context = {
      tenantId: req.tenantId as string,
      userId: req.auth!.userId,
      role: req.auth!.roles[0],
      correlationId: `refund_${Date.now()}`,
    };
    return this.service.refund(context, id);
  }

}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly service: PaymentsService) {}

  @Post('webhook')
  @Header('Content-Type', 'application/json')
  @ApiOperation({ summary: 'Razorpay payment webhook (no auth - verified by signature)' })
  async webhook(
    @Req() req: RawBodyRequest<ExpressRequest>,
  ) {
    const rawBody = req.rawBody?.toString('utf8') || '';
    const signature = req.headers['x-razorpay-signature'] as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.headers['x-correlation-id'] as string;
    const context = {
      tenantId: tenantId || 'default',
      userId: 'webhook',
      role: 'system',
      correlationId: correlationId || `webhook_${Date.now()}`,
    };
    return this.service.processWebhook(context, rawBody, signature);
  }
}
