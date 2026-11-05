import { Injectable, Logger, Optional } from '@nestjs/common';
import { ERP_METHODS } from '@wsos/erp-methods';
import { ToolContext } from './base-tool';
import { StudioInsightsService } from '../analytics/studio-insights.service';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface ErpMemberListResponse {
  members: Array<{ id: string; status?: string; [key: string]: any }>;
}

interface DashboardErrorDetails {
  source: 'local' | 'erpnext';
  errorCode: string;
  message: string;
  // Internal detail for logging only - never exposed to user
  internalDetail?: string;
}

@Injectable()
export class GetDashboardSummaryTool {
  private readonly logger = new Logger(GetDashboardSummaryTool.name);

  constructor(
    private readonly studioInsightsService: StudioInsightsService,
    @Optional() private readonly erpService?: ErpnextService,
  ) {}

  async execute(context: ToolContext): Promise<any> {
    const errors: DashboardErrorDetails[] = [];

    // Try local database first (StudioInsightsService)
    try {
      const localResult = await this.studioInsightsService.getDashboardKpi(context);
      if (localResult.success && localResult.data) {
        const metrics = localResult.data.componentMetrics;
        const totalMembers = metrics?.retention?.totalActiveMembers ?? 0;
        const engagedMembers = metrics?.retention?.engagedMembersLast30Days ?? 0;
        const sessions = metrics?.occupancy?.totalSessions ?? 0;
        const attendances = metrics?.occupancy?.totalAttended ?? 0;
        const occupancyRate = metrics?.occupancy?.occupancyRatePercent ?? 0;
        const netRevenue = metrics?.cashFlow?.netRevenue30Days ?? 0;

        return {
          success: true,
          data: {
            totalMembers,
            activeMemberships: null,
            expiringThisWeek: null,
            bookingsToday: null,
            revenueThisMonth: null,
            engagedMembersLast30Days: engagedMembers,
            attendancesLast30Days: attendances,
            netRevenueLast30Days: netRevenue,
            summary: `Dashboard (last 30 days): ${totalMembers} active members, ${sessions} eligible sessions, ${occupancyRate}% occupancy, ${attendances} verified attendances, ${engagedMembers} engaged members, \u20b9${netRevenue} net revenue`,
            metricSource: localResult.data.source ?? 'postgresql',
            metricsWindowDays: 30,
          },
        };
      }
      // Local query succeeded but returned no data - treat as unavailable
      errors.push({
        source: 'local',
        errorCode: 'LOCAL_DB_NO_DATA',
        message: 'Local database query returned no dashboard data',
        internalDetail: 'getDashboardKpi returned success: false or data: null',
      });
    } catch (localError) {
      const errorMessage = localError instanceof Error ? localError.message : String(localError);
      const errorStack = localError instanceof Error ? localError.stack : undefined;

      // Classify the error for internal logging
      const classification = this.classifyLocalError(localError);

      this.logger.error(
        `Local dashboard KPI failed [${classification}]: ${errorMessage}`,
        errorStack,
      );

      errors.push({
        source: 'local',
        errorCode: 'LOCAL_DB_FAILED',
        message: 'Local database query failed',
        internalDetail: `${classification}: ${errorMessage}`,
      });
    }

    // Fallback to ERPNext
    try {
      if (this.erpService) {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          userId: context.userId,
          role: context.role,
          method: ERP_METHODS.REPORT_DASHBOARD_SUMMARY,
          body: {},
        });
        if (result && typeof result === 'object') {
          const data = result;
          return {
            success: true,
            data: {
              totalMembers: data?.total_members ?? 0,
              activeMemberships: data?.active_memberships ?? 0,
              expiringThisWeek: data?.expiring_this_week ?? 0,
              bookingsToday: data?.bookings_today ?? 0,
              revenueThisMonth: data?.revenue_this_month ?? 0,
              summary: `Dashboard: ${data?.total_members ?? 0} members, ${data?.active_memberships ?? 0} active memberships, ${data?.bookings_today ?? 0} bookings today, \u20b9${data?.revenue_this_month ?? 0} revenue this month`,
              metricSource: 'erpnext',
            },
          };
        }
        // ERP returned unexpected response format
        errors.push({
          source: 'erpnext',
          errorCode: 'ERPNEXT_INVALID_RESPONSE',
          message: 'ERPNext returned an unexpected response format',
          internalDetail: `ERPNext response was not an object: ${typeof result}`,
        });
      } else {
        errors.push({
          source: 'erpnext',
          errorCode: 'ERPNEXT_NOT_CONFIGURED',
          message: 'ERPNext service is not configured',
          internalDetail: 'ErpnextService not injected',
        });
      }
    } catch (erpError) {
      const errorMessage = erpError instanceof Error ? erpError.message : String(erpError);
      const errorStack = erpError instanceof Error ? erpError.stack : undefined;

      // Classify the ERPNext error
      const classification = this.classifyErpError(erpError);

      this.logger.error(
        `ERPNext dashboard fallback failed [${classification}]: ${errorMessage}`,
        errorStack,
      );

      errors.push({
        source: 'erpnext',
        errorCode: 'ERPNEXT_FAILED',
        message: 'ERPNext dashboard query failed',
        internalDetail: `${classification}: ${errorMessage}`,
      });
    }

    // Both sources failed - return structured error
    const hasLocalError = errors.some((e) => e.source === 'local');
    const hasErpError = errors.some((e) => e.source === 'erpnext');

    let finalErrorCode = 'BOTH_SOURCES_FAILED';
    if (hasLocalError && !hasErpError) finalErrorCode = 'LOCAL_DB_FAILED';
    if (!hasLocalError && hasErpError) finalErrorCode = 'ERPNEXT_FAILED';

    // Build user-facing message without internal details
    const userMessages = errors
      .map((e) => {
        switch (e.errorCode) {
          case 'LOCAL_DB_FAILED':
            return 'Local database is temporarily unavailable';
          case 'LOCAL_DB_NO_DATA':
            return 'Local database returned no dashboard data';
          case 'ERPNEXT_FAILED':
            return 'ERPNext service is temporarily unavailable';
          case 'ERPNEXT_NOT_CONFIGURED':
            return 'ERPNext integration is not configured';
          case 'ERPNEXT_INVALID_RESPONSE':
            return 'ERPNext returned an invalid response';
          default:
            return 'Dashboard data source unavailable';
        }
      })
      .join('; ');

    return {
      success: false,
      error: `Dashboard summary unavailable: ${userMessages}`,
      errorCode: finalErrorCode,
      // Include source-specific error codes for programmatic handling
      sourceErrors: errors.map((e) => ({
        source: e.source,
        errorCode: e.errorCode,
      })),
    };
  }

  /**
   * Classify local database errors for logging and diagnostics.
   * Does not expose sensitive information.
   */
  private classifyLocalError(error: unknown): string {
    if (!(error instanceof Error)) return 'UNKNOWN_ERROR';

    const message = error.message.toLowerCase();

    // Connection/pool errors
    if (
      message.includes('connect') ||
      message.includes('connection') ||
      message.includes('pool') ||
      message.includes('timeout') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT')
    ) {
      return 'CONNECTION_ERROR';
    }

    // RLS / tenant context errors
    if (
      message.includes('tenant') ||
      message.includes('rls') ||
      message.includes('policy') ||
      message.includes('app.tenant_id') ||
      message.includes('current_tenant')
    ) {
      return 'TENANT_CONTEXT_ERROR';
    }

    // Query syntax / schema errors
    if (
      message.includes('syntax') ||
      message.includes('column') ||
      message.includes('relation') ||
      message.includes('does not exist') ||
      message.includes('undefined')
    ) {
      return 'SCHEMA_ERROR';
    }

    // Permission errors
    if (
      message.includes('permission') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return 'PERMISSION_ERROR';
    }

    // Prisma-specific
    if (message.includes('prisma') || message.includes('p100') || message.includes('p200')) {
      return 'PRISMA_ERROR';
    }

    return 'QUERY_ERROR';
  }

  /**
   * Classify ERPNext errors for logging and diagnostics.
   * Does not expose sensitive information.
   */
  private classifyErpError(error: unknown): string {
    if (!(error instanceof Error)) return 'UNKNOWN_ERROR';

    const message = error.message.toLowerCase();

    // Network / DNS errors
    if (
      message.includes('network') ||
      message.includes('dns') ||
      message.includes('ENOTFOUND') ||
      message.includes('EAI_AGAIN') ||
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('timeout')
    ) {
      return 'NETWORK_ERROR';
    }

    // HTTP status-based classification (from ErpnextService error mapping)
    if (
      message.includes('404') ||
      message.includes('method is unavailable') ||
      message.includes('unavailable')
    ) {
      return 'SERVICE_UNAVAILABLE';
    }

    if (message.includes('401') || message.includes('403') || message.includes('forbidden') || message.includes('unauthorized')) {
      return 'AUTH_ERROR';
    }

    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return 'SERVER_ERROR';
    }

    if (message.includes('validation') || message.includes('bad request') || message.includes('400')) {
      return 'VALIDATION_ERROR';
    }

    // Configuration errors
    if (
      message.includes('environment') ||
      message.includes('not configured') ||
      message.includes('api key') ||
      message.includes('api secret') ||
      message.includes('base url')
    ) {
      return 'CONFIG_ERROR';
    }

    return 'HTTP_ERROR';
  }
}