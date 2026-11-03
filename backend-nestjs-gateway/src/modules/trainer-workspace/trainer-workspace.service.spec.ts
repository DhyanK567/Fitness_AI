import { TrainerWorkspaceService } from './trainer-workspace.service';

describe('TrainerWorkspaceService', () => {
  it('builds the overview exclusively from the authenticated trainer identity', async () => {
    const trainerUserId = '11111111-1111-4111-8111-111111111111';
    const tenantId = '22222222-2222-4222-8222-222222222222';
    const studioMember = {
      findMany: jest.fn().mockResolvedValue([{ id: 'member-1', fullName: 'Assigned Member' }]),
    };
    const studioClass = {
      findMany: jest.fn().mockResolvedValue([{ id: 'class-1', trainer: 'Real Trainer' }]),
    };
    const studioBooking = {
      findMany: jest.fn().mockResolvedValue([{ id: 'booking-1', memberId: 'member-1', classId: 'class-1' }]),
    };
    const studioAttendance = {
      findMany: jest.fn().mockResolvedValue([{ id: 'attendance-1', bookingId: 'booking-1' }]),
    };
    const tx = {
      user: { findFirst: jest.fn().mockResolvedValue({ id: trainerUserId, displayName: 'Real Trainer', email: 'trainer@example.test' }) },
      tenant: { findFirst: jest.fn().mockResolvedValue({ id: tenantId, code: 'studio', displayName: 'Real Studio', timezone: 'Asia/Kolkata', currency: 'INR', tierId: 'tier-1' }) },
      subscriptionTier: { findUnique: jest.fn().mockResolvedValue({ code: 'growth', displayName: 'Premium' }) },
      studioMember,
      studioClass,
      studioBooking,
      studioAttendance,
      trainerWorkoutPlan: { findMany: jest.fn().mockResolvedValue([]) },
      trainerProgressNote: { findMany: jest.fn().mockResolvedValue([]) },
      studioSessionFeedback: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = { withTenant: jest.fn((_tenantId: string, callback: (client: any) => unknown) => callback(tx)) };
    const service = new TrainerWorkspaceService(prisma as any);

    const result = await service.overview(tenantId, trainerUserId);

    expect(result.trainer.displayName).toBe('Real Trainer');
    expect(result.studio.name).toBe('Real Studio');
    expect(result.members).toHaveLength(1);
    expect(studioMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        OR: expect.arrayContaining([
          expect.objectContaining({ trainerUserId }),
          expect.objectContaining({ id: { in: ['member-1'] } }),
        ]),
      }),
    }));
    expect(studioClass.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        OR: expect.arrayContaining([
          { trainer: { equals: 'Real Trainer', mode: 'insensitive' } },
          { trainer: { contains: 'Real Trainer', mode: 'insensitive' } },
        ]),
      }),
    }));
    expect(studioBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId }),
    }));
    expect(studioAttendance.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, bookingId: { in: ['booking-1'] } },
    }));
  });
});
