import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SessionSummaryService } from './session-summary.service';
import type { ToolContext } from '../tools/base-tool';
import { PrismaService } from '../../common/prisma.service';

const mockTx = {
  studioClass: {
    findFirst: jest.fn<any>(),
  },
  studioBooking: {
    findMany: jest.fn<any>(),
  },
  studioAttendance: {
    findMany: jest.fn<any>(),
  },
  studioMember: {
    findMany: jest.fn<any>(),
  },
};

const mockPrismaService: any = {
  withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: (prisma: any) => Promise<any>) => fn(mockTx)),
};

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  tenantCode: 'TEST',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('SessionSummaryService', () => {
  let service: SessionSummaryService;

  beforeEach(() => {
    service = new SessionSummaryService(mockPrismaService);
    jest.clearAllMocks();
  });

  describe('getSessionDebrief', () => {
    it('should generate debrief with attendance data', async () => {
      const mockSession = {
        id: 'session-1',
        name: 'Vinyasa Flow',
        date: new Date('2024-01-15T10:00:00Z'),
        startTime: '10:00',
        trainer: 'Elena Rostova',
        capacity: 20,
      };

      const mockBookings = [
        { id: 'b1', classId: 'session-1', memberId: 'm1', status: 'CheckedIn', createdAt: new Date() },
        { id: 'b2', classId: 'session-1', memberId: 'm2', status: 'CheckedIn', createdAt: new Date() },
        { id: 'b3', classId: 'session-1', memberId: 'm3', status: 'Confirmed', createdAt: new Date() },
        { id: 'b4', classId: 'session-1', memberId: 'm4', status: 'NoShow', createdAt: new Date() },
        { id: 'b5', classId: 'session-1', memberId: 'm5', status: 'Waitlisted', createdAt: new Date() },
      ];

      const mockAttendances = [
        { bookingId: 'b1', status: 'Present', checkedInAt: new Date('2024-01-15T09:55:00Z') },
        { bookingId: 'b2', status: 'Present', checkedInAt: new Date('2024-01-15T09:50:00Z') },
      ];

      const mockMembers = [
        { id: 'm1', fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+919876543210', plan: 'Premium', status: 'Active' },
        { id: 'm2', fullName: 'Bob Smith', email: 'bob@example.com', phone: '+919876543211', plan: 'Standard', status: 'Active' },
        { id: 'm3', fullName: 'Carol White', email: 'carol@example.com', phone: '+919876543212', plan: 'Premium', status: 'Active' },
        { id: 'm4', fullName: 'David Brown', email: 'david@example.com', phone: '+919876543213', plan: 'Basic', status: 'Active' },
        { id: 'm5', fullName: 'Eve Wilson', email: 'eve@example.com', phone: '+919876543214', plan: 'Premium', status: 'Active' },
      ];

      mockTx.studioClass.findFirst.mockResolvedValue(mockSession);
      mockTx.studioBooking.findMany.mockResolvedValue(mockBookings);
      mockTx.studioAttendance.findMany.mockResolvedValue(mockAttendances);
      mockTx.studioMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getSessionDebrief(
        createMockContext(),
        { sessionId: 'session-1', includeMemberDetails: true },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.sessionId).toBe('session-1');
      expect(result.data.className).toBe('Vinyasa Flow');
      expect(result.data.totalBooked).toBe(5);
      expect(result.data.checkedIn).toBe(2);
      expect(result.data.noShows).toBe(1);
      expect(result.data.waitlistCount).toBe(1);
      expect(result.data.occupancyPercent).toBe(10); // 2/20 * 100
      expect(result.data.followUpActions).toContain('Follow up with 1 no-show member(s) via friendly SMS/email');
      expect(result.data.followUpActions).toContain('Notify 1 waitlisted member(s) about future availability');
      expect(result.data.memberDetails).toHaveLength(5);
      expect(result.data.memberDetails![0].checkInTime).toBe('2024-01-15T09:55:00.000Z');
    });

    it('should handle session with no bookings', async () => {
      const mockSession = {
        id: 'session-2',
        name: 'Empty Class',
        date: new Date('2024-01-20T10:00:00Z'),
        startTime: '10:00',
        trainer: 'John Doe',
        capacity: 15,
      };

      mockTx.studioClass.findFirst.mockResolvedValue(mockSession);
      mockTx.studioBooking.findMany.mockResolvedValue([]);
      mockTx.studioAttendance.findMany.mockResolvedValue([]);
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const result = await service.getSessionDebrief(
        createMockContext(),
        { sessionId: 'session-2', includeMemberDetails: true },
      );

      expect(result.success).toBe(true);
      expect(result.data.totalBooked).toBe(0);
      expect(result.data.checkedIn).toBe(0);
      expect(result.data.memberDetails).toEqual([]);
    });

    it('should return error when session not found', async () => {
      mockTx.studioClass.findFirst.mockResolvedValue(null);

      const result = await service.getSessionDebrief(
        createMockContext(),
        { sessionId: 'non-existent' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session debrief unavailable');
    });
  });

  describe('getTrainerNotes', () => {
    it('should return session info with null notes (no notes field in schema)', async () => {
      const mockSession = {
        id: 'session-1',
        name: 'Vinyasa Flow',
        date: new Date('2024-01-15T10:00:00Z'),
        startTime: '10:00',
        trainer: 'Elena Rostova',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-10'),
      };

      mockTx.studioClass.findFirst.mockResolvedValue(mockSession);

      const result = await service.getTrainerNotes(
        createMockContext(),
        { sessionId: 'session-1' },
      );

      expect(result.success).toBe(true);
      expect(result.data.sessionId).toBe('session-1');
      expect(result.data.trainerName).toBe('Elena Rostova');
      expect(result.data.notes).toBeNull();
      expect(result.data.equipmentUsed).toEqual([]);
      expect(result.data.modifications).toEqual([]);
      expect(result.data.observations).toEqual([]);
    });
  });

  describe('getMemberMilestones', () => {
    it('should identify members hitting milestones in period', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

      // When no sessionId, it queries all attendances in period
      const mockAttendances = [
        // Alice: 10 sessions in period (10th milestone)
        ...Array(10).fill(null).map((_, i) => ({
          bookingId: `b1-${i}`,
          status: 'Present',
          checkedInAt: new Date(thirtyDaysAgo.getTime() + i * 2 * 86400000),
        })),
        // Bob: 5 sessions (no milestone)
        ...Array(5).fill(null).map((_, i) => ({
          bookingId: `b2-${i}`,
          status: 'Present',
          checkedInAt: new Date(thirtyDaysAgo.getTime() + i * 5 * 86400000),
        })),
        // Carol: 25 sessions (25th milestone)
        ...Array(25).fill(null).map((_, i) => ({
          bookingId: `b3-${i}`,
          status: 'Present',
          checkedInAt: new Date(thirtyDaysAgo.getTime() + i * 1 * 86400000),
        })),
      ];

      const mockBookingIds = mockAttendances.map(a => a.bookingId);
      // Map bookingIds to correct memberIds: b1-* -> m1, b2-* -> m2, b3-* -> m3
      const mockBookings = mockBookingIds.map(id => {
        const prefix = id.split('-')[0]; // b1, b2, or b3
        const memberNum = prefix === 'b1' ? '1' : prefix === 'b2' ? '2' : '3';
        return { id, memberId: `m${memberNum}` };
      });

      const mockMembers = [
        { id: 'm1', fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+919876543210', plan: 'Premium', joined: new Date('2023-01-01') },
        { id: 'm2', fullName: 'Bob Smith', email: 'bob@example.com', phone: '+919876543211', plan: 'Standard', joined: new Date('2023-06-01') },
        { id: 'm3', fullName: 'Carol White', email: 'carol@example.com', phone: '+919876543212', plan: 'Premium', joined: new Date('2022-01-01') },
      ];

      mockTx.studioAttendance.findMany.mockResolvedValue(mockAttendances);
      mockTx.studioBooking.findMany.mockResolvedValue(mockBookings);
      mockTx.studioMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMemberMilestones(
        createMockContext(),
        { periodDays: 30, milestoneIntervals: [10, 25, 50] },
      );

      expect(result.success).toBe(true);
      expect(result.data.milestones).toHaveLength(2);
      expect(result.data.milestones[0].memberName).toBe('Carol White');
      expect(result.data.milestones[0].milestone).toBe(25);
      expect(result.data.milestones[1].memberName).toBe('Alice Johnson');
      expect(result.data.milestones[1].milestone).toBe(10);
    });

    it('should filter by specific session when sessionId provided', async () => {
      const mockAttendances = [
        { bookingId: 'b1', status: 'Present', checkedInAt: new Date() },
      ];

      const mockBookings = [{ id: 'b1', memberId: 'm1' }];
      const mockMembers = [{ id: 'm1', fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+919876543210', plan: 'Premium', joined: new Date('2023-01-01') }];

      mockTx.studioBooking.findMany.mockResolvedValue(mockBookings);
      mockTx.studioAttendance.findMany.mockResolvedValue(mockAttendances);
      mockTx.studioMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMemberMilestones(
        createMockContext(),
        { sessionId: 'session-1', periodDays: 30, milestoneIntervals: [10] },
      );

      expect(result.success).toBe(true);
      // Verify it filtered by sessionId - the booking query should have classId filter
      expect(mockTx.studioBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ classId: 'session-1' }),
        }),
      );
    });

    it('should return empty when no attendances', async () => {
      mockTx.studioAttendance.findMany.mockResolvedValue([]);

      const result = await service.getMemberMilestones(
        createMockContext(),
        { periodDays: 30, milestoneIntervals: [10, 25] },
      );

      expect(result.success).toBe(true);
      expect(result.data.milestones).toHaveLength(0);
      expect(result.data.totalMembersWithMilestones).toBe(0);
    });
  });
});