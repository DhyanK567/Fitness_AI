import { BadRequestException, NotFoundException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { ConfigurationService } from './configuration.service';

const TENANT = 'tenant-uuid';
const setting = (settingKey: string, settingValue: unknown) => ({
  id: 'internal-row-id',
  tenantId: TENANT,
  settingKey,
  settingValue,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
});

function makeService({ initial = setting('default_capacity', 30) }: { initial?: ReturnType<typeof setting> | null } = {}) {
  const tx = {
    tenantSetting: {
      findMany: jest.fn(async () => [setting('default_capacity', 30)]),
      findUnique: jest.fn(async () => initial),
      upsert: jest.fn(async (args: { create: { settingKey: string; settingValue: unknown } }) => setting(args.create.settingKey, args.create.settingValue)),
    },
  };
  const prisma = {
    withTenant: jest.fn(async (_tenantId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const audit = { recordInTransaction: jest.fn(async () => undefined) };
  const service = new ConfigurationService(prisma as unknown as PrismaService, audit as unknown as AuditOutboxService);
  return { service, prisma, tx, audit };
}

describe('ConfigurationService', () => {
  it('returns only the public setting key/value shape for lists and cached reads', async () => {
    const { service, prisma, tx } = makeService();

    await expect(service.list(TENANT)).resolves.toEqual([{ key: 'default_capacity', value: 30 }]);
    await expect(service.get(TENANT, 'default_capacity')).resolves.toEqual({ key: 'default_capacity', value: 30 });
    await expect(service.get(TENANT, 'default_capacity')).resolves.toEqual({ key: 'default_capacity', value: 30 });

    expect(tx.tenantSetting.findMany).toHaveBeenCalledWith({ where: { tenantId: TENANT }, orderBy: { settingKey: 'asc' } });
    expect(tx.tenantSetting.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.withTenant).toHaveBeenCalledTimes(2);
  });

  it('audits a tenant-scoped upsert and invalidates the tenant/key cache', async () => {
    const { service, tx, audit, prisma } = makeService();
    tx.tenantSetting.findUnique
      .mockResolvedValueOnce(setting('cancellation_window_hours', 4))
      .mockResolvedValueOnce(setting('cancellation_window_hours', 4))
      .mockResolvedValueOnce(setting('cancellation_window_hours', 6));
    tx.tenantSetting.upsert.mockResolvedValueOnce(setting('cancellation_window_hours', 6));

    await service.get(TENANT, 'cancellation_window_hours');
    await expect(service.upsert(TENANT, 'cancellation_window_hours', 6, 'actor-id', 'corr-id'))
      .resolves.toEqual({ key: 'cancellation_window_hours', value: 6 });
    await expect(service.get(TENANT, 'cancellation_window_hours'))
      .resolves.toEqual({ key: 'cancellation_window_hours', value: 6 });

    expect(tx.tenantSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_settingKey: { tenantId: TENANT, settingKey: 'cancellation_window_hours' } },
      create: { tenantId: TENANT, settingKey: 'cancellation_window_hours', settingValue: 6 },
    }));
    expect(audit.recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: TENANT,
      correlationId: 'corr-id',
      actorId: 'actor-id',
      action: 'setting.updated',
      payload: { settingKey: 'cancellation_window_hours' },
      beforeData: 4,
      afterData: 6,
    }));
    expect(prisma.withTenant).toHaveBeenCalledTimes(3);
  });

  it('rejects malformed keys and oversized or non-serializable values before database access', async () => {
    const { service, prisma } = makeService();

    await expect(service.get(TENANT, 'Bad Key')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(TENANT, 'x', 1, 'actor-id', 'corr-id')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upsert(TENANT, 'valid_key', 'x'.repeat(16_385), 'actor-id', 'corr-id')).rejects.toThrow('too large');
    await expect(service.upsert(TENANT, 'valid_key', undefined, 'actor-id', 'corr-id')).rejects.toThrow('JSON serializable');

    expect(prisma.withTenant).not.toHaveBeenCalled();
  });

  it('returns not found for an absent key', async () => {
    const { service } = makeService({ initial: null });

    await expect(service.get(TENANT, 'missing_setting')).rejects.toBeInstanceOf(NotFoundException);
  });
});
