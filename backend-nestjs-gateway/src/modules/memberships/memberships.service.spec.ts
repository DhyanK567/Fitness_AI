import { jest } from '@jest/globals';
import { MembershipsService } from './memberships.service';

describe('MembershipsService', () => {
  const context = { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-2' };

  it('reads memberships using the resolved ERP tenant scope', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue([]);
    const service = new MembershipsService({ call } as any, {} as any, {} as any);
    await service.list(context);
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'studio-a', method: 'wellness_studio.api.membership.list_memberships', httpMethod: 'GET',
      body: { tenant: 'studio-a' },
    }));
  });

  it('asks ERP to scope a member self-service membership read by the linked member reference', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue([]);
    const service = new MembershipsService({ call } as any, {} as any, {} as any);
    await service.listForMember({ ...context, memberRef: 'WS-MEM-SELF' });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'wellness_studio.api.membership.list_memberships', httpMethod: 'GET',
      body: { tenant: 'studio-a', member_filter: 'WS-MEM-SELF' },
    }));
  });

  it('forces member-created memberships to use the authenticated linked member', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue({ id: 'WS-MSHIP-SELF' });
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const tx = {};
    const service = new MembershipsService(
      { call } as any,
      { recordInTransaction } as any,
      { withTenant: jest.fn((_tenant: string, work: (client: unknown) => unknown) => work(tx)) } as any,
    );
    await service.createForMember({ ...context, memberRef: 'WS-MEM-TRUSTED' }, {
      plan_name: 'Monthly', plan_type: 'monthly', start_date: '2026-10-08', end_date: '2026-11-07', price: 1200, auto_renew: false,
    }, 'user-member');
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'wellness_studio.api.membership.create_membership',
      body: expect.objectContaining({ tenant: 'studio-a', member_id: 'WS-MEM-TRUSTED' }),
    }));
  });

  it('persists a pending membership through ERP before auditing it', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue({ id: 'WS-MSHIP-1', status: 'pending' });
    const tx = {};
    const withTenant = jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx));
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const service = new MembershipsService({ call } as any, { recordInTransaction } as any, { withTenant } as any);
    const body = { member_id: 'WS-MEM-1', plan_name: 'Standard', plan_type: 'monthly', start_date: '2026-10-06', end_date: '2026-11-05', price: 1500, auto_renew: false };
    await service.create(context, body, 'user-1');
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      method: 'wellness_studio.api.membership.create_membership', body: { tenant: 'studio-a', ...body },
    }));
    expect(recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant-uuid', actorId: 'user-1', action: 'membership.created', resourceRef: 'WS-MSHIP-1',
    }));
  });

  it('rejects an empty update so clients cannot issue a false successful write', async () => {
    const call = jest.fn<(...args: any[]) => Promise<any>>();
    const service = new MembershipsService({ call } as any, {} as any, {} as any);
    await expect(service.update(context, 'WS-MSHIP-1', {}, 'user-1')).rejects.toThrow('At least one membership field');
    expect(call).not.toHaveBeenCalled();
  });
});
