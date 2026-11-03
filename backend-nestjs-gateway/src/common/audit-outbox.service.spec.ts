import { AuditOutboxService } from './audit-outbox.service';
import { PrismaService } from './prisma.service';
import { withRequestAuditContext } from './request-audit-context';

describe('AuditOutboxService', () => {
  it('uses one transaction and writes both records', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      auditLog: { create: jest.fn(async () => ({ id: 'audit' })) },
      outboxEvent: { create: jest.fn(async () => ({ id: 'event' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenantId: string, callback: (value: typeof tx) => unknown) => callback(tx)) } as unknown as PrismaService;
    const result = await new AuditOutboxService(prisma).record({
      tenantId: '123e4567-e89b-42d3-a456-426614174000', correlationId: '00000000-0000-0000-0000-000000000001',
      actorType: 'staff', action: 'create', resourceType: 'member', resourceRef: 'MEM-1',
      eventType: 'member.created', payload: { id: 'MEM-1' },
    });
    expect(result).toEqual({ audit: { id: 'audit' }, outbox: { id: 'event' } });
    expect(prisma.withTenant).toHaveBeenCalledTimes(1);
  });

  it('persists only resource-allowlisted snapshot fields and drops raw settings values', async () => {
    const tx = {
      auditLog: { create: jest.fn(async () => ({ id: 'audit' })) },
      outboxEvent: { create: jest.fn(async () => ({ id: 'event' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenantId: string, callback: (value: typeof tx) => unknown) => callback(tx)) } as unknown as PrismaService;
    const service = new AuditOutboxService(prisma);
    const base = {
      tenantId: '123e4567-e89b-42d3-a456-426614174000', correlationId: '00000000-0000-0000-0000-000000000001',
      actorType: 'staff', action: 'update', resourceRef: 'resource-1', eventType: 'resource.updated', payload: { id: 'resource-1' },
    };

    await service.record({ ...base, resourceType: 'staff', afterData: { email: 'private@example.test', displayName: 'Private Person', status: 'invited', roleCodes: ['trainer'] } });
    expect(tx.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      afterData: { status: 'invited', roleCodes: ['trainer'] },
    }) });

    await service.record({ ...base, resourceType: 'tenant_setting', beforeData: { secret: 'never-store-me' }, afterData: { settingKey: 'class.capacity', value: 30 } });
    expect(tx.auditLog.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({
      beforeData: undefined,
      afterData: { settingKey: 'class.capacity' },
    }) });
  });

  it('adds bounded HTTP request metadata to audit records without caller plumbing', async () => {
    const tx = {
      auditLog: { create: jest.fn(async () => ({ id: 'audit' })) },
      outboxEvent: { create: jest.fn(async () => ({ id: 'event' })) },
    };
    const prisma = { withTenant: jest.fn(async (_tenantId: string, callback: (value: typeof tx) => unknown) => callback(tx)) } as unknown as PrismaService;
    const input = {
      tenantId: '123e4567-e89b-42d3-a456-426614174000', correlationId: '00000000-0000-0000-0000-000000000001',
      actorType: 'staff', action: 'update', resourceType: 'staff', resourceRef: 'staff-1', eventType: 'staff.updated', payload: { id: 'staff-1' },
    };

    await withRequestAuditContext({ ipAddress: '192.0.2.7', route: '/api/staff/1', userAgent: 'test-agent' }, () =>
      new AuditOutboxService(prisma).record(input));

    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      requestContext: { correlationId: input.correlationId, ipAddress: '192.0.2.7', route: '/api/staff/1', userAgent: 'test-agent' },
    }) });
  });
});
import { jest } from '@jest/globals';
