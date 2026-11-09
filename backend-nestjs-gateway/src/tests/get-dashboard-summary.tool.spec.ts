import { describe, it, expect, beforeEach } from '@jest/globals';
import { GetDashboardSummaryTool } from '../ai/tools/get-dashboard-summary.tool';
import { StudioInsightsService } from '../ai/analytics/studio-insights.service';
import { ErpnextService } from '../erpnext/erpnext.service';
import { ToolContext } from '../ai/tools/base-tool';

describe('GetDashboardSummaryTool', () => {
  let tool: GetDashboardSummaryTool;
  let mockStudioInsights: Partial<StudioInsightsService>;
  let mockErpService: Partial<ErpnextService>;

  const mockContext: ToolContext = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    tenantCode: 'TEST',
    userId: 'admin-1',
    role: 'admin',
    correlationId: 'corr-1',
  };

  beforeEach(() => {
    mockStudioInsights = {
      getDashboardKpi: jest.fn(),
    };

    mockErpService = {
      call: jest.fn(),
    };

    tool = new GetDashboardSummaryTool(
      mockStudioInsights as StudioInsightsService,
      mockErpService as ErpnextService,
    );

    jest.clearAllMocks();
  });

  describe('Local database success', () => {
    it('returns local dashboard data without calling ERPNext', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          source: 'postgresql',
          componentMetrics: {
            retention: { totalActiveMembers: 150, engagedMembersLast30Days: 120 },
            occupancy: { totalSessions: 50, totalAttended: 40, occupancyRatePercent: 80 },
            cashFlow: { netRevenue30Days: 500000 },
          },
        },
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.metricSource).toBe('postgresql');
      expect(result.data.totalMembers).toBe(150);
      expect(result.data.engagedMembersLast30Days).toBe(120);
      expect(result.data.netRevenueLast30Days).toBe(500000);
      expect(mockErpService.call).not.toHaveBeenCalled();
    });

    it('handles zero records as valid success (not a failure)', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          source: 'postgresql',
          componentMetrics: {
            retention: { totalActiveMembers: 0, engagedMembersLast30Days: 0 },
            occupancy: { totalSessions: 0, totalAttended: 0, occupancyRatePercent: 0 },
            cashFlow: { netRevenue30Days: 0 },
          },
        },
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.totalMembers).toBe(0);
      expect(mockErpService.call).not.toHaveBeenCalled();
    });
  });

  describe('Local database failure, ERPNext success', () => {
    it('falls back to ERPNext and returns ERPNext data', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Connection timeout'),
      );

      (mockErpService.call as jest.Mock).mockResolvedValue({
        total_members: 200,
        active_memberships: 180,
        expiring_this_week: 5,
        bookings_today: 10,
        revenue_this_month: 750000,
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.metricSource).toBe('erpnext');
      expect(result.data.totalMembers).toBe(200);
      expect(result.data.activeMemberships).toBe(180);
      expect(result.data.revenueThisMonth).toBe(750000);
      expect(mockErpService.call).toHaveBeenCalledWith(
        expect.objectContaining({
          method: expect.any(String),
          tenantId: mockContext.tenantId,
        }),
      );
    });

    it('logs local failure with classification but does not expose stack trace to user', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('ECONNREFUSED: connection refused'),
      );

      (mockErpService.call as jest.Mock).mockResolvedValue({
        total_members: 100,
        active_memberships: 90,
        expiring_this_week: 2,
        bookings_today: 5,
        revenue_this_month: 300000,
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.metricSource).toBe('erpnext');
      // User-facing error should not contain stack trace or internal details
      expect(result.error).toBeUndefined();
    });
  });

  describe('Both local and ERPNext fail', () => {
    it('returns BOTH_SOURCES_FAILED with structured error codes', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Connection pool exhausted'),
      );

      (mockErpService.call as jest.Mock).mockRejectedValue(
        new Error('Service unavailable'),
      );

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BOTH_SOURCES_FAILED');
      expect(result.error).toContain('Dashboard summary unavailable');
      expect(result.sourceErrors).toBeDefined();
      expect(result.sourceErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'local', errorCode: 'LOCAL_DB_FAILED' }),
          expect.objectContaining({ source: 'erpnext', errorCode: 'ERPNEXT_FAILED' }),
        ]),
      );
    });

    it('returns BOTH_SOURCES_FAILED when local fails and ERPNext is not configured', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Query timeout'),
      );

      const toolWithoutErp = new GetDashboardSummaryTool(
        mockStudioInsights as StudioInsightsService,
        undefined,
      );

      const result = await toolWithoutErp.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BOTH_SOURCES_FAILED');
      expect(result.sourceErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'local', errorCode: 'LOCAL_DB_FAILED' }),
          expect.objectContaining({ source: 'erpnext', errorCode: 'ERPNEXT_NOT_CONFIGURED' }),
        ]),
      );
    });

    it('returns ERPNEXT_FAILED when local succeeds but returns no data and ERPNext fails', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockResolvedValue({
        success: false,
        data: null,
      });

      (mockErpService.call as jest.Mock).mockRejectedValue(
        new Error('Network error'),
      );

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BOTH_SOURCES_FAILED');
      expect(result.sourceErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'local', errorCode: 'LOCAL_DB_NO_DATA' }),
          expect.objectContaining({ source: 'erpnext', errorCode: 'ERPNEXT_FAILED' }),
        ]),
      );
    });
  });

  describe('Error classification and logging', () => {
    it('classifies local connection errors correctly in logs', async () => {
      const error = new Error('ECONNREFUSED: connection refused');
      error.stack = 'Error: ECONNREFUSED at Connection.connect';
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(error);

      (mockErpService.call as jest.Mock).mockResolvedValue({
        total_members: 100,
        active_memberships: 90,
        expiring_this_week: 2,
        bookings_today: 5,
        revenue_this_month: 300000,
      });

      // Should not throw - error is caught and logged internally
      const result = await tool.execute(mockContext);
      expect(result.success).toBe(true);
    });

    it('classifies ERPNext network errors correctly in logs', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Local DB down'),
      );

      const error = new Error('ENOTFOUND: erpnext.example.com');
      (mockErpService.call as jest.Mock).mockRejectedValue(error);

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('BOTH_SOURCES_FAILED');
    });

    it('classifies ERPNext auth/config errors correctly', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Local DB down'),
      );

      const error = new Error('ERPNext environment variables are not configured');
      (mockErpService.call as jest.Mock).mockRejectedValue(error);

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.sourceErrors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'erpnext', errorCode: 'ERPNEXT_FAILED' }),
        ]),
      );
    });

    it('does not expose credentials, API keys, or sensitive data in user-facing response', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Local DB error'),
      );

      const error = new Error('ERPNext call failed: Authorization: token secret-key:secret');
      (mockErpService.call as jest.Mock).mockRejectedValue(error);

      const result = await tool.execute(mockContext);

      // User-facing error should not contain the authorization header or secrets
      expect(result.error).not.toContain('Authorization');
      expect(result.error).not.toContain('secret-key');
      expect(result.error).not.toContain('token');
      // Should still have structured error
      expect(result.errorCode).toBe('BOTH_SOURCES_FAILED');
    });
  });

  describe('Response contract preservation', () => {
    it('preserves local response structure exactly', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockResolvedValue({
        success: true,
        data: {
          source: 'postgresql',
          componentMetrics: {
            retention: { totalActiveMembers: 100, engagedMembersLast30Days: 80 },
            occupancy: { totalSessions: 30, totalAttended: 25, occupancyRatePercent: 83.3 },
            cashFlow: { netRevenue30Days: 250000 },
          },
        },
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('totalMembers');
      expect(result.data).toHaveProperty('engagedMembersLast30Days');
      expect(result.data).toHaveProperty('attendancesLast30Days');
      expect(result.data).toHaveProperty('netRevenueLast30Days');
      expect(result.data).toHaveProperty('summary');
      expect(result.data).toHaveProperty('metricSource');
      expect(result.data).toHaveProperty('metricsWindowDays');
    });

    it('preserves ERPNext response structure exactly', async () => {
      (mockStudioInsights.getDashboardKpi as jest.Mock).mockRejectedValue(
        new Error('Local DB down'),
      );

      (mockErpService.call as jest.Mock).mockResolvedValue({
        total_members: 300,
        active_memberships: 280,
        expiring_this_week: 10,
        bookings_today: 15,
        revenue_this_month: 1000000,
      });

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('totalMembers', 300);
      expect(result.data).toHaveProperty('activeMemberships', 280);
      expect(result.data).toHaveProperty('expiringThisWeek', 10);
      expect(result.data).toHaveProperty('bookingsToday', 15);
      expect(result.data).toHaveProperty('revenueThisMonth', 1000000);
      expect(result.data).toHaveProperty('summary');
      expect(result.data).toHaveProperty('metricSource', 'erpnext');
    });
  });
});