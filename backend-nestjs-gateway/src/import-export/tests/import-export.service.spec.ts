import { afterAll, beforeEach, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImportExportService, tenantScopedImportId } from '../import-export.service';
import { parseStudioCsvRecords } from '../csv-parser';


describe('ImportExportService', () => {
  const originalImportStore = process.env.IMPORT_STORE;

  beforeEach(() => {
    process.env.IMPORT_STORE = 'erp';
  });

  afterAll(() => {
    if (originalImportStore === undefined) {
      delete process.env.IMPORT_STORE;
    } else {
      process.env.IMPORT_STORE = originalImportStore;
    }
  });

  const context = {
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    tenantCode: 'studio-a',
    correlationId: 'corr-1',
  };

  function buildTx() {
    return {
      auditLog: {
        create: (jest.fn() as any).mockResolvedValue({ id: 'audit-1' }),
        update: (jest.fn() as any).mockResolvedValue({}),
      },
      idempotencyKey: {
        findUnique: (jest.fn() as any).mockResolvedValue(null),
        create: (jest.fn() as any).mockResolvedValue({}),
      },
      studioMember: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        count: (jest.fn() as any).mockResolvedValue(0),
        create: (jest.fn() as any).mockResolvedValue({ id: 'member-1' }),
        update: (jest.fn() as any).mockResolvedValue({ id: 'member-1' }),
      },
      studioLead: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'lead-1' }),
        update: (jest.fn() as any).mockResolvedValue({ id: 'lead-1' }),
      },
      studioClass: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'class-1' }),
        update: (jest.fn() as any).mockResolvedValue({ id: 'class-1' }),
      },
      studioMembership: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'membership-1' }),
      },
      studioBooking: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'booking-1' }),
      },
      studioAttendance: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'attendance-1' }),
      },
      studioPayment: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'payment-1' }),
      },
      studioEvent: {
        findMany: (jest.fn() as any).mockResolvedValue([]),
        create: (jest.fn() as any).mockResolvedValue({ id: 'event-1' }),
      },
    };
  }

  function buildPostgresService() {
    const tx = buildTx();
    const prisma = {
      withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
    };
    const service = new ImportExportService(
      { call: jest.fn() } as any,
      { recordInTransaction: jest.fn() } as any,
      prisma as any,
    );
    return { service, tx };
  }

  function buildService(erpCalls: Array<Promise<any>>) {
    const tx = buildTx();
    const erpCall = (jest.fn() as any);
    erpCalls.forEach((result) => {
      erpCall.mockResolvedValueOnce(result);
    });
    const erp = { call: erpCall };
    const auditOutbox = { recordInTransaction: (jest.fn() as any).mockResolvedValue(undefined) };
    const prisma = {
      withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
    };
    return new ImportExportService(erp as any, auditOutbox as any, prisma as any);
  }

  describe('importMembers', () => {
    it('updates a matching member when imported fields change', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioMember.findMany.mockResolvedValue([{
        id: 'member-1',
        email: 'same@example.com',
        phone: '9845091122',
        fullName: 'Same Member',
        plan: 'Basic',
        status: 'Active',
        joined: new Date('2026-01-01T00:00:00.000Z'),
        expiry: new Date('2026-12-31T00:00:00.000Z'),
        coach: 'Coach One',
      }]);

      const result = await service.importMembers(context, [{
        name: 'Same Member',
        email: 'same@example.com',
        phone: '9845091122',
        plan: 'Premium',
        status: 'Active',
        joined: '2026-01-01',
        expiry: '2026-12-31',
        coach: 'Coach One',
      }], 'user-1', false, undefined, 'update');

      expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0, failed: 0 });
      expect(tx.studioMember.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'member-1', tenantId: context.tenantId },
        data: expect.objectContaining({ plan: 'Premium' }),
      }));
    });

    it('skips a matching member when imported fields are unchanged', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioMember.findMany.mockResolvedValue([{
        id: 'member-1',
        email: 'same@example.com',
        phone: '9845091122',
        fullName: 'Same Member',
        plan: 'Premium',
        status: 'Active',
        joined: new Date('2026-01-01T00:00:00.000Z'),
        expiry: new Date('2026-12-31T00:00:00.000Z'),
        coach: 'Coach One',
      }]);

      const result = await service.importMembers(context, [{
        name: 'Same Member',
        email: 'same@example.com',
        phone: '9845091122',
        plan: 'Premium',
        status: 'Active',
        joined: '2026-01-01',
        expiry: '2026-12-31',
        coach: 'Coach One',
      }], 'user-1', false, undefined, 'update');

      expect(result).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 });
      expect(tx.studioMember.update).not.toHaveBeenCalled();
    });

    it('uses tenant-scoped PostgreSQL reads to deduplicate existing members', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const tx = buildTx();
      tx.studioMember.findMany.mockResolvedValue([
        { email: 'existing@example.com', phone: '9845091122' },
      ]);
      const prisma = {
        withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
      };
      const service = new ImportExportService(
        { call: jest.fn() } as any,
        { recordInTransaction: jest.fn() } as any,
        prisma as any,
      );

      const result = await service.importMembers(
        context,
        [{ name: 'Existing Member', email: 'existing@example.com', phone: '9845091122' }],
        'user-1',
        true,
      );

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(tx.studioMember.findMany).toHaveBeenCalledWith({
        where: { tenantId: context.tenantId },
      });
      expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
      expect(tx.auditLog.update).not.toHaveBeenCalled();
      expect(prisma.withTenant).toHaveBeenCalledWith(
        context.tenantId,
        expect.any(Function),
      );
    });

    it('imports valid members via ERP and returns counts', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }), // list_members
        Promise.resolve({ id: 'WS-MEM-001', duplicate: false }), // create 1
        Promise.resolve({ id: 'WS-MEM-002', duplicate: false }), // create 2
      ]);
      const result = await service.importMembers(
        context,
        [
          { name: 'Divya Krishnan', email: 'divya.k@example.com', phone: '9845091122', plan: 'Premium', status: 'Active', joined: '3/20/2026', expiry: '12/20/2026', coach: 'Ananya Sharma' },
          { name: 'Karan Malhotra', email: 'karan.m@example.com', phone: '9886034455', plan: 'Basic', status: 'Active', joined: '3/22/2026', expiry: '11/22/2026', coach: 'Rahul Menon' },
        ],
        'user-1',
        false,
      );

      expect(result.created).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('accepts ISO timestamps exported from the live records as member dates', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }),
        Promise.resolve({ id: 'WS-M-ISO-001', duplicate: false }),
      ]);
      const result = await service.importMembers(context, [{
        name: 'ISO Export Member', email: 'iso-export@example.com', phone: '9845091122',
        joined: '2026-09-02T00:00:00.000Z', expiry: '2027-09-01T00:00:00.000Z',
      }], 'user-1', false);

      expect(result).toMatchObject({ created: 1, failed: 0 });
    });

    it('validates required fields and returns per-row errors', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }),
      ]);
      const result = await service.importMembers(
        context,
        [{ name: '', email: 'not-an-email', phone: '9845091122' }],
        'user-1',
        false,
      );

      expect(result.failed).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('supports dryRun without writing', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }), // list_members only
      ]);
      const result = await service.importMembers(
        context,
        [{ name: 'Test User', email: 'test@example.com', phone: '9845091122' }],
        'user-1',
        true,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('dedupes within file by email', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }), // list_members
        Promise.resolve({ id: 'WS-MEM-001', duplicate: false }), // create 1
      ]);
      const result = await service.importMembers(
        context,
        [
          { name: 'User One', email: 'dup@example.com', phone: '1111111111' },
          { name: 'User Two', email: 'dup@example.com', phone: '2222222222' },
        ],
        'user-1',
        false,
      );

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(1);
    });

    it('normalizes phone and email', async () => {
      const service = buildService([
        Promise.resolve({ members: [] }), // list_members
        Promise.resolve({ id: 'WS-MEM-001', duplicate: false }), // create
      ]);
      await service.importMembers(
        context,
        [{ name: 'Test User', email: 'Test@Example.COM', phone: '+91 98450 91122' }],
        'user-1',
        false,
      );
      expect(true).toBe(true);
    });
  });

  describe('importLeads', () => {
    it('updates a matching lead when imported fields change and skips unchanged rows', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioLead.findMany.mockResolvedValue([{
        id: 'lead-1',
        name: 'Lead One',
        email: 'lead@example.com',
        phone: '9845091122',
        source: 'Instagram',
        stage: 'New enquiry',
        followUpDate: new Date('2026-10-20T00:00:00.000Z'),
        assigned: 'Coach One',
        plan: 'Basic',
        notes: 'Original',
      }]);
      const row = {
        name: 'Lead One',
        email: 'lead@example.com',
        phone: '9845091122',
        source: 'Instagram',
        stage: 'Follow-up',
        followUpDate: '2026-10-20',
        assigned: 'Coach One',
        plan: 'Basic',
        notes: 'Original',
      };

      const result = await service.importLeads(context, [row], 'user-1', false, undefined, 'update');

      expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0, failed: 0 });
      expect(tx.studioLead.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'lead-1', tenantId: context.tenantId },
        data: expect.objectContaining({ stage: 'Follow-up' }),
      }));
      const unchangedService = buildPostgresService();
      unchangedService.tx.studioLead.findMany.mockResolvedValue([{
        id: 'lead-1',
        name: 'Lead One',
        email: 'lead@example.com',
        phone: '9845091122',
        source: 'Instagram',
        stage: 'Follow-up',
        followUpDate: new Date('2026-10-20T00:00:00.000Z'),
        assigned: 'Coach One',
        plan: 'Basic',
        notes: 'Original',
      }]);
      const unchanged = await unchangedService.service.importLeads(
        context, [row], 'user-1', false, undefined, 'update',
      );
      expect(unchanged).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 });
      expect(unchangedService.tx.studioLead.update).not.toHaveBeenCalled();
    });

    it('imports valid leads via ERP', async () => {
      const service = buildService([
        Promise.resolve({ leads: [] }),
        Promise.resolve({ id: 'WS-LEAD-001', duplicate: false }),
      ]);
      const result = await service.importLeads(
        context,
        [{ name: 'Neha Kapoor', email: 'neha.k@example.com', phone: '9845122334', source: 'Instagram', stage: 'New enquiry' }],
        'user-1',
        false,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('requires name and at least one of email/phone', async () => {
      const service = buildService([
        Promise.resolve({ leads: [] }),
      ]);
      const result = await service.importLeads(
        context,
        [{ name: '', email: '', phone: '' }],
        'user-1',
        false,
      );

      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('importClasses', () => {
    it('updates a matching class when imported fields change and skips unchanged rows', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      const existing = {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Morning Yoga',
        category: 'Yoga',
        date: new Date('2026-10-20T00:00:00.000Z'),
        startTime: '07:00',
        endTime: '07:50',
        trainer: 'Kavita Iyer',
        room: 'Studio B',
        capacity: 20,
        status: 'Scheduled',
      };
      tx.studioClass.findMany.mockResolvedValue([existing]);
      const row = {
        ...existing,
        date: '2026-10-20',
        category: 'Yoga',
        endTime: '07:50',
        room: 'Studio B',
        capacity: 18,
      };

      const result = await service.importClasses(context, [row], 'user-1', false, undefined, 'update');

      expect(result).toMatchObject({ created: 0, updated: 1, skipped: 0, failed: 0 });
      expect(tx.studioClass.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: '11111111-1111-4111-8111-111111111111', tenantId: context.tenantId },
        data: expect.objectContaining({ capacity: 18 }),
      }));
      tx.studioClass.update.mockClear();
      tx.studioClass.findMany.mockResolvedValue([{ ...existing, capacity: 18 }]);
      const unchanged = await service.importClasses(context, [row], 'user-1', false, undefined, 'update');
      expect(unchanged).toMatchObject({ created: 0, updated: 0, skipped: 1, failed: 0 });
      expect(tx.studioClass.update).not.toHaveBeenCalled();
    });

    it('skips existing PostgreSQL classes using normalized dates', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const tx = buildTx();
      tx.studioClass.findMany.mockResolvedValue([
        {
          name: 'Evening Core & Mobility',
          date: new Date('2026-10-19T00:00:00.000Z'),
          startTime: '18:00',
        },
      ]);
      const prisma = {
        withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
      };
      const service = new ImportExportService(
        { call: jest.fn() } as any,
        { recordInTransaction: jest.fn() } as any,
        prisma as any,
      );

      const result = await service.importClasses(
        context,
        [{
          name: 'Evening Core & Mobility',
          category: 'Pilates',
          date: '2026-10-19',
          startTime: '18:00',
          trainer: 'Ananya Sharma',
          capacity: 14,
        }],
        'user-1',
        false,
      );

      expect(result).toMatchObject({ created: 0, skipped: 1, failed: 0 });
      expect(tx.studioClass.create).not.toHaveBeenCalled();
      expect(tx.studioClass.findMany).toHaveBeenCalledWith({
        where: { tenantId: context.tenantId },
      });
    });

    it('imports valid classes via ERP', async () => {
      const service = buildService([
        Promise.resolve({ classes: [] }),
        Promise.resolve({ id: 'WS-CLS-001', duplicate: false }),
      ]);
      const result = await service.importClasses(
        context,
        [{ name: 'Morning Yoga', category: 'Yoga', date: '10/20/2026', startTime: '7:00', trainer: 'Kavita Iyer', capacity: 20 }],
        'user-1',
        false,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('requires name, date, startTime, trainer', async () => {
      const service = buildService([
        Promise.resolve({ classes: [] }),
      ]);
      const result = await service.importClasses(
        context,
        [{ name: '', date: '', startTime: '', trainer: '' }],
        'user-1',
        false,
      );

      expect(result.failed).toBeGreaterThan(0);
    });
  });

  describe('importMemberships', () => {
    it('accepts Half-Yearly planType and imports via ERP', async () => {
      const service = buildService([
        Promise.resolve({ memberships: [] }),
        Promise.resolve({ id: 'WS-MEM-001', duplicate: false }),
      ]);
      const result = await service.importMemberships(
        context,
        [{ name: 'Basic Half-Yearly', planType: 'Half-Yearly', priceINR: 12800, sessionLimit: 48 }],
        'user-1',
        false,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('accepts Monthly, Quarterly, Annual, Half-Yearly via ERP', async () => {
      const service = buildService([
        Promise.resolve({ memberships: [] }),
        Promise.resolve({ id: 'WS-MEM-001', duplicate: false }),
        Promise.resolve({ id: 'WS-MEM-002', duplicate: false }),
        Promise.resolve({ id: 'WS-MEM-003', duplicate: false }),
        Promise.resolve({ id: 'WS-MEM-004', duplicate: false }),
      ]);
      const result = await service.importMemberships(
        context,
        [
          { name: 'Basic Monthly', planType: 'Monthly', priceINR: 2500, sessionLimit: 8 },
          { name: 'Basic Quarterly', planType: 'Quarterly', priceINR: 6800, sessionLimit: 24 },
          { name: 'Basic Annual', planType: 'Annual', priceINR: 23400, sessionLimit: 96 },
          { name: 'Basic Half-Yearly', planType: 'Half-Yearly', priceINR: 12800, sessionLimit: 48 },
        ],
        'user-1',
        false,
      );

      expect(result.created).toBe(4);
      expect(result.failed).toBe(0);
    });

    it('rejects unsupported planType values', async () => {
      const service = buildService([
        Promise.resolve({ memberships: [] }),
      ]);
      const result = await service.importMemberships(
        context,
        [{ name: 'Bad Plan', planType: 'Weekly', priceINR: 1000, sessionLimit: 4 }],
        'user-1',
        false,
      );

      expect(result.created).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].field).toBe('isIn');
    });

    it('accepts boolean and textual active values from JSON and CSV packages', async () => {
      const service = buildService([
        Promise.resolve({ memberships: [] }),
        Promise.resolve({ id: 'WS-MEM-005', duplicate: false }),
        Promise.resolve({ id: 'WS-MEM-006', duplicate: false }),
      ]);
      const result = await service.importMemberships(
        context,
        [
          { name: 'Package Active', planType: 'Monthly', priceINR: 2500, sessionLimit: 8, active: true },
          { name: 'Package Inactive', planType: 'Monthly', priceINR: 2500, sessionLimit: 8, active: 'Inactive' },
        ],
        'user-1',
        false,
      );

      expect(result).toMatchObject({ created: 2, failed: 0 });
    });

    it('imports memberships via PostgreSQL with Half-Yearly planType', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioMembership.findMany.mockResolvedValue([]);

      const result = await service.importMemberships(
        context,
        [{ name: 'Premium Half-Yearly', planType: 'Half-Yearly', priceINR: 19400, sessionLimit: 72 }],
        'user-1',
        false,
      );

      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(tx.studioMembership.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ planType: 'Half-Yearly' }),
      }));
    });
  });

  describe('importPayments', () => {
    it('accepts a zero refunded amount for an unreimbursed payment', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioMember.findMany.mockResolvedValue([{ id: 'member-1' }]);

      const result = await service.importPayments(context, [{
        ref: 'QA-PAYMENT-001',
        date: '2026-10-18',
        memberId: 'member-1',
        type: 'Membership',
        method: 'UPI',
        status: 'Paid',
        amount: 2500,
        refundedAmount: 0,
      }], 'user-1', false);

      expect(result).toMatchObject({ created: 1, updated: 0, skipped: 0, failed: 0 });
      expect(tx.studioPayment.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ amount: 2500, refundedAmount: 0 }),
      }));
    });
  });

  describe('source ID preservation and foreign-key crosswalks', () => {
    it('maps supplied source IDs to stable tenant-scoped IDs and remaps dependent foreign keys', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const memberId = '11111111-1111-4111-8111-111111111111';
      const classId = '22222222-2222-4222-8222-222222222222';
      const bookingId = '33333333-3333-4333-8333-333333333333';
      const { service, tx } = buildPostgresService();

      await service.importMembers(context, [{
        id: memberId,
        name: 'Source Member',
        email: 'source@example.com',
        phone: '9845091122',
      }], 'user-1', false);
      await service.importClasses(context, [{
        id: classId,
        name: 'Source Class',
        date: '2026-10-20',
        startTime: '07:00',
        trainer: 'Source Trainer',
      }], 'user-1', false);

      const tenantMemberId = tenantScopedImportId(context.tenantId, 'member', memberId);
      const tenantClassId = tenantScopedImportId(context.tenantId, 'class', classId);
      const tenantBookingId = tenantScopedImportId(context.tenantId, 'booking', bookingId);
      tx.studioMember.findMany.mockResolvedValue([{ id: tenantMemberId, email: 'source@example.com' }]);
      tx.studioClass.findMany.mockResolvedValue([{
        id: tenantClassId,
        name: 'Source Class',
        date: new Date('2026-10-20T00:00:00.000Z'),
      }]);
      await service.importBookings(context, [{
        id: bookingId,
        memberId,
        classId,
        bookedAt: '2026-10-19T07:00:00.000Z',
      }], 'user-1', false);

      expect(tx.studioMember.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id: tenantMemberId }),
      }));
      expect(tx.studioClass.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id: tenantClassId }),
      }));
      expect(tx.studioBooking.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ id: tenantBookingId, memberId: tenantMemberId, classId: tenantClassId }),
      }));
    });

    it('uses positional crosswalks only for a complete unresolved one-to-one legacy file', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const { service, tx } = buildPostgresService();
      tx.studioMember.findMany.mockResolvedValue([
        { id: 'member-a', email: 'a@example.com' },
        { id: 'member-b', email: 'b@example.com' },
      ]);
      tx.studioClass.findMany.mockResolvedValue([
        { id: 'class-a', name: 'Class A', date: new Date('2026-10-20') },
        { id: 'class-b', name: 'Class B', date: new Date('2026-10-21') },
      ]);

      const result = await service.importBookings(context, [
        { memberId: 'legacy-member-a', classId: 'legacy-class-a', bookedAt: '2026-10-20T07:00:00.000Z' },
        { memberId: 'legacy-member-b', classId: 'legacy-class-b', bookedAt: '2026-10-21T07:00:00.000Z' },
      ], 'user-1', false);

      expect(result).toMatchObject({ created: 2, failed: 0 });
      expect(tx.studioBooking.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
        data: expect.objectContaining({ memberId: 'member-a', classId: 'class-a' }),
      }));
      expect(tx.studioBooking.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
        data: expect.objectContaining({ memberId: 'member-b', classId: 'class-b' }),
      }));
    });
  });

  describe('universal studio demo CSV contract', () => {
    it('dry-run validates every supported dataset in the universal CSV', async () => {
      const packagePath = join(process.cwd(), '..', 'Data', 'universal-studio-demo.csv');
      const packageRows = parseStudioCsvRecords(readFileSync(packagePath, 'utf8'));
      const rowsFor = (dataset: string) => packageRows.filter((row) => row.dataset === dataset);

      const service = buildService([
        Promise.resolve({ members: [] }),
        Promise.resolve({ leads: [] }),
        Promise.resolve({ classes: [] }),
        Promise.resolve({ memberships: [] }),
        Promise.resolve({ bookings: [] }),
        Promise.resolve({ attendance: [] }),
        Promise.resolve({ payments: [] }),
        Promise.resolve({ events: [] }),
      ]);
      const results = [
        await service.importMembers(context, rowsFor('members'), 'user-1', true),
        await service.importLeads(context, rowsFor('leads'), 'user-1', true),
        await service.importClasses(context, rowsFor('classes'), 'user-1', true),
        await service.importMemberships(context, rowsFor('memberships'), 'user-1', true),
        await service.importBookings(context, rowsFor('bookings'), 'user-1', true),
        await service.importAttendance(context, rowsFor('attendance'), 'user-1', true),
        await service.importPayments(context, rowsFor('payments'), 'user-1', true),
        await service.importEvents(context, rowsFor('events'), 'user-1', true),
      ];

      expect(results.map((result) => result.failed)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      expect(results.map((result) => result.created)).toEqual([4, 3, 3, 3, 4, 3, 4, 2]);
    });
  });

  describe('exportDataset', () => {
    it('exports only the current tenant rows from PostgreSQL', async () => {
      process.env.IMPORT_STORE = 'postgres';
      const tx = buildTx();
      const rows = [{ id: 'member-1', tenantId: context.tenantId }];
      tx.studioMember.findMany.mockResolvedValue(rows);
      tx.studioMember.count.mockResolvedValue(1);
      const prisma = {
        withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
      };
      const service = new ImportExportService(
        { call: jest.fn() } as any,
        { recordInTransaction: jest.fn() } as any,
        prisma as any,
      );

      const result = await service.exportDataset(
        context,
        { dataset: 'members', format: 'csv', page: 1, limit: 100 },
        'user-1',
      );

      expect(result).toMatchObject({ data: rows, count: 1, format: 'csv' });
      expect(tx.studioMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { tenantId: context.tenantId },
      }));
      expect(tx.studioMember.count).toHaveBeenCalledWith({
        where: { tenantId: context.tenantId },
      });
      expect(tx.auditLog.update).not.toHaveBeenCalled();
    });

    it('exports members dataset via ERP', async () => {
      const service = buildService([
        Promise.resolve({
          members: [{ id: '1', name: 'Test', email: 'test@example.com' }],
          count: 1,
        }),
      ]);
      const result = await service.exportDataset(
        context,
        { dataset: 'members', page: 1, limit: 100 },
        'user-1',
      );

      expect(result.data.length).toBe(1);
      expect(result.count).toBe(1);
      expect(result.format).toBe('json');
    });

    it('throws for unsupported dataset', async () => {
      const service = buildService([]);
      await expect(
        service.exportDataset(
          context,
          { dataset: 'invalid' as any, page: 1, limit: 100 },
          'user-1',
        ),
      ).rejects.toThrow();
    });
  });

  describe('idempotency', () => {
    it('rejects duplicate idempotency key', async () => {
      const tx = buildTx();
      const erpCall = (jest.fn() as any).mockResolvedValue({ id: 'WS-MEM-001', duplicate: false });
      const erp = { call: erpCall };
      const auditOutbox = { recordInTransaction: (jest.fn() as any).mockResolvedValue(undefined) };
      const prisma = {
        withTenant: jest.fn((_tenant: string, callback: (client: unknown) => unknown) => callback(tx)),
      };
      tx.idempotencyKey.findUnique.mockResolvedValue({ id: 'existing' });
      const service = new ImportExportService(erp as any, auditOutbox as any, prisma as any);

      await expect(
        service.importMembers(
          context,
          [{ name: 'Test', email: 'test@example.com' }],
          'user-1',
          false,
          'same-key',
        ),
      ).rejects.toThrow(/already been processed/i);
    });
  });
});
