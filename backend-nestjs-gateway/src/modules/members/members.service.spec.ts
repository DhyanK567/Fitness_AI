import { jest } from '@jest/globals';
import { MembersService } from './members.service';

describe('MembersService', () => {
  const context = { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' };

  it('uses the ERP tenant code for tenant-scoped reads', async () => {
    const erpCall = jest.fn<(args: any) => Promise<any>>();
    erpCall.mockResolvedValue([]);
    const erp = { call: erpCall };
    const service = new MembersService(erp as any, {} as any, {} as any);
    await service.list(context);
    expect(erp.call).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'studio-a', method: 'wellness_studio.api.member.list_members', httpMethod: 'GET',
      body: { tenant: 'studio-a', limit: 100, start: 0 },
    }));
  });

  it('loads and updates a member profile only through the authenticated ERP member reference', async () => {
    const erpCall = jest.fn<(args: any) => Promise<any>>();
    erpCall.mockResolvedValue({ id: 'WS-MEM-SELF' });
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const tx = {};
    const service = new MembersService(
      { call: erpCall } as any,
      { recordInTransaction } as any,
      { withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)) } as any,
    );
    const memberContext = { ...context, memberRef: 'WS-MEM-SELF' };
    await service.getSelf(memberContext);
    await service.updateSelf(memberContext, { full_name: 'Updated Name' }, 'user-self');
    expect(erpCall).toHaveBeenNthCalledWith(1, expect.objectContaining({
      method: 'wellness_studio.api.member.get_member', body: { tenant: 'studio-a', member: 'WS-MEM-SELF' },
    }));
    expect(erpCall).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'wellness_studio.api.member.update_member', body: { tenant: 'studio-a', member: 'WS-MEM-SELF', updates: { full_name: 'Updated Name' } },
    }));
    expect(recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({ actorId: 'user-self', resourceRef: 'WS-MEM-SELF' }));
  });

  it('writes through ERP and records an audit/outbox entry only after ERP returns an ID', async () => {
    const erpCall = jest.fn<(args: any) => Promise<any>>();
    erpCall.mockResolvedValue({ id: 'WS-MEM-0001' });
    const erp = { call: erpCall };
    const tx = {};
    const prisma = { withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)) };
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const auditOutbox = { recordInTransaction };
    const service = new MembersService(erp as any, auditOutbox as any, prisma as any);
    const response = await service.create(context, { full_name: 'A Person', phone: '+14155550100' }, 'user-1');
    expect(response).toEqual({ id: 'WS-MEM-0001' });
    expect(auditOutbox.recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant-uuid', actorId: 'user-1', resourceType: 'member', resourceRef: 'WS-MEM-0001', action: 'member.created',
    }));
  });

  it('does not let a member mutation attach a membership outside the membership flow', async () => {
    const erp = { call: jest.fn<(...args: any[]) => Promise<any>>() };
    const service = new MembersService(erp as any, {} as any, {} as any);
    await expect(service.create(context, { full_name: 'A Person', membership_id: 'MSHIP-1' }, 'user-1')).rejects.toThrow(/create the member first/i);
    await expect(service.update(context, 'WS-MEM-1', { membership_id: 'MSHIP-1' }, 'user-1')).rejects.toThrow('memberships API');
    expect(erp.call).not.toHaveBeenCalled();
  });

  it('scopes trainer member lists to explicit server-side assignments', async () => {
    const findMany = jest.fn(async () => []);
    const prisma = { studioMember: {}, withTenant: jest.fn((_tenant: string, work: any) => work({ studioMember: { findMany } })) };
    const service = new MembersService({} as any, {} as any, prisma as any);
    await service.list({ ...context, actorId: '22222222-2222-4222-8222-222222222222', roles: ['trainer'] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: context.tenantId, trainerUserId: '22222222-2222-4222-8222-222222222222' },
    }));
  });

  it.each(['coach', 'lead_trainer'])('applies assignment scoping for the %s role too', async (role) => {
    const findMany = jest.fn(async () => []);
    const prisma = { studioMember: {}, withTenant: jest.fn((_tenant: string, work: any) => work({ studioMember: { findMany } })) };
    const service = new MembersService({} as any, {} as any, prisma as any);
    await service.list({ ...context, actorId: '22222222-2222-4222-8222-222222222222', roles: [role] });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: context.tenantId, trainerUserId: '22222222-2222-4222-8222-222222222222' },
    }));
  });

  it('fails closed for trainer reads when the configured store cannot enforce assignments', async () => {
    const previousStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'erp';
    const call = jest.fn();
    const service = new MembersService({ call } as any, {} as any, {} as any);
    try {
      await expect(service.list({ ...context, actorId: 'trainer-1', roles: ['lead_trainer'] })).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      await expect(service.get({ ...context, actorId: 'trainer-1', roles: ['coach'] }, 'member-1')).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      expect(call).not.toHaveBeenCalled();
    } finally {
      if (previousStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = previousStore;
    }
  });
});
