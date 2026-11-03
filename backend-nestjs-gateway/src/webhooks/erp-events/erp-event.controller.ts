import { Controller, Post, Body, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request as ExpressRequest } from 'express';

@ApiTags('Webhooks')
@Controller('webhooks/erp-events')
export class ErpEventController {
  @Post('/')
  @ApiOperation({ summary: 'Receive ERP event callback' })
  async receive(
    @Req() req: RawBodyRequest<ExpressRequest>,
  ) {
    const rawBody = req.rawBody?.toString('utf8') || '';
    const signature = req.headers['x-erp-signature'] as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    const correlationId = req.headers['x-correlation-id'] as string;

    // Verify signature, process event, emit to audit log
    return { success: true, message: 'ERP event received' };
  }
}