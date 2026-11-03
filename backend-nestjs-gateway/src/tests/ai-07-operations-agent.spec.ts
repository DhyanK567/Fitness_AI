import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationsService } from '../ai/operations/operations.service';
import { EquipmentService } from '../ai/operations/equipment.service';
import {
  GetClassCapacityUtilizationTool,
  GetEquipmentStatusTool,
  ScheduleEquipmentMaintenanceTool,
  GetOperationalAlertsTool,
  AcknowledgeOperationalAlertTool,
  GetClassCancellationImpactTool,
  OptimizeClassScheduleTool,
} from '../ai/tools/operations-tools';
import { ToolRegistry } from '../ai/tools/tool-registry';
import { AgentRegistryService } from '../ai/agents/agent-registry.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { can } from '../common/policy';
import { canUseTool } from '../ai/guardrails/scope-rules';
import { ERP_METHODS } from '@wsos/erp-methods';

describe('AI-07: Studio Operations Agent (operations-agent) Specification Suite', () => {
  const TENANT_A = '11111111-1111-4000-8000-000000000001';
  const TENANT_B = '22222222-2222-4000-8000-000000000002';
  const BRANCH_A_ID = '33333333-3333-4000-8000-000000000001';
  const USER_ADMIN_ID = '44444444-4444-4000-8000-000000000001';
  const USER_TRAINER_ID = '44444444-4444-4000-8000-000000000002';

  const CLASS_A1_ID = '55555555-5555-4000-8000-000000000001';
  const CLASS_A2_ID = '55555555-5555-4000-8000-000000000002';
  const CLASS_A3_ID = '55555555-5555-4000-8000-000000000003';
  const CLASS_B1_ID = '55555555-5555-4000-8000-000000000004';

  const EQUIPMENT_A1_ID = '66666666-6666-4000-8000-000000000001';
  const EQUIPMENT_A2_ID = '66666666-6666-4000-8000-000000000002';
  const EQUIPMENT_B1_ID = '66666666-6666-4000-8000-000000000003';

  const ALERT_A1_ID = '77777777-7777-4000-8000-000000000001';
  const ALERT_A2_ID = '77777777-7777-4000-8000-000000000002';
  const ALERT_B1_ID = '77777777-7777-4000-8000-000000000003';

  let inMemoryClasses: Map<string, any>;
  let inMemoryBookings: Map<string, any>;
  let inMemoryEquipment: Map<string, any>;
  let inMemoryMaintenance: Map<string, any>;
  let inMemoryAlerts: Map<string, any>;
  let inMemoryAuditLogs: any[];
  let inMemoryOutboxEvents: any[];

  let mockTx: any;
  let mockPrisma: any;
  let mockLlmGateway: any;
  let mockOrchestrator: any;
  let auditOutbox: AuditOutboxService;
  let operationsService: OperationsService;
  let equipmentService: EquipmentService;
  let toolRegistry: ToolRegistry;
  let agentRegistry: AgentRegistryService;

  beforeEach(() => {
    // 1. Classes
    inMemoryClasses = new Map([
      [
        CLASS_A1_ID,
        {
          id: CLASS_A1_ID,
          tenantId: TENANT_A,
          name: 'Morning Reformer Pilates',
          category: 'Pilates',
          date: new Date('2026-10-20T07:00:00Z'),
          startTime: '07:00',
          capacity: 10,
          trainer: 'Elena Rostova',
          room: 'Studio A',
          status: 'Scheduled',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        CLASS_A2_ID,
        {
          id: CLASS_A2_ID,
          tenantId: TENANT_A,
          name: 'Power Vinyasa Yoga',
          category: 'Yoga',
          date: new Date('2026-10-20T08:30:00Z'),
          startTime: '08:30',
          capacity: 15,
          trainer: 'Liam Vance',
          room: 'Studio B',
          status: 'Scheduled',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        CLASS_A3_ID,
        {
          id: CLASS_A3_ID,
          tenantId: TENANT_A,
          name: 'Midday Meditation',
          category: 'Mindfulness',
          date: new Date('2026-10-20T13:00:00Z'),
          startTime: '13:00',
          capacity: 20,
          trainer: 'Maya Patel',
          room: 'Zen Den',
          status: 'Scheduled',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      [
        CLASS_B1_ID,
        {
          id: CLASS_B1_ID,
          tenantId: TENANT_B,
          name: 'CrossFit WOD',
          category: 'CrossFit',
          date: new Date('2026-10-20T07:00:00Z'),
          startTime: '07:00',
          capacity: 20,
          trainer: 'Marcus Steele',
          room: 'Box B',
          status: 'Scheduled',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    // 2. Bookings
    inMemoryBookings = new Map();
    // 9 bookings for CLASS_A1 (90% occupancy)
    for (let i = 1; i <= 9; i++) {
      const id = `b-a1-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_A,
        classId: CLASS_A1_ID,
        memberId: `member-${i}`,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-18T10:00:00Z'),
      });
    }
    // 6 bookings for CLASS_A2 (40% occupancy)
    for (let i = 1; i <= 6; i++) {
      const id = `b-a2-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_A,
        classId: CLASS_A2_ID,
        memberId: `member-${i}`,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-18T11:00:00Z'),
      });
    }
    // 2 bookings for CLASS_A3 (10% occupancy - low occupancy alert)
    for (let i = 1; i <= 2; i++) {
      const id = `b-a3-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_A,
        classId: CLASS_A3_ID,
        memberId: `member-${i}`,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-18T12:00:00Z'),
      });
    }
    // 15 bookings for Tenant B's CLASS_B1
    for (let i = 1; i <= 15; i++) {
      const id = `b-b1-${i}`;
      inMemoryBookings.set(id, {
        id,
        tenantId: TENANT_B,
        classId: CLASS_B1_ID,
        memberId: `member-b-${i}`,
        status: 'Confirmed',
        bookedAt: new Date('2026-10-18T10:00:00Z'),
      });
    }

    // 3. Equipment
    inMemoryEquipment = new Map([
      [
        EQUIPMENT_A1_ID,
        {
          id: EQUIPMENT_A1_ID,
          tenantId: TENANT_A,
          branchId: BRANCH_A_ID,
          name: 'Peak Pilates Reformer #3',
          equipmentType: 'Pilates Reformer',
          brand: 'Peak Pilates',
          model: 'MVE-500',
          serialNumber: 'PP-2024-003',
          status: 'available',
          location: 'Bay 3',
          lastMaintenanceAt: new Date('2026-09-01T00:00:00Z'),
          nextMaintenanceAt: new Date('2026-11-01T00:00:00Z'),
          notes: 'Springs calibrated quarterly.',
          metadata: {},
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-09-01T00:00:00Z'),
        },
      ],
      [
        EQUIPMENT_A2_ID,
        {
          id: EQUIPMENT_A2_ID,
          tenantId: TENANT_A,
          branchId: BRANCH_A_ID,
          name: 'Technogym Treadmill Commercial #1',
          equipmentType: 'Cardio Treadmill',
          brand: 'Technogym',
          model: 'Skillrun 7000',
          serialNumber: 'TG-2023-882',
          status: 'maintenance',
          location: 'Cardio Deck',
          lastMaintenanceAt: new Date('2026-08-15T00:00:00Z'),
          nextMaintenanceAt: new Date('2026-10-22T00:00:00Z'),
          notes: 'Belt alignment sensor error reported.',
          metadata: {},
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-10-22T00:00:00Z'),
        },
      ],
      [
        EQUIPMENT_B1_ID,
        {
          id: EQUIPMENT_B1_ID,
          tenantId: TENANT_B,
          branchId: BRANCH_A_ID,
          name: 'Rogue Echo Bike #1',
          equipmentType: 'Air Bike',
          brand: 'Rogue Fitness',
          model: 'Echo V3',
          serialNumber: 'RF-991',
          status: 'available',
          location: 'Main Gym Floor',
          lastMaintenanceAt: new Date('2026-07-01T00:00:00Z'),
          nextMaintenanceAt: new Date('2026-12-01T00:00:00Z'),
          notes: 'Tenant B equipment',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    // 4. Maintenance Records
    inMemoryMaintenance = new Map();

    // 5. Operational Alerts
    inMemoryAlerts = new Map([
      [
        ALERT_A1_ID,
        {
          id: ALERT_A1_ID,
          tenantId: TENANT_A,
          alertType: 'equipment',
          severity: 'warning',
          title: 'Equipment Maintenance Due',
          message: 'Treadmill Commercial #1 belt sensor service required.',
          sourceEntityId: EQUIPMENT_A2_ID,
          sourceEntityType: 'equipment',
          isAcknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolutionNotes: null,
          metadata: {},
          createdAt: new Date('2026-10-21T08:00:00Z'),
          updatedAt: new Date('2026-10-21T08:00:00Z'),
        },
      ],
      [
        ALERT_A2_ID,
        {
          id: ALERT_A2_ID,
          tenantId: TENANT_A,
          alertType: 'capacity',
          severity: 'critical',
          title: 'Morning Class Waitlist Overflow',
          message: 'Reformer Pilates waitlist reached 6 members.',
          sourceEntityId: CLASS_A1_ID,
          sourceEntityType: 'studio_class',
          isAcknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolutionNotes: null,
          metadata: {},
          createdAt: new Date('2026-10-22T09:30:00Z'),
          updatedAt: new Date('2026-10-22T09:30:00Z'),
        },
      ],
      [
        ALERT_B1_ID,
        {
          id: ALERT_B1_ID,
          tenantId: TENANT_B,
          alertType: 'staffing',
          severity: 'critical',
          title: 'Tenant B Staffing Gap',
          message: 'Missing coach for afternoon CrossFit session.',
          sourceEntityId: CLASS_B1_ID,
          sourceEntityType: 'studio_class',
          isAcknowledged: false,
          acknowledgedBy: null,
          acknowledgedAt: null,
          resolutionNotes: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]);

    inMemoryAuditLogs = [];
    inMemoryOutboxEvents = [];

    // Mock Transaction Client
    mockTx = {
      studioClass: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryClasses.values()).filter((c) => {
            if (where.tenantId && c.tenantId !== where.tenantId) return false;
            if (where.date?.gte && c.date < where.date.gte) return false;
            if (where.date?.lte && c.date > where.date.lte) return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryClasses.values()).find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.tenantId && c.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
      },

      studioBooking: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryBookings.values()).filter((b) => {
            if (where.tenantId && b.tenantId !== where.tenantId) return false;
            if (where.classId?.in && !where.classId.in.includes(b.classId)) return false;
            if (where.classId && typeof where.classId === 'string' && b.classId !== where.classId)
              return false;
            if (where.status && b.status !== where.status) return false;
            return true;
          });
        }),
      },

      equipment: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          const list = Array.from(inMemoryEquipment.values()).filter((e) => {
            if (where.tenantId && e.tenantId !== where.tenantId) return false;
            if (where.branchId && e.branchId !== where.branchId) return false;
            if (where.equipmentType && e.equipmentType !== where.equipmentType) return false;
            if (where.status && e.status !== where.status) return false;
            return true;
          });
          return list.map((e) => ({
            ...e,
            maintenanceRecords: Array.from(inMemoryMaintenance.values()).filter(
              (m) => m.equipmentId === e.id && m.tenantId === e.tenantId,
            ),
          }));
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryEquipment.values()).find((e) => {
              if (where.id && e.id !== where.id) return false;
              if (where.tenantId && e.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const e = inMemoryEquipment.get(where.id);
          if (!e) throw new NotFoundException('Equipment not found');
          Object.assign(e, data, { updatedAt: new Date() });
          inMemoryEquipment.set(where.id, e);
          return e;
        }),
      },

      equipmentMaintenance: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryMaintenance.values()).filter((m) => {
            if (where.tenantId && m.tenantId !== where.tenantId) return false;
            if (where.equipmentId && m.equipmentId !== where.equipmentId) return false;
            return true;
          });
        }),
        create: jest.fn(async ({ data }: any) => {
          const record = {
            id: `maint-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          inMemoryMaintenance.set(record.id, record);
          return record;
        }),
      },

      operationalAlert: {
        findMany: jest.fn(async ({ where }: any = {}) => {
          return Array.from(inMemoryAlerts.values()).filter((a) => {
            if (where.tenantId && a.tenantId !== where.tenantId) return false;
            if (where.severity && a.severity !== where.severity) return false;
            if (where.alertType && a.alertType !== where.alertType) return false;
            if (where.isAcknowledged !== undefined && a.isAcknowledged !== where.isAcknowledged)
              return false;
            return true;
          });
        }),
        findFirst: jest.fn(async ({ where }: any = {}) => {
          return (
            Array.from(inMemoryAlerts.values()).find((a) => {
              if (where.id && a.id !== where.id) return false;
              if (where.tenantId && a.tenantId !== where.tenantId) return false;
              return true;
            }) || null
          );
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const a = inMemoryAlerts.get(where.id);
          if (!a) throw new NotFoundException('Alert not found');
          Object.assign(a, data, { updatedAt: new Date() });
          inMemoryAlerts.set(where.id, a);
          return a;
        }),
      },

      tenant: {
        findUnique: jest.fn(async ({ where }: any) => {
          return { id: where.id, code: 'demo-tenant' };
        }),
      },

      auditLog: {
        create: jest.fn(async ({ data }: any) => {
          const entry = { id: `audit-${inMemoryAuditLogs.length + 1}`, ...data, createdAt: new Date() };
          inMemoryAuditLogs.push(entry);
          return entry;
        }),
        findMany: jest.fn(async () => []),
      },

      outboxEvent: {
        create: jest.fn(async ({ data }: any) => {
          const entry = { id: `outbox-${inMemoryOutboxEvents.length + 1}`, ...data, createdAt: new Date() };
          inMemoryOutboxEvents.push(entry);
          return entry;
        }),
      },
    };

    mockPrisma = {
      withTenant: jest.fn(async (tenantId: string, work: (tx: any) => Promise<any>) => {
        const alertsSnapshot = new Map(
          Array.from(inMemoryAlerts.entries()).map(([k, v]) => [k, { ...v }]),
        );
        try {
          return await work(mockTx);
        } catch (err) {
          inMemoryAlerts = alertsSnapshot;
          throw err;
        }
      }),
    };

    mockLlmGateway = {
      healthCheck: jest.fn(async () => ({ status: 'healthy', latencyMs: 25 })),
    };

    mockOrchestrator = {
      processMessage: jest.fn(),
    };

    auditOutbox = new AuditOutboxService(mockPrisma as any);
    operationsService = new OperationsService(mockPrisma as any, undefined, auditOutbox);
    equipmentService = new EquipmentService(mockPrisma as any, undefined, auditOutbox);

    toolRegistry = new ToolRegistry(undefined, auditOutbox);
    toolRegistry.register(
      'getClassCapacityUtilization',
      new GetClassCapacityUtilizationTool(operationsService),
    );
    toolRegistry.register(
      'getEquipmentStatus',
      new GetEquipmentStatusTool(equipmentService),
    );
    toolRegistry.register(
      'scheduleEquipmentMaintenance',
      new ScheduleEquipmentMaintenanceTool(equipmentService),
    );
    toolRegistry.register(
      'getOperationalAlerts',
      new GetOperationalAlertsTool(operationsService),
    );
    toolRegistry.register(
      'acknowledgeOperationalAlert',
      new AcknowledgeOperationalAlertTool(operationsService),
    );
    toolRegistry.register(
      'getClassCancellationImpact',
      new GetClassCancellationImpactTool(operationsService),
    );

    agentRegistry = new AgentRegistryService(
      mockPrisma as any,
      mockLlmGateway as any,
      auditOutbox,
      mockOrchestrator as any,
      toolRegistry,
      undefined,
      undefined,
      undefined,
      operationsService,
      equipmentService,
    );
  });

  // =========================================================================
  // 1. Capacity & Occupancy Utilization Domain Operations
  // =========================================================================
  describe('1. Capacity & Occupancy Utilization (getClassCapacityUtilization)', () => {
    it('calculates deterministic studio capacity utilization and fill rate from real classes', async () => {
      const res = await operationsService.getClassCapacityUtilization(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-1' },
        { startDate: '2026-10-15', endDate: '2026-10-25' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalSessions).toBe(3);
      // Total capacity: 10 (A1) + 15 (A2) + 20 (A3) = 45
      expect(data.totalCapacity).toBe(45);
      // Total booked: 9 (A1) + 6 (A2) + 2 (A3) = 17
      expect(data.totalBooked).toBe(17);
      // Average capacity utilization: (17 / 45) * 100 = 37.8%
      expect(data.averageCapacityUtilization).toBe(37.8);
      // Peak hours should list 07:00 (90%) as highest
      expect(data.peakHours[0]).toContain('07:00');
      // Low occupancy alerts (< 30%): A3 is 10%
      expect(data.lowOccupancyAlerts).toBe(1);
      expect(data.lowOccupancyClasses[0].sessionId).toBe(CLASS_A3_ID);
    });

    it('enforces strict tenant isolation: Tenant B never sees Tenant A sessions', async () => {
      const resB = await operationsService.getClassCapacityUtilization(
        { tenantId: TENANT_B, userId: 'user-b', role: 'admin', correlationId: 'c-b' },
        { startDate: '2026-10-15', endDate: '2026-10-25' },
      );

      expect(resB.success).toBe(true);
      const dataB = resB.data as any;
      expect(dataB.totalSessions).toBe(1);
      expect(dataB.totalCapacity).toBe(20);
      expect(dataB.totalBooked).toBe(15);
      expect(dataB.averageCapacityUtilization).toBe(75.0);
      expect(dataB.sessions[0].sessionId).toBe(CLASS_B1_ID);
      expect(dataB.sessions.find((s: any) => s.sessionId === CLASS_A1_ID)).toBeUndefined();
    });

    it('rejects capacity utilization query with UNSUPPORTED_FILTER when branchId or classTypeId is provided', async () => {
      const resBranch = await operationsService.getClassCapacityUtilization(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-unsupported-1' },
        { startDate: '2026-10-15', endDate: '2026-10-25', branchId: BRANCH_A_ID },
      );

      expect(resBranch.success).toBe(false);
      expect(resBranch.errorCode).toBe('UNSUPPORTED_FILTER');
      expect(resBranch.error).toContain('Filtering by branchId is not supported by the studio class schema');

      const resBoth = await operationsService.getClassCapacityUtilization(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-unsupported-2' },
        { startDate: '2026-10-15', endDate: '2026-10-25', branchId: BRANCH_A_ID, classTypeId: 'ct-1' },
      );

      expect(resBoth.success).toBe(false);
      expect(resBoth.errorCode).toBe('UNSUPPORTED_FILTER');
      expect(resBoth.error).toContain('Filtering by branchId and classTypeId is not supported by the studio class schema');
    });
  });

  // =========================================================================
  // 2. Equipment Status and Maintenance Lifecycle
  // =========================================================================
  describe('2. Equipment Status and Lifecycle (getEquipmentStatus)', () => {
    it('retrieves real equipment inventory, operational counts, and maintenance logs', async () => {
      const res = await equipmentService.getEquipmentStatus(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-2' },
        {},
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalEquipmentCount).toBe(2);
      expect(data.operational).toBe(1); // Reformer #3
      expect(data.maintenanceRequired).toBe(1); // Treadmill #1
      expect(data.equipment[0].name).toBe('Peak Pilates Reformer #3');
      expect(data.equipment[1].status).toBe('maintenance');
    });

    it('filters equipment by equipmentType and status', async () => {
      const res = await equipmentService.getEquipmentStatus(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-3' },
        { status: 'maintenance' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalEquipmentCount).toBe(1);
      expect(data.equipment[0].id).toBe(EQUIPMENT_A2_ID);
    });

    it('enforces tenant boundary on equipment status', async () => {
      const resB = await equipmentService.getEquipmentStatus(
        { tenantId: TENANT_B, userId: 'user-b', role: 'admin', correlationId: 'c-4' },
        {},
      );

      expect(resB.success).toBe(true);
      const dataB = resB.data as any;
      expect(dataB.totalEquipmentCount).toBe(1);
      expect(dataB.equipment[0].name).toBe('Rogue Echo Bike #1');
    });
  });

  // =========================================================================
  // 3. Equipment Maintenance Scheduling & Work Orders
  // =========================================================================
  describe('3. Equipment Maintenance Scheduling (scheduleEquipmentMaintenance)', () => {
    it('schedules maintenance work order, updates nextMaintenanceAt, and records audit trail', async () => {
      const res = await equipmentService.scheduleEquipmentMaintenance(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-5' },
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'routine',
          scheduledAt: '2026-11-05T10:00:00Z',
          estimatedDurationMinutes: 60,
          notes: 'Quarterly carriage glide and spring tension check',
          assignedTo: USER_TRAINER_ID,
        },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.equipmentId).toBe(EQUIPMENT_A1_ID);
      expect(data.status).toBe('scheduled');
      expect(data.maintenanceType).toBe('routine');

      // Verify equipment record nextMaintenanceAt was updated
      const updatedEquipment = inMemoryEquipment.get(EQUIPMENT_A1_ID);
      expect(updatedEquipment.nextMaintenanceAt).toEqual(new Date('2026-11-05T10:00:00Z'));

      // Verify transactional audit event was recorded
      expect(inMemoryAuditLogs.length).toBeGreaterThanOrEqual(1);
      const auditLog = inMemoryAuditLogs.find(
        (l) => l.action === 'equipment.maintenance.schedule',
      );
      expect(auditLog).toBeDefined();
      expect(auditLog.tenantId).toBe(TENANT_A);
    });

    it('sets equipment status to maintenance if maintenanceType is repair', async () => {
      const res = await equipmentService.scheduleEquipmentMaintenance(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-6' },
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'repair',
          scheduledAt: '2026-10-28T14:00:00Z',
          estimatedDurationMinutes: 120,
          notes: 'Emergency cable replacement',
        },
      );

      expect(res.success).toBe(true);
      const updatedEquipment = inMemoryEquipment.get(EQUIPMENT_A1_ID);
      expect(updatedEquipment.status).toBe('maintenance');
    });

    it('rejects cross-tenant equipment maintenance request with NOT_FOUND', async () => {
      // Tenant B user attempts to schedule maintenance on Tenant A's equipment
      const res = await equipmentService.scheduleEquipmentMaintenance(
        { tenantId: TENANT_B, userId: 'user-b', role: 'admin', correlationId: 'c-cross' },
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'routine',
          scheduledAt: '2026-11-01T10:00:00Z',
          estimatedDurationMinutes: 60,
        },
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOT_FOUND');
      expect(res.error).toContain('not found for this tenant');
    });
  });

  // =========================================================================
  // 4. Operational Bottleneck Alerts & Triage
  // =========================================================================
  describe('4. Operational Bottleneck Alerts (getOperationalAlerts, acknowledgeOperationalAlert)', () => {
    it('retrieves open operational alerts filtered by tenant', async () => {
      const res = await operationsService.getOperationalAlerts(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-7' },
        {},
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalAlerts).toBe(2);
      expect(data.alerts.map((a: any) => a.id)).toEqual(
        expect.arrayContaining([ALERT_A1_ID, ALERT_A2_ID]),
      );
      expect(data.alerts.find((a: any) => a.id === ALERT_B1_ID)).toBeUndefined();
    });

    it('filters operational alerts by severity and category', async () => {
      const res = await operationsService.getOperationalAlerts(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-8' },
        { severity: 'critical', category: 'capacity' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalAlerts).toBe(1);
      expect(data.alerts[0].id).toBe(ALERT_A2_ID);
    });

    it('acknowledges operational alert, updates resolution status, and records audit event', async () => {
      const res = await operationsService.acknowledgeOperationalAlert(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-9' },
        {
          alertId: ALERT_A1_ID,
          action: 'resolve',
          resolutionNotes: 'Technician dispatched for belt sensor calibration',
        },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.isAcknowledged).toBe(true);
      expect(data.action).toBe('resolve');

      const alert = inMemoryAlerts.get(ALERT_A1_ID);
      expect(alert.isAcknowledged).toBe(true);
      expect(alert.acknowledgedBy).toBe(USER_ADMIN_ID);

      // Verify transactional audit event was recorded
      const alertAudit = inMemoryAuditLogs.find(
        (l) => l.action === 'operational_alert.acknowledge',
      );
      expect(alertAudit).toBeDefined();
      expect(alertAudit.tenantId).toBe(TENANT_A);
      expect(alertAudit.resourceRef).toBe(ALERT_A1_ID);
    });

    it('rolls back alert acknowledgement mutation when audit outbox fails within transaction', async () => {
      mockTx.auditLog.create.mockImplementationOnce(async () => {
        throw new Error('Audit database outbox connection failure');
      });

      const res = await operationsService.acknowledgeOperationalAlert(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-err' },
        {
          alertId: ALERT_A1_ID,
          action: 'resolve',
          resolutionNotes: 'Attempt with failing audit log',
        },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Audit database outbox connection failure');

      // Crucial verification: Alert state in DB rolled back and remains unacknowledged
      const alert = inMemoryAlerts.get(ALERT_A1_ID);
      expect(alert.isAcknowledged).toBe(false);
      expect(alert.acknowledgedBy).toBeNull();
    });

    it('rejects acknowledging an alert belonging to another tenant', async () => {
      const res = await operationsService.acknowledgeOperationalAlert(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-cross-alert' },
        {
          alertId: ALERT_B1_ID, // Belongs to Tenant B
          action: 'acknowledge',
        },
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // 5. Class Cancellation Impact Analysis
  // =========================================================================
  describe('5. Class Cancellation Impact (getClassCancellationImpact)', () => {
    it('evaluates cancellation impact severity and affected members count', async () => {
      const res = await operationsService.getClassCancellationImpact(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-10' },
        { sessionId: CLASS_A1_ID },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.sessionId).toBe(CLASS_A1_ID);
      expect(data.className).toBe('Morning Reformer Pilates');
      expect(data.bookedMembersCount).toBe(9);
      expect(data.impactSeverity).toBe('warning');
      expect(data.recommendedAction).toContain('notify 9 booked members');
    });

    it('returns NOT_FOUND for cross-tenant session cancellation check', async () => {
      const res = await operationsService.getClassCancellationImpact(
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'c-11' },
        { sessionId: CLASS_B1_ID },
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // 6. Agent Registry Dispatch & Two-Phase Confirmation Guardrail
  // =========================================================================
  describe('6. Agent Registry Dispatch & Write-Action Gating (AgentRegistryService)', () => {
    it('dispatches capacity-utilization read action to OperationsService without mock fallbacks', async () => {
      const res = await agentRegistry.executeAgentAction(
        TENANT_A,
        'operations-agent',
        'capacity-utilization',
        { startDate: '2026-10-15', endDate: '2026-10-25' },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      expect(res.agentId).toBe('operations-agent');
      expect(res.actionId).toBe('capacity-utilization');
      const data = res.data as any;
      // Real calculated capacity
      expect(data.averageCapacityUtilization).toBe(37.8);
      expect(data.totalCapacity).toBe(45);
      expect(data.totalBooked).toBe(17);
    });

    it('dispatches equipment-status read action to EquipmentService without mock fallbacks', async () => {
      const res = await agentRegistry.executeAgentAction(
        TENANT_A,
        'operations-agent',
        'equipment-status',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalEquipmentCount).toBe(2);
      expect(data.operational).toBe(1);
      expect(data.maintenanceRequired).toBe(1);
    });

    it('dispatches operational-alerts read action to OperationsService without mock fallbacks', async () => {
      const res = await agentRegistry.executeAgentAction(
        TENANT_A,
        'operations-agent',
        'operational-alerts',
        {},
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(true);
      const data = res.data as any;
      expect(data.totalAlerts).toBe(2);
    });

    it('strictly REJECTS direct unconfirmed execution of schedule-maintenance write action', async () => {
      const res = await agentRegistry.executeAgentAction(
        TENANT_A,
        'operations-agent',
        'schedule-maintenance',
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'routine',
          scheduledAt: '2026-11-01T10:00:00Z',
          estimatedDurationMinutes: 60,
        },
        { id: USER_ADMIN_ID, role: 'admin' },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('schedule-maintenance requires two-phase confirmation');
    });

    it('rejects unsupported actions on operations-agent', async () => {
      await expect(
        agentRegistry.executeAgentAction(
          TENANT_A,
          'operations-agent',
          'non-existent-action',
          {},
          { id: USER_ADMIN_ID, role: 'admin' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces RBAC: trainer, front_desk, and admin have access; member is denied', async () => {
      const adminAgent = await agentRegistry.getAgent(TENANT_A, 'operations-agent', 'admin');
      expect(adminAgent.isAccessible).toBe(true);

      const trainerAgent = await agentRegistry.getAgent(TENANT_A, 'operations-agent', 'trainer');
      expect(trainerAgent.isAccessible).toBe(true);

      const frontDeskAgent = await agentRegistry.getAgent(TENANT_A, 'operations-agent', 'front_desk');
      expect(frontDeskAgent.isAccessible).toBe(true);

      await expect(
        agentRegistry.getAgent(TENANT_A, 'operations-agent', 'member'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // 7. ToolRegistry Integration & Confirmation Boundaries
  // =========================================================================
  describe('7. Tool Registry Execution Pipeline & Guardrails', () => {
    it('executes GetClassCapacityUtilizationTool (T-42) via ToolRegistry', async () => {
      const res = await toolRegistry.execute(
        'getClassCapacityUtilization',
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'tool-c1' },
        { startDate: '2026-10-15', endDate: '2026-10-25' },
      );

      expect(res.success).toBe(true);
      expect((res.data as any).totalCapacity).toBe(45);
    });

    it('blocks direct unconfirmed execution of ScheduleEquipmentMaintenanceTool (T-46)', async () => {
      const res = await toolRegistry.execute(
        'scheduleEquipmentMaintenance',
        { tenantId: TENANT_A, userId: USER_ADMIN_ID, role: 'admin', correlationId: 'tool-c2' },
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'routine',
          scheduledAt: '2026-11-05T10:00:00.000Z',
          estimatedDurationMinutes: 60,
        },
      );

      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('CONFIRMATION_REQUIRED');
      expect(res.error).toContain('requires pending-action confirmation');
    });

    it('allows ScheduleEquipmentMaintenanceTool (T-46) when context specifies isConfirmedPendingAction', async () => {
      const res = await toolRegistry.execute(
        'scheduleEquipmentMaintenance',
        {
          tenantId: TENANT_A,
          userId: USER_ADMIN_ID,
          role: 'admin',
          correlationId: 'tool-c3',
          isConfirmedPendingAction: true,
        },
        {
          equipmentId: EQUIPMENT_A1_ID,
          maintenanceType: 'routine',
          scheduledAt: '2026-11-05T10:00:00.000Z',
          estimatedDurationMinutes: 60,
          notes: 'Confirmed work order via pending action token',
        },
        { isConfirmedPendingAction: true },
      );

      expect(res.success).toBe(true);
      expect((res.data as any).status).toBe('scheduled');
      expect((res.data as any).equipmentId).toBe(EQUIPMENT_A1_ID);
    });

    it('enforces RBAC permissions via canUseTool: trainer can read operations but cannot write equipment', () => {
      expect(canUseTool('admin', 'getClassCapacityUtilization')).toBe(true);
      expect(canUseTool('admin', 'scheduleEquipmentMaintenance')).toBe(true);

      expect(canUseTool('trainer', 'getClassCapacityUtilization')).toBe(true);
      expect(canUseTool('trainer', 'scheduleEquipmentMaintenance')).toBe(false); // Only equipment.write

      expect(canUseTool('member', 'getClassCapacityUtilization')).toBe(false);
    });
  });

  // =========================================================================
  // 8. RPC Method Mapping Contract (ERP_METHODS)
  // =========================================================================
  describe('8. RPC Method Mapping Contract (ERP_METHODS)', () => {
    it('maps REPORT_CLASS_CAPACITY_UTILIZATION to wellness_studio.api.operations.class_capacity_utilization', () => {
      expect(ERP_METHODS.REPORT_CLASS_CAPACITY_UTILIZATION).toBe(
        'wellness_studio.api.operations.class_capacity_utilization',
      );
    });
  });
});
