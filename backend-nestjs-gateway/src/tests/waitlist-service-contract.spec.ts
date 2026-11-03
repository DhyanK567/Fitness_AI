import { describe, it, expect, beforeEach } from '@jest/globals';
import { WaitlistService } from '../ai/operations/waitlist.service';
import { ErpnextService } from '../erpnext/erpnext.service';
import { ToolContext } from '../ai/tools/base-tool';

describe('WaitlistService - Contract Tests', () => {
  let service: WaitlistService;
  let mockErpService: Partial<ErpnextService>;

  const mockContext: ToolContext = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    userId: 'admin-1',
    role: 'admin',
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    mockErpService = {
      call: jest.fn(),
    };

    service = new WaitlistService(mockErpService as ErpnextService);
    jest.clearAllMocks();
  });

  describe('Argument mapping to Frappe manage_waitlist', () => {
    it('maps view action with sessionId to session_id', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({
        waitlist: [{ name: 'BK-001', member: 'MEM-001', member_name: 'John Doe', phone: '+1234567890', creation: '2024-01-01' }],
      });

      const result = await service.manageWaitlist(mockContext, {
        action: 'view',
        sessionId: 'WS-SES-001',
      });

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
          body: expect.objectContaining({
            action: 'view',
            session_id: 'WS-SES-001',
          }),
        }),
      );
    });

    it('maps promote action with sessionId and bookingId to session_id and booking_id', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({
        promoted: true,
        booking_id: 'WS-BK-001',
        status: 'Confirmed',
      });

      const result = await service.manageWaitlist(mockContext, {
        action: 'promote',
        sessionId: 'WS-SES-001',
        bookingId: 'WS-BK-001',
      });

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
          body: expect.objectContaining({
            action: 'promote',
            session_id: 'WS-SES-001',
            booking_id: 'WS-BK-001',
          }),
        }),
      );
    });

    it('maps notify action with sessionId and notifyCount', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({
        notified: 2,
        entries: [
          { name: 'WS-BK-001', member: 'MEM-001', member_name: 'John Doe', phone: '+1234567890' },
          { name: 'WS-BK-002', member: 'MEM-002', member_name: 'Jane Smith', phone: '+0987654321' },
        ],
      });

      const result = await service.manageWaitlist(mockContext, {
        action: 'notify',
        sessionId: 'WS-SES-001',
        notifyCount: 3,
      });

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
          body: expect.objectContaining({
            action: 'notify',
            session_id: 'WS-SES-001',
            notify_count: 3,
          }),
        }),
      );
    });

    it('maps remove action with bookingId', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({
        removed: true,
        booking_id: 'WS-BK-001',
      });

      const result = await service.manageWaitlist(mockContext, {
        action: 'remove',
        bookingId: 'WS-BK-001',
      });

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
          body: expect.objectContaining({
            action: 'remove',
            booking_id: 'WS-BK-001',
          }),
        }),
      );
    });

    it('maps clear_expired action without additional arguments', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({
        cleared: 5,
      });

      const result = await service.manageWaitlist(mockContext, {
        action: 'clear_expired',
      });

      expect(result.success).toBe(true);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
          body: expect.objectContaining({
            action: 'clear_expired',
          }),
        }),
      );
    });
  });

  describe('Tenant context propagation', () => {
    it('passes tenantId from context to ERP call', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({ waitlist: [] });

      await service.manageWaitlist(mockContext, { action: 'view', sessionId: 'WS-SES-001' });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: '11111111-1111-1111-1111-111111111111',
        }),
      );
    });

    it('passes correlationId from context to ERP call', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({ waitlist: [] });

      await service.manageWaitlist(mockContext, { action: 'view', sessionId: 'WS-SES-001' });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-1',
        }),
      );
    });
  });

  describe('ERP method name', () => {
    it('uses the correct Frappe method name', async () => {
      (mockErpService.call as jest.Mock).mockResolvedValue({ waitlist: [] });

      await service.manageWaitlist(mockContext, { action: 'view', sessionId: 'WS-SES-001' });

      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'wellness_studio.api.operations.manage_waitlist',
        }),
      );
    });
  });

  describe('Error handling', () => {
    it('returns failure when ERP call fails', async () => {
      (mockErpService.call as jest.Mock).mockRejectedValue(new Error('ERP connection timeout'));

      const result = await service.manageWaitlist(mockContext, { action: 'view', sessionId: 'WS-SES-001' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('ERP connection timeout');
    });
  });
});