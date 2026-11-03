import { Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { RequestWithContext } from '../../common/request-context.types';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@ApiTags('Webhooks')
@Controller('webhooks/razorpay')
export class RazorpayWebhookController {
  constructor(private readonly webhookService: RazorpayWebhookService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay SaaS subscription webhook (verified by HMAC signature)' })
  @ApiResponse({ status: 200, description: 'Webhook received and recorded (or duplicate identified)' })
  @ApiResponse({ status: 400, description: 'Missing body, malformed JSON, or missing event fields' })
  @ApiResponse({ status: 401, description: 'Missing or invalid signature' })
  async handleWebhook(
    @Req() req: Request & RequestWithContext & { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
  ) {
    return this.webhookService.processWebhook({
      signature,
      rawBody: req.rawBody,
      correlationId: req.correlationId,
      ip: req.ip,
    });
  }
}