import { jest } from '@jest/globals';
import { BookingsService } from './bookings.service';

describe('BookingsService', () => {
  const context = { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-booking' };

  it('maps schedule-date booking to the atomic ERP booking operation and audits the result', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValue({ id: 'WS-BK-0001', status: 'confirmed', duplicate: false });
    const tx = {};
    const withTenant = jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx));
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const service = new BookingsService({ call } as any, { recordInTransaction } as any, { withTenant } as any);
    const result = await service.create(context, { member_id: 'WS-MEM-1', class_schedule_id: 'WS-SCH-1', booking_date: '2026-10-07' }, 'user-1');
    expect(result).toMatchObject({ id: 'WS-BK-0001', status: 'confirmed' });
    expect(call).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'studio-a', method: 'wellness_studio.api.booking.book_by_schedule',
      body: { tenant: 'studio-a', member: 'WS-MEM-1', class_schedule_id: 'WS-SCH-1', booking_date: '2026-10-07' },
    }));
    expect(recordInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
      tenantId: 'tenant-uuid', actorId: 'user-1', resourceRef: 'WS-BK-0001', eventType: 'booking.confirmed',
    }));
  });

  it('does not allow a payment to be attached before the booking exists', async () => {
    const call = jest.fn<(...args: any[]) => Promise<any>>();
    const service = new BookingsService({ call } as any, {} as any, {} as any);
    await expect(service.create(context, { member_id: 'WS-MEM-1', class_schedule_id: 'WS-SCH-1', booking_date: '2026-10-07', payment_id: 'PAY-1' }, 'user-1'))
      .rejects.toThrow('Create the booking before creating its payment');
    expect(call).not.toHaveBeenCalled();
  });

  it('forces member booking writes and reads to use the authenticated ERP member link', async () => {
    const originalImportStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'erp';
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValueOnce({ id: 'WS-BK-2', status: 'confirmed', member_id: 'WS-MEM-SELF' });
    const tx = {};
    const withTenant = jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx));
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const service = new BookingsService({ call } as any, { recordInTransaction } as any, { withTenant } as any);
    const memberContext = { ...context, memberRef: 'WS-MEM-SELF' };
    await service.create(memberContext, { member_id: 'WS-MEM-OTHER', class_schedule_id: 'WS-SCH-1', booking_date: '2026-10-07' }, 'user-member');
    expect(call).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ member: 'WS-MEM-SELF' }) }));
    try {
      await service.list(memberContext);
      expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ body: { tenant: 'studio-a', member_filter: 'WS-MEM-SELF' } }));
      await service.get(memberContext, 'WS-BK-2');
      expect(call).toHaveBeenLastCalledWith(expect.objectContaining({ body: { tenant: 'studio-a', booking: 'WS-BK-2', member_filter: 'WS-MEM-SELF' } }));
    } finally {
      if (originalImportStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = originalImportStore;
    }
  });

  it('uses the configured tenant cancellation window rather than a hard-coded gateway value', async () => {
    const call = jest.fn<(input: any) => Promise<any>>();
    call.mockResolvedValueOnce({ id: 'WS-BK-1', member_id: 'WS-MEM-1' }).mockResolvedValueOnce({ duplicate: false }).mockResolvedValueOnce({ id: 'WS-BK-1', status: 'cancelled' });
    const setting = { settingValue: 2 };
    const prisma = { withTenant: jest.fn(async (_tenant: string, callback: (tx: any) => unknown) => callback({ tenantSetting: { findUnique: async () => setting } })) };
    const recordInTransaction = jest.fn<(...args: any[]) => Promise<void>>();
    recordInTransaction.mockResolvedValue(undefined);
    const service = new BookingsService({ call } as any, { recordInTransaction } as any, prisma as any);
    await service.cancel(context, 'WS-BK-1', 'user-1');
    expect(call).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'wellness_studio.api.booking.cancel',
      body: { tenant: 'studio-a', booking: 'WS-BK-1', cancellation_window_hours: 2 },
    }));
  });

  it.each(['trainer', 'coach', 'lead_trainer'])('filters %s booking lists and lookups to assigned members', async (role) => {
    const assigned = [{ id: 'member-assigned' }];
    const findManyMembers = jest.fn(async () => assigned);
    const findManyBookings = jest.fn(async () => []);
    const findFirstBooking = jest.fn(async () => ({ id: 'booking-assigned', memberId: 'member-assigned' }));
    const prisma = {
      withTenant: jest.fn((_tenant: string, work: any) => work({
        studioMember: { findMany: findManyMembers },
        studioBooking: { findMany: findManyBookings, findFirst: findFirstBooking },
      })),
    };
    const service = new BookingsService({} as any, {} as any, prisma as any);
    const trainerContext = { ...context, actorId: 'trainer-user', roles: [role] };
    await service.list(trainerContext);
    expect(findManyBookings).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: context.tenantId, memberId: { in: ['member-assigned'] } },
    }));
    await service.get(trainerContext, 'booking-assigned');
    expect(findFirstBooking).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: context.tenantId, memberId: { in: ['member-assigned'] } }),
    }));
  });

  it('fails closed for trainer booking reads when the ERP store cannot scope assignments', async () => {
    const previousStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'erp';
    const call = jest.fn();
    const service = new BookingsService({ call } as any, {} as any, {} as any);
    try {
      await expect(service.list({ ...context, actorId: 'trainer-user', roles: ['coach'] })).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      await expect(service.get({ ...context, actorId: 'trainer-user', roles: ['lead_trainer'] }, 'booking-1')).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      expect(call).not.toHaveBeenCalled();
    } finally {
      if (previousStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = previousStore;
    }
  });

  it('rejects trainer booking writes for members outside their assignment list', async () => {
    const previousStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'postgres';
    const call = jest.fn();
    const findFirst = jest.fn(async () => null);
    const prisma = { withTenant: jest.fn((_tenant: string, work: any) => work({ studioMember: { findFirst } })) };
    const service = new BookingsService({ call } as any, {} as any, prisma as any);
    try {
      await expect(service.create(
        { ...context, actorId: 'trainer-user', roles: ['trainer'] },
        { member_id: 'member-unassigned', class_schedule_id: 'schedule-1', booking_date: '2026-10-24' },
        'trainer-user',
      )).rejects.toThrow(/not assigned to the trainer/i);
      expect(call).not.toHaveBeenCalled();
    } finally {
      if (previousStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = previousStore;
    }
  });
});
