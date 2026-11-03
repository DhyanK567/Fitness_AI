import { jest } from '@jest/globals';
import { AttendanceService } from './attendance.service';

describe('AttendanceService trainer assignment boundaries', () => {
  const context = { tenantId: 'tenant-1', tenantCode: 'studio-a', correlationId: 'attendance-test' };

  it.each(['trainer', 'coach', 'lead_trainer'])('limits %s attendance lists to assigned member bookings', async (role) => {
    const findManyMembers = jest.fn(async () => [{ id: 'member-assigned' }]);
    const findManyBookings = jest.fn(async () => [{ id: 'booking-assigned' }]);
    const findManyAttendance = jest.fn(async () => []);
    const prisma = {
      withTenant: jest.fn((_tenant: string, work: any) => work({
        studioMember: { findMany: findManyMembers },
        studioBooking: { findMany: findManyBookings },
        studioAttendance: { findMany: findManyAttendance },
      })),
    };
    const service = new AttendanceService({} as any, {} as any, prisma as any);
    const previousStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'postgres';
    try {
      await service.list({ ...context, actorId: 'trainer-user', roles: [role] });
      expect(findManyBookings).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: context.tenantId, memberId: { in: ['member-assigned'] } },
      }));
      expect(findManyAttendance).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: context.tenantId, bookingId: { in: ['booking-assigned'] } },
      }));
    } finally {
      if (previousStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = previousStore;
    }
  });

  it('fails closed for trainer attendance reads when ERP cannot enforce assignments', async () => {
    const previousStore = process.env.IMPORT_STORE;
    process.env.IMPORT_STORE = 'erp';
    const call = jest.fn();
    const service = new AttendanceService({ call } as any, {} as any, {} as any);
    try {
      await expect(service.list({ ...context, actorId: 'trainer-user', roles: ['coach'] })).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      await expect(service.listForClass({ ...context, actorId: 'trainer-user', roles: ['lead_trainer'] }, 'class-1')).rejects.toThrow(/assignment-aware PostgreSQL store/i);
      expect(call).not.toHaveBeenCalled();
    } finally {
      if (previousStore === undefined) delete process.env.IMPORT_STORE;
      else process.env.IMPORT_STORE = previousStore;
    }
  });
});
