import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ClassCancellationImpactService } from './class-cancellation-impact.service';
import type { ErpnextService } from '../../erpnext/erpnext.service';
import type { ToolContext } from '../tools/base-tool';

const mockTx = {
  studioClass: {
    findFirst: jest.fn<any>(),
  },
  studioBooking: {
    findMany: jest.fn<any>(),
  },
  studioMember: {
    findMany: jest.fn<any>(),
  },
};

const mockPrismaService: any = {
  withTenant: jest.fn<any>().mockImplementation(async (tenantId: string, fn: (prisma: any) => Promise<any>) => fn(mockTx)),
};

const mockErpService = {
  call: jest.fn(),
} as any;

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  tenantCode: 'TEST',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('ClassCancellationImpactService', () => {
  let service: ClassCancellationImpactService;

  beforeEach(() => {
    service = new ClassCancellationImpactService(mockPrismaService, mockErpService);
    jest.clearAllMocks();
  });

  describe('PostgreSQL path', () => {
    it('should analyze impact of cancelling a class with bookings', async () => {
      const mockSession = {
        id: 'session-1',
        name: 'Vinyasa Flow',
        date: new Date('2024-01-15T10:00:00Z'),
        startTime: '10:00',
        trainer: 'Elena Rostova',
        capacity: 20,
        status: 'Scheduled',
        updatedAt: new Date(),
      };

      const mockBookings = [
        { id: 'b1', classId: 'session-1', memberId: 'm1', status: 'Confirmed', bookedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
        { id: 'b2', classId: 'session-1', memberId: 'm2', status: 'Confirmed', bookedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
        { id: 'b3', classId: 'session-1', memberId: 'm3', status: 'Waitlisted', bookedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
        { id: 'b4', classId: 'session-1', memberId: 'm4', status: 'Cancelled', bookedAt: new Date(), createdAt: new Date(), updatedAt: new Date() },
      ];

      const mockMembers = [
        { id: 'm1', fullName: 'Alice Johnson', email: 'alice@example.com', phone: '+919876543210', plan: 'Premium', status: 'Active' },
        { id: 'm2', fullName: 'Bob Smith', email: 'bob@example.com', phone: '+919876543211', plan: 'Standard', status: 'Active' },
        { id: 'm3', fullName: 'Carol White', email: 'carol@example.com', phone: '+919876543212', plan: 'Premium', status: 'Active' },
        { id: 'm4', fullName: 'David Brown', email: 'david@example.com', phone: '+919876543213', plan: 'Basic', status: 'Active' },
      ];

      mockTx.studioClass.findFirst.mockResolvedValue(mockSession);
      mockTx.studioBooking.findMany.mockResolvedValue(mockBookings);
      mockTx.studioMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getClassCancellationImpact(
        createMockContext(),
        { sessionId: 'session-1' },
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.sessionId).toBe('session-1');
      expect(result.data.className).toBe('Vinyasa Flow');
      expect(result.data.capacity).toBe(20);
      expect(result.data.bookedCount).toBe(4);
      expect(result.data.confirmedBookings).toBe(2);
      expect(result.data.waitlistedBookings).toBe(1);
      expect(result.data.cancelledBookings).toBe(1);
      expect(result.data.waitlistCount).toBe(1);
      expect(result.data.waitlistPromotions).toBe(1);
      expect(result.data.affectedMembers).toHaveLength(4);
      expect(result.data.estimatedRevenueLoss).toBe(1000); // 2 confirmed * 500
      expect(result.data.recommendedActions).toContain('Promote 1 waitlisted member(s) to fill vacated spots');
      expect(result.data.recommendedActions).toContain('Process refunds/credits for 1 previously cancelled booking(s)');
    });

    it('should handle session with no bookings', async () => {
      const mockSession = {
        id: 'session-2',
        name: 'Empty Class',
        date: new Date('2024-01-20T10:00:00Z'),
        startTime: '10:00',
        trainer: 'John Doe',
        capacity: 15,
        status: 'Scheduled',
        updatedAt: new Date(),
      };

      mockTx.studioClass.findFirst.mockResolvedValue(mockSession);
      mockTx.studioBooking.findMany.mockResolvedValue([]);
      mockTx.studioMember.findMany.mockResolvedValue([]);

      const result = await service.getClassCancellationImpact(
        createMockContext(),
        { sessionId: 'session-2' },
      );

      expect(result.success).toBe(true);
      expect(result.data.bookedCount).toBe(0);
      expect(result.data.confirmedBookings).toBe(0);
      expect(result.data.affectedMembers).toHaveLength(0);
      expect(result.data.recommendedActions).toContain('No bookings found for this session');
    });

    it('should return error when session not found', async () => {
      mockTx.studioClass.findFirst.mockResolvedValue(null);

      const result = await service.getClassCancellationImpact(
        createMockContext(),
        { sessionId: 'non-existent' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('ERPNext fallback', () => {
    it('should fall back to ERPNext when PostgreSQL fails', async () => {
      mockTx.studioClass.findFirst.mockRejectedValue(new Error('DB connection failed'));
      mockErpService.call.mockResolvedValue({ impact: 'ERP result' });

      const result = await service.getClassCancellationImpact(
        createMockContext(),
        { sessionId: 'session-1' },
      );

      // Currently ERPNext integration not implemented, returns specific error
      expect(result.success).toBe(false);
      expect(result.error).toBe('ERPNext cancellation impact not implemented');
    });
  });

  describe('Tenant isolation', () => {
    it('should pass tenantId to withTenant', async () => {
      mockTx.studioClass.findFirst.mockResolvedValue(null);

      await service.getClassCancellationImpact(
        createMockContext({ tenantId: 'tenant-B' }),
        { sessionId: 'session-1' },
      );

      expect(mockPrismaService.withTenant).toHaveBeenCalledWith('tenant-B', expect.any(Function));
    });
  });

  describe('Input validation', () => {
    it('should reject missing tenantId', async () => {
      const result = await service.getClassCancellationImpact(
        { ...createMockContext(), tenantId: '' },
        { sessionId: 'session-1' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tenant context required');
    });

    it('should reject missing sessionId', async () => {
      const result = await service.getClassCancellationImpact(
        createMockContext(),
        { sessionId: '' },
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('sessionId is required');
    });
  });
});