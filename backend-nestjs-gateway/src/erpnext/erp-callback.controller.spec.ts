import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import type { RequestWithContext } from '../common/request-context.types';
import { ErpCallbackController } from './erp-callback.controller';

const SECRET = 'callback-test-secret-with-sufficient-entropy';
const TENANT_ID = 'tenant-uuid-1';
const TENANT_CODE = 'tenant-a';
const EVENT_ID = '2cbef780-1d68-4d06-8d80-d47665f28a7b';

function signedBody(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
  return { raw, signature };
}

function makeController(existing?: { status: string }) {
  const securityEvent = { create: jest.fn(async (_args: unknown) => ({})) };
  const webhookInbox = {
    findUnique: jest.fn(async (_args: unknown) => existing ?? null),
    create: jest.fn(async (_args: unknown) => ({})),
  };
  const tx = { securityEvent, webhookInbox };
  const prisma = { withTenant: jest.fn(async (_tenantId: string, operation: (client: typeof tx) => unknown) => operation(tx)) };
  const audit = { recordInTransaction: jest.fn(async (_client: unknown, _event: unknown) => undefined) };
  const config = { get: jest.fn((key: string): string | undefined => key === 'FRAPPE_CALLBACK_SECRET' ? SECRET : undefined) };
  const controller = new ErpCallbackController(
    config as unknown as ConfigService,
    prisma as unknown as PrismaService,
    audit as unknown as AuditOutboxService,
  );
  return { controller, prisma, tx, audit };
}

function requestFor(raw: string): RequestWithContext & Request {
  return {
    rawBody: Buffer.from(raw),
    tenantId: TENANT_ID,
    tenantCode: TENANT_CODE,
    correlationId: 'corr-erp-callback',
    ip: '192.0.2.55',
    path: '/webhooks/erp-events',
  } as unknown as RequestWithContext & Request;
}

describe('ErpCallbackController', () => {
  const body = {
    event_id: EVENT_ID,
    event_type: 'membership.expired',
    tenant_id: TENANT_CODE,
    resource_type: 'membership',
    resource_ref: 'MEMBERSHIP-1',
    payload: { membership_id: 'MEMBERSHIP-1' },
  };

  it('accepts a correctly signed callback, stores it once, and audits it transactionally', async () => {
    const { controller, prisma, tx, audit } = makeController();
    const { raw, signature } = signedBody(body);

    await expect(controller.receive(requestFor(raw), signature, body)).resolves.toEqual({
      event_id: EVENT_ID,
      status: 'processed',
      duplicate: false,
    });

    expect(prisma.withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    expect(tx.webhookInbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: TENANT_ID, provider: 'erpnext', providerEventId: EVENT_ID, status: 'processed' }),
    });
    expect(audit.recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: TENANT_ID,
      correlationId: 'corr-erp-callback',
      actorType: 'erp',
      action: 'membership.expired',
      resourceRef: 'MEMBERSHIP-1',
    }));
  });

  it('returns the stored result for a repeated signed event without inserting or re-auditing', async () => {
    const { controller, tx, audit } = makeController({ status: 'processed' });
    const { raw, signature } = signedBody(body);

    await expect(controller.receive(requestFor(raw), signature, body)).resolves.toEqual({
      event_id: EVENT_ID,
      status: 'processed',
      duplicate: true,
    });

    expect(tx.webhookInbox.create).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid signatures and records a tenant-scoped security event', async () => {
    const { controller, prisma, tx, audit } = makeController();
    const { raw } = signedBody(body);

    await expect(controller.receive(requestFor(raw), '00'.repeat(32), body)).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.withTenant).toHaveBeenCalledWith(TENANT_ID, expect.any(Function));
    expect(tx.securityEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: TENANT_ID,
      eventType: 'erp.invalid_signature',
      severity: 'high',
      ipAddress: '192.0.2.55',
      route: '/webhooks/erp-events',
      details: { provider: 'erpnext' },
    }) });
    expect(tx.webhookInbox.create).not.toHaveBeenCalled();
    expect(audit.recordInTransaction).not.toHaveBeenCalled();
  });

  it('rejects a signed callback whose body tenant differs from the host-resolved tenant', async () => {
    const { controller, prisma } = makeController();
    const otherTenantBody = { ...body, tenant_id: 'tenant-b' };
    const { raw, signature } = signedBody(otherTenantBody);

    await expect(controller.receive(requestFor(raw), signature, otherTenantBody)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('rejects signed payloads without event identity before database access', async () => {
    const { controller, prisma } = makeController();
    const incomplete = { tenant_id: TENANT_CODE, event_type: 'membership.expired' };
    const { raw, signature } = signedBody(incomplete);

    await expect(controller.receive(requestFor(raw), signature, incomplete)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.withTenant).not.toHaveBeenCalled();
  });
});
