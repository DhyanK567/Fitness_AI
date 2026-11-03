import { Body, Controller, Headers, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { PaymentWebhookService } from './payment-webhook.service';

@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly service: PaymentWebhookService) {}

  @Post('webhook')
  @UseGuards(TenantContextGuard)
  process(
    @Req() request: RequestWithContext & Request,
    @Headers('x-razorpay-signature') signature: string,
    @Body() body: unknown,
  ) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(body);
    return this.service.process({ tenantId: request.tenantId as string, tenantCode: request.tenantCode as string, correlationId: request.correlationId as string, ipAddress: request.ip, route: request.path, signature, rawBody });
  }
}
