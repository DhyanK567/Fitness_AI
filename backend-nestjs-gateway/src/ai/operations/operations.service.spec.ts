import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OperationsService } from './operations.service';
import { StaffSchedulingService } from './staff-scheduling.service';
import { EquipmentService } from './equipment.service';
import { FacilityService } from './facility.service';
import { WaitlistService } from './waitlist.service';
import { ScheduleOptimizationService } from './schedule-optimization.service';
import type { ErpnextService } from '../../erpnext/erpnext.service';
import type { ToolContext } from '../tools/base-tool';

const mockErpService = {
  call: jest.fn(),
} as any;

const createMockContext = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  tenantId: 'tenant-1',
  userId: 'admin-1',
  role: 'admin',
  correlationId: 'corr-1',
  ...overrides,
});

describe('Operations Agent - Unit Tests', () => {
  let operationsService: OperationsService;
  let staffSchedulingService: StaffSchedulingService;
  let equipmentService: EquipmentService;
  let facilityService: FacilityService;
  let waitlistService: WaitlistService;
  let scheduleOptimizationService: ScheduleOptimizationService;

  beforeEach(() => {
    operationsService = new OperationsService(undefined, mockErpService);
    staffSchedulingService = new StaffSchedulingService(mockErpService);
    equipmentService = new EquipmentService(mockErpService);
    facilityService = new FacilityService(mockErpService);
    waitlistService = new WaitlistService(mockErpService);
    scheduleOptimizationService = new ScheduleOptimizationService(mockErpService);

    jest.clearAllMocks();
  });

  describe('OperationsService', () => {
    it('should get class capacity utilization', async () => {
      const mockResult = {
        sessions: [
          {
            session_id: 'sess-1',
            class_type_id: 'ct-1',
            class_type_name: 'Yoga',
            session_date: '2024-01-15',
            start_time: '09:00:00',
            end_time: '10:00:00',
            capacity: 20,
            booked: 15,
            waitlisted: 2,
            utilization_percent: 75,
            waitlist_percent: 10,
            available_slots: 5,
            branch_id: 'branch-1',
          },
        ],
        summary: {
          total_sessions: 1,
          total_capacity: 20,
          total_booked: 15,
          total_waitlisted: 2,
          avg_utilization_percent: 75,
          period: { start: '2024-01-01', end: '2024-01-31' },
        },
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await operationsService.getClassCapacityUtilization(
        createMockContext(),
        { startDate: '2024-01-01', endDate: '2024-01-31' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any)).toEqual(mockResult);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: expect.stringContaining('class_capacity_utilization'),
        }),
      );
    });

    it('should get operational alerts', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          tenant_id: 'tenant-1',
          alert_type: 'capacity',
          severity: 'warning',
          title: 'Low capacity in Yoga class',
          message: 'Yoga class on 2024-01-15 has only 2 slots left',
          is_acknowledged: false,
        },
      ];

      mockErpService.call.mockResolvedValueOnce({ alerts: mockAlerts, count: 1 });

      const result = await operationsService.getOperationalAlerts(
        createMockContext(),
        { severity: 'warning', limit: 10 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).alerts).toHaveLength(1);
    });

    it('should acknowledge operational alert', async () => {
      const mockResult = { id: 'alert-1', is_acknowledged: true, acknowledged_by: 'admin-1' };
      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await operationsService.acknowledgeOperationalAlert(
        createMockContext(),
        { alertId: 'alert-1', action: 'acknowledge', resolutionNotes: 'Notified staff' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any)).toEqual(mockResult);
    });

    it('should get class cancellation impact', async () => {
      const mockResult = {
        session_id: 'sess-1',
        affected_members: 10,
        revenue_at_risk: 5000,
        waitlist_can_promote: 3,
        recommendation: 'notify_and_reschedule',
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await operationsService.getClassCancellationImpact(
        createMockContext(),
        { sessionId: 'sess-1' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).recommendation).toBe('notify_and_reschedule');
    });

    it('should optimize class schedule', async () => {
      const mockResult = {
        period_days: 30,
        optimization_goal: 'maximize_utilization',
        recommendations: [
          {
            type: 'add_session',
            class_type_id: 'ct-1',
            time_slot: '18:00',
            branch_id: 'branch-1',
            current_sessions: 5,
            avg_utilization: 95,
            reason: 'High utilization - consider adding more sessions',
          },
        ],
        total_sessions_analyzed: 100,
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await operationsService.optimizeClassSchedule(
        createMockContext(),
        { branchId: 'branch-1', periodDays: 30, optimizationGoal: 'maximize_utilization' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).recommendations).toHaveLength(1);
      expect((result.data as any).recommendations[0].type).toBe('add_session');
    });
  });

  describe('StaffSchedulingService', () => {
    it('should get staff schedule', async () => {
      const mockResult = {
        schedules: [
          {
            id: 'ss-1',
            staff_id: 'staff-1',
            branch_id: 'branch-1',
            schedule_type: 'class',
            start_date: '2024-01-01',
            end_date: '2024-01-31',
            days_of_week: [1, 3, 5],
            start_time: '09:00',
            end_time: '11:00',
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await staffSchedulingService.getStaffSchedule(
        createMockContext(),
        { staffId: 'staff-1', startDate: '2024-01-01', endDate: '2024-01-31' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).schedules).toHaveLength(1);
    });

    it('should create staff schedule', async () => {
      const mockResult = { id: 'ss-new', staff_id: 'staff-1' };
      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await staffSchedulingService.createStaffSchedule(
        createMockContext(),
        {
          staffId: 'staff-1',
          scheduleType: 'class',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          daysOfWeek: [1, 3, 5],
          startTime: '09:00',
          endTime: '11:00',
          classTypeId: 'ct-1',
          branchId: 'branch-1',
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).id).toBe('ss-new');
    });
  });

  describe('EquipmentService', () => {
    it('should get equipment status', async () => {
      const mockResult = {
        equipment: [
          {
            id: 'eq-1',
            name: 'Treadmill 1',
            equipment_type: 'Cardio',
            status: 'available',
            branch_id: 'branch-1',
          },
          {
            id: 'eq-2',
            name: 'Weight Rack',
            equipment_type: 'Strength',
            status: 'maintenance',
            branch_id: 'branch-1',
          },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await equipmentService.getEquipmentStatus(
        createMockContext(),
        { branchId: 'branch-1' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).equipment).toHaveLength(2);
    });

    it('should schedule equipment maintenance', async () => {
      const mockResult = { id: 'em-1', equipment_id: 'eq-1', status: 'scheduled' };
      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await equipmentService.scheduleEquipmentMaintenance(
        createMockContext(),
        {
          equipmentId: 'eq-1',
          maintenanceType: 'routine',
          scheduledAt: '2024-01-20T10:00:00Z',
          estimatedDurationMinutes: 60,
          notes: 'Monthly maintenance',
        },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).status).toBe('scheduled');
    });
  });

  describe('FacilityService', () => {
    it('should get facility utilization', async () => {
      const mockResult = {
        utilization: [
          {
            room_id: 'room-1',
            room_name: 'Studio A',
            room_type: 'studio',
            capacity: 30,
            bookings_count: 5,
            bookings: [],
          },
        ],
        period: { start: '2024-01-01', end: '2024-01-31' },
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await facilityService.getFacilityUtilization(
        createMockContext(),
        { branchId: 'branch-1', startDate: '2024-01-01', endDate: '2024-01-31' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).utilization).toHaveLength(1);
    });
  });

  describe('WaitlistService', () => {
    it('should manage waitlist - view', async () => {
      const mockResult = {
        waitlist: [
          { id: 'wl-1', member_id: 'm-1', member_name: 'John', position: 1 },
          { id: 'wl-2', member_id: 'm-2', member_name: 'Jane', position: 2 },
        ],
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await waitlistService.manageWaitlist(
        createMockContext(),
        { action: 'view', sessionId: 'sess-1' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).waitlist).toHaveLength(2);
    });

    it('should manage waitlist - notify', async () => {
      const mockResult = { notified: 2, entries: [{ id: 'wl-1' }, { id: 'wl-2' }] };
      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await waitlistService.manageWaitlist(
        createMockContext(),
        { action: 'notify', sessionId: 'sess-1', notifyCount: 2 },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).notified).toBe(2);
    });
  });

  describe('ScheduleOptimizationService', () => {
    it('should optimize class schedule', async () => {
      const mockResult = {
        period_days: 30,
        optimization_goal: 'maximize_utilization',
        recommendations: [
          {
            type: 'reduce_frequency',
            class_type_id: 'ct-1',
            time_slot: '14:00',
            branch_id: 'branch-1',
            avg_utilization: 25,
            reason: 'Low utilization - consider reducing frequency',
          },
        ],
        total_sessions_analyzed: 50,
      };

      mockErpService.call.mockResolvedValueOnce(mockResult);

      const result = await scheduleOptimizationService.optimizeClassSchedule(
        createMockContext(),
        { branchId: 'branch-1', periodDays: 30, optimizationGoal: 'maximize_utilization' },
      );

      expect(result.success).toBe(true);
      expect((result.data as any).recommendations[0].type).toBe('reduce_frequency');
    });
  });
});