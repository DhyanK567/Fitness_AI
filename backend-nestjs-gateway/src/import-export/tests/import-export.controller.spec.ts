import { jest } from '@jest/globals';
import { ImportExportController } from '../import-export.controller';
import { ImportExportService } from '../import-export.service';

describe('ImportExportController', () => {
  const mockService = {
    importMembers: jest.fn<(args: any) => Promise<any>>(),
    importLeads: jest.fn<(args: any) => Promise<any>>(),
    importClasses: jest.fn<(args: any) => Promise<any>>(),
    importMemberships: jest.fn<(args: any) => Promise<any>>(),
    importBookings: jest.fn<(args: any) => Promise<any>>(),
    importAttendance: jest.fn<(args: any) => Promise<any>>(),
    importPayments: jest.fn<(args: any) => Promise<any>>(),
    importEvents: jest.fn<(args: any) => Promise<any>>(),
    exportDataset: jest.fn<(args: any) => Promise<any>>(),
  };

  const controller = new ImportExportController(mockService as any);

  const mockReq = {
    tenantId: 'tenant-uuid',
    tenantCode: 'studio-a',
    correlationId: 'corr-1',
    auth: { userId: 'user-1' },
    headers: {},
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockService.importMembers.mockReset();
    mockService.importLeads.mockReset();
    mockService.importClasses.mockReset();
    mockService.importMemberships.mockReset();
    mockService.importBookings.mockReset();
    mockService.importAttendance.mockReset();
    mockService.importPayments.mockReset();
    mockService.importEvents.mockReset();
    mockService.exportDataset.mockReset();
  });

  describe('importMembers', () => {
    it('calls service with JSON rows', async () => {
      mockService.importMembers.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importMembers(mockReq, undefined, { rows: [{ name: 'Test', email: 'test@example.com' }] });
      expect(mockService.importMembers).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ name: 'Test', email: 'test@example.com' }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });

    it('passes dryRun flag', async () => {
      mockService.importMembers.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      await controller.importMembers(mockReq, undefined, { rows: [], dryRun: true });
      expect(mockService.importMembers).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'user-1',
        true,
        undefined,
        'skip',
      );
    });

    it('passes idempotency key header', async () => {
      mockService.importMembers.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const req = { ...mockReq, headers: { 'idempotency-key': 'key-123' } };
      await controller.importMembers(req, undefined, { rows: [] });
      expect(mockService.importMembers).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        'user-1',
        false,
        'key-123',
        'skip',
      );
    });

    it('throws when no rows or file provided', async () => {
      expect(() => controller.importMembers(mockReq, undefined, {})).toThrow();
    });
  });

  describe('importLeads', () => {
    it('calls service with JSON rows', async () => {
      mockService.importLeads.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importLeads(mockReq, undefined, { rows: [{ name: 'Test', email: 'test@example.com' }] });
      expect(mockService.importLeads).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ name: 'Test', email: 'test@example.com' }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('importClasses', () => {
    it('calls service with JSON rows', async () => {
      mockService.importClasses.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importClasses(mockReq, undefined, { rows: [{ name: 'Test', date: '2026-01-01', startTime: '09:00', trainer: 'T1' }] });
      expect(mockService.importClasses).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ name: 'Test', date: '2026-01-01', startTime: '09:00', trainer: 'T1' }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });

    it('denies class imports for front desk users', async () => {
      const req = { ...mockReq, auth: { userId: 'user-1', roles: ['front_desk'] } };
      expect(() =>
        controller.importClasses(req, undefined, { rows: [{ name: 'Test', date: '2026-01-01', startTime: '09:00', trainer: 'T1' }] }),
      ).toThrow('Front desk users cannot import class schedules.');
      expect(mockService.importClasses).not.toHaveBeenCalled();
    });
  });

  describe('importMemberships', () => {
    it('calls service with JSON rows', async () => {
      mockService.importMemberships.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importMemberships(mockReq, undefined, { rows: [{ name: 'Basic', planType: 'Monthly', priceINR: 2500, sessionLimit: 8 }] });
      expect(mockService.importMemberships).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ name: 'Basic', planType: 'Monthly', priceINR: 2500, sessionLimit: 8 }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('importBookings', () => {
    it('calls service with JSON rows', async () => {
      mockService.importBookings.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importBookings(mockReq, undefined, { rows: [{ classId: 'cls-1', memberId: 'mem-1', status: 'Confirmed', bookedAt: '2026-01-01T09:00:00Z' }] });
      expect(mockService.importBookings).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ classId: 'cls-1', memberId: 'mem-1', status: 'Confirmed', bookedAt: '2026-01-01T09:00:00Z' }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('importAttendance', () => {
    it('calls service with JSON rows', async () => {
      mockService.importAttendance.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importAttendance(mockReq, undefined, { rows: [{ bookingId: 'bkg-1', status: 'Present', checkedInAt: '2026-01-01T09:05:00Z' }] });
      expect(mockService.importAttendance).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ bookingId: 'bkg-1', status: 'Present', checkedInAt: '2026-01-01T09:05:00Z' }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('importPayments', () => {
    it('calls service with JSON rows', async () => {
      mockService.importPayments.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importPayments(mockReq, undefined, { rows: [{ ref: 'PAY-001', date: '2026-01-01', memberId: 'mem-1', type: 'Membership', method: 'UPI', status: 'Paid', amount: 4500 }] });
      expect(mockService.importPayments).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ ref: 'PAY-001', date: '2026-01-01', memberId: 'mem-1', type: 'Membership', method: 'UPI', status: 'Paid', amount: 4500 }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('importEvents', () => {
    it('calls service with JSON rows', async () => {
      mockService.importEvents.mockResolvedValue({ created: 1, updated: 0, skipped: 0, failed: 0, errors: [] });
      const result = await controller.importEvents(mockReq, undefined, { rows: [{ title: 'Summer Workshop', category: 'Workshop', startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-01T12:00:00Z', venue: 'Studio A', capacity: 20 }] });
      expect(mockService.importEvents).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        [{ title: 'Summer Workshop', category: 'Workshop', startAt: '2026-06-01T10:00:00Z', endAt: '2026-06-01T12:00:00Z', venue: 'Studio A', capacity: 20 }],
        'user-1',
        false,
        undefined,
        'skip',
      );
      expect(result.created).toBe(1);
    });
  });

  describe('exportDataset', () => {
    it('calls service with dataset and query', async () => {
      mockService.exportDataset.mockResolvedValue({ data: [], count: 0, format: 'json' });
      const result = await controller.exportDataset(mockReq, { dataset: 'members', page: 1, limit: 50 }, 'members');
      expect(mockService.exportDataset).toHaveBeenCalledWith(
        { tenantId: 'tenant-uuid', tenantCode: 'studio-a', correlationId: 'corr-1' },
        { dataset: 'members', page: 1, limit: 50 },
        'user-1',
      );
      expect(result.format).toBe('json');
    });
  });
});
