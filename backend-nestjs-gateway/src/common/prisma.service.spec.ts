import { jest } from '@jest/globals';
import { PrismaService } from './prisma.service';

describe('PrismaService tenant RLS context', () => {
  it('sets the tenant UUID locally inside the transaction before querying', async () => {
    const queryRaw = jest.fn(async () => [{ set_config: '123e4567-e89b-42d3-a456-426614174000' }]);
    const tx = { $queryRaw: queryRaw as any };
    const service = Object.create(PrismaService.prototype) as PrismaService;
    service.$transaction = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) as any;
    const work = jest.fn(async () => 'result');

    await expect(service.withTenant('123e4567-e89b-42d3-a456-426614174000', work)).resolves.toBe('result');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledWith(tx);
  });

  it('rejects non-UUID tenant identifiers before opening a transaction', async () => {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    service.$transaction = jest.fn() as any;
    await expect(service.withTenant('pilot-studio', async () => 'never')).rejects.toThrow('canonical tenant UUID');
    expect(service.$transaction).not.toHaveBeenCalled();
  });
});
