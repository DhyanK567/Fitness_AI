import { EmployeeWorkspacesService } from './employee-workspaces.service';

describe('EmployeeWorkspacesService', () => {
  const tenantId = '22222222-2222-4222-8222-222222222222';
  const userId = '11111111-1111-4111-8111-111111111111';

  function baseTx() {
    return {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: userId, displayName: 'Authenticated Employee', email: 'employee@example.test' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: tenantId, code: 'real-studio', displayName: 'Real Studio', timezone: 'Asia/Kolkata', currency: 'INR', tierId: 'tier-1' }) },
      subscriptionTier: { findUnique: jest.fn().mockResolvedValue({ code: 'enterprise', displayName: 'Ultra Premium' }) },
      studioMember: { findMany: jest.fn().mockResolvedValue([]) },
      studioClass: { findMany: jest.fn().mockResolvedValue([]) },
      studioBooking: { findMany: jest.fn().mockResolvedValue([]) },
      studioAttendance: { findMany: jest.fn().mockResolvedValue([]) },
      studioPayment: { findMany: jest.fn().mockResolvedValue([]) },
      role: { findMany: jest.fn().mockResolvedValue([]) },
      userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
      studioSessionFeedback: { findMany: jest.fn().mockResolvedValue([]) },
      studioLead: { create: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
    };
  }

  it('scopes the reception overview and employee identity to the authenticated tenant', async () => {
    const tx = baseTx();
    tx.studioMember.findMany.mockResolvedValue([{ id: 'member-1' }]);
    const prisma = { withTenant: jest.fn((_id: string, callback: (client: any) => unknown) => callback(tx)) };
    const result = await new EmployeeWorkspacesService(prisma as any).frontDesk(tenantId, userId);

    expect(prisma.withTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: userId, tenantId }) }));
    expect(tx.studioMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
    expect(result.user.displayName).toBe('Authenticated Employee');
    expect(result.studio.name).toBe('Real Studio');
  });

  it('calculates finance totals only from tenant-scoped persisted payments', async () => {
    const tx = baseTx();
    tx.studioPayment.findMany.mockResolvedValue([
      { amount: 1180, refundedAmount: 180, status: 'Paid' },
      { amount: 500, refundedAmount: 0, status: 'Pending' },
    ]);
    const prisma = { withTenant: jest.fn((_id: string, callback: (client: any) => unknown) => callback(tx)) };
    const result = await new EmployeeWorkspacesService(prisma as any).billing(tenantId, userId);

    expect(tx.studioPayment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
    expect(result.totals).toEqual({ collected: 1000, pending: 500, refunded: 180 });
  });

  it('persists reception walk-in leads inside the authenticated tenant', async () => {
    const tx = baseTx();
    const prisma = { withTenant: jest.fn((_id: string, callback: (client: any) => unknown) => callback(tx)) };
    await new EmployeeWorkspacesService(prisma as any).createWalkInLead(tenantId, userId, {
      full_name: '  New Member  ',
      phone: '+91 9845091122',
      email: ' PERSON@EXAMPLE.COM ',
      plan: 'Yoga',
      notes: 'Morning batch',
    });

    expect(tx.studioLead.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId,
      name: 'New Member',
      phone: '+919845091122',
      email: 'person@example.com',
      source: 'Walk-in',
      stage: 'New enquiry',
    }) });
  });

  it('loads lead-trainer people, clients, programming, and feedback from one tenant only', async () => {
    const tx = baseTx();
    tx.role.findMany.mockResolvedValue([{ id: 'role-1', code: 'trainer' }]);
    tx.userRoleAssignment.findMany.mockResolvedValue([{ userId: 'trainer-1', roleId: 'role-1' }]);
    tx.user.findMany.mockResolvedValue([{ id: 'trainer-1', displayName: 'Database Trainer' }]);
    const prisma = { withTenant: jest.fn((_id: string, callback: (client: any) => unknown) => callback(tx)) };
    const result = await new EmployeeWorkspacesService(prisma as any).leadTrainer(tenantId, userId);

    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId }) }));
    expect(tx.studioClass.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
    expect(tx.studioSessionFeedback.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId } }));
    expect(result.trainers[0]).toEqual(expect.objectContaining({ displayName: 'Database Trainer', role: 'trainer' }));
  });
});
