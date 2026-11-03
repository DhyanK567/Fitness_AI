import { BadRequestException, Body, Controller, Headers, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { verifyHmacSignature } from '../common/signature';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';

@Controller('webhooks/erp-events')
export class ErpCallbackController {
  constructor(private readonly config: ConfigService, private readonly prisma: PrismaService, private readonly audit: AuditOutboxService) {}

  @Post()
  @UseGuards(TenantContextGuard)
  async receive(@Req() request: RequestWithContext & Request, @Headers('x-erp-signature') signature: string, @Body() body: Record<string, unknown>) {
    const raw = request.rawBody?.toString('utf8') ?? JSON.stringify(body);
    const secret = this.config.get<string>('FRAPPE_CALLBACK_SECRET');
    if (!secret || !verifyHmacSignature(raw, signature, secret)) {
      try {
        await this.prisma.withTenant(request.tenantId as string, (tx) => tx.securityEvent.create({
          data: { tenantId: request.tenantId as string, eventType: 'erp.invalid_signature', severity: 'high', ipAddress: request.ip, route: request.path.slice(0, 200), correlationId: request.correlationId, details: { provider: 'erpnext' } },
        }));
      } catch { /* Authentication failure still wins if audit storage is unavailable. */ }
      throw new UnauthorizedException('Invalid ERP callback signature');
    }
    const eventId = typeof body.event_id === 'string' && isUUID(body.event_id) ? body.event_id : '';
    const eventType = typeof body.event_type === 'string' ? body.event_type : '';
    const resourceType = typeof body.resource_type === 'string' ? body.resource_type : '';
    const resourceRef = typeof body.resource_ref === 'string' ? body.resource_ref : '';
    if (!eventId || !eventType || eventType.length > 100 || !resourceType || resourceType.length > 60 || !resourceRef || resourceRef.length > 140 ||
      !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
      throw new BadRequestException('ERP callback event identity, resource, or payload is invalid');
    }
    const tenantId = request.tenantId as string;
    if (typeof body.tenant_id !== 'string' || body.tenant_id !== request.tenantCode) {
      throw new BadRequestException('ERP callback tenant does not match request host.');
    }
    const outcome = await this.prisma.withTenant(tenantId, async (tx) => {
      const existing = await tx.webhookInbox.findUnique({ where: { tenantId_provider_providerEventId: { tenantId, provider: 'erpnext', providerEventId: eventId } } });
      if (existing) return { status: existing.status, duplicate: true };
      await tx.webhookInbox.create({ data: { tenantId, provider: 'erpnext', providerEventId: eventId, payload: body as Prisma.InputJsonValue, status: 'processed', processedAt: new Date() } });
      await this.audit.recordInTransaction(tx, { tenantId, correlationId: request.correlationId as string, actorType: 'erp', action: eventType, resourceType, resourceRef, eventType, payload: body as Prisma.InputJsonValue });
      return { status: 'processed', duplicate: false };
    });
    return { event_id: eventId, ...outcome };
  }
}
