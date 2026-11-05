import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { ToolContext, ToolResult } from '../tools/base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

export interface RevenueTrendsArgs {
  periodDays?: number;
  interval?: 'daily' | 'weekly' | 'monthly';
  referenceDate?: string | Date;
}

export interface RevenueSummaryArgs {
  periodMonths?: number;
  referenceDate?: string | Date;
}

export interface ChurnRiskModelingArgs {
  inactivityDays?: number;
  referenceDate?: string | Date;
}

export interface DashboardKpiArgs {
  referenceDate?: string | Date;
}

@Injectable()
export class StudioInsightsService {
  private readonly logger = new Logger(StudioInsightsService.name);

  constructor(
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly erpService?: ErpnextService,
    @Optional() private readonly auditOutbox?: AuditOutboxService,
  ) {}

  private static readonly TENANT_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private validateContext(context: ToolContext): ToolResult | null {
    if (
      !context?.tenantId ||
      typeof context.tenantId !== 'string' ||
      !StudioInsightsService.TENANT_UUID_REGEX.test(context.tenantId.trim())
    ) {
      return {
        success: false,
        error: 'A canonical tenant UUID is required for tenant-scoped database access.',
      };
    }
    if (context.role && !['owner', 'admin'].includes(context.role)) {
      return {
        success: false,
        error: `Access denied. Role '${context.role}' lacks permission for Studio Insights.`,
      };
    }
    return null;
  }

  /**
   * Action: revenue-trends
   * 30/60/90-day time-series aggregation of settled billing with period-over-period variance.
   */
  async getRevenueTrends(
    context: ToolContext,
    args: RevenueTrendsArgs = {},
  ): Promise<ToolResult> {
    const contextError = this.validateContext(context);
    if (contextError) {
      return contextError;
    }

    const periodDays = args.periodDays !== undefined ? Number(args.periodDays) : 30;
    if (![30, 60, 90].includes(periodDays)) {
      return {
        success: false,
        error: `Unsupported periodDays '${periodDays}'. Supported windows are 30, 60, and 90 days.`,
      };
    }

    const validIntervals = ['daily', 'weekly', 'monthly'];
    const interval = args.interval || (periodDays === 30 ? 'daily' : 'weekly');
    if (!validIntervals.includes(interval)) {
      return {
        success: false,
        error: `Unsupported interval '${interval}'. Supported intervals are 'daily', 'weekly', 'monthly'.`,
      };
    }

    const now = args.referenceDate ? new Date(args.referenceDate) : new Date();

    if (this.prismaService) {
      try {
        const result = await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const currentStart = new Date(now.getTime() - periodDays * 86400000);
          const priorStart = new Date(currentStart.getTime() - periodDays * 86400000);

          const payments = await tx.studioPayment.findMany({
            where: {
              tenantId: context.tenantId,
              status: { in: ['Paid', 'Completed', 'Settled'] },
              date: { gte: priorStart, lte: now },
            },
            orderBy: { date: 'asc' },
          });

          const currentPayments = payments.filter((p: any) => new Date(p.date) >= currentStart);
          const priorPayments = payments.filter((p: any) => new Date(p.date) < currentStart);

          const currentGross = currentPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
          const currentRefunds = currentPayments.reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0);
          const currentNet = currentGross - currentRefunds;

          const priorGross = priorPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
          const priorRefunds = priorPayments.reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0);
          const priorNet = priorGross - priorRefunds;

          const netDelta = currentNet - priorNet;

          let growthPercent: number | null = null;
          let growthStatus: 'calculated' | 'baseline_zero_non_comparable' | 'no_activity' | 'negative_baseline' = 'calculated';

          if (priorNet > 0) {
            growthPercent = Number((((currentNet - priorNet) / priorNet) * 100).toFixed(1));
            growthStatus = 'calculated';
          } else if (priorNet < 0) {
            growthPercent = Number((((currentNet - priorNet) / Math.abs(priorNet)) * 100).toFixed(1));
            growthStatus = 'negative_baseline';
          } else {
            // priorNet === 0: baseline is zero, percentage division is mathematically non-comparable
            growthPercent = null;
            growthStatus = currentNet === 0 ? 'no_activity' : 'baseline_zero_non_comparable';
          }

          const trendDirection = netDelta > 0 ? 'up' : (netDelta < 0 ? 'down' : 'flat');

          // Group current payments by interval
          const bucketMap = new Map<string, { gross: number; refunds: number; count: number }>();

          for (const p of currentPayments) {
            const pDate = new Date(p.date);
            let bucketKey: string;

            if (interval === 'daily') {
              bucketKey = pDate.toISOString().slice(0, 10);
            } else if (interval === 'monthly') {
              bucketKey = pDate.toISOString().slice(0, 7);
            } else {
              // weekly: start of week (Monday)
              const day = pDate.getUTCDay();
              const diff = day === 0 ? -6 : 1 - day;
              const monday = new Date(pDate.getTime() + diff * 86400000);
              bucketKey = monday.toISOString().slice(0, 10);
            }

            const curr = bucketMap.get(bucketKey) || { gross: 0, refunds: 0, count: 0 };
            curr.gross += (p.amount || 0);
            curr.refunds += (p.refundedAmount || 0);
            curr.count += 1;
            bucketMap.set(bucketKey, curr);
          }

          const trends = Array.from(bucketMap.entries())
            .map(([date, data]) => ({
              date,
              grossRevenue: Number(data.gross.toFixed(2)),
              refunds: Number(data.refunds.toFixed(2)),
              netRevenue: Number((data.gross - data.refunds).toFixed(2)),
              transactionCount: data.count,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

          return {
            success: true,
            data: {
              periodDays,
              interval,
              startDate: currentStart.toISOString().slice(0, 10),
              endDate: now.toISOString().slice(0, 10),
              currency: 'INR',
              currentPeriod: {
                grossRevenue: Number(currentGross.toFixed(2)),
                refunds: Number(currentRefunds.toFixed(2)),
                netRevenue: Number(currentNet.toFixed(2)),
                transactionCount: currentPayments.length,
              },
              previousPeriod: {
                grossRevenue: Number(priorGross.toFixed(2)),
                refunds: Number(priorRefunds.toFixed(2)),
                netRevenue: Number(priorNet.toFixed(2)),
                transactionCount: priorPayments.length,
              },
              variance: {
                netRevenueDelta: Number(netDelta.toFixed(2)),
                growthPercent,
                growthStatus,
                trendDirection,
              },
              trends,
              source: 'postgresql',
            },
          };
        });

        return result;
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for revenue trends failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.REPORT_REVENUE_TRENDS || 'wellness_studio.api.reports.revenue_trends',
          body: args as unknown as Record<string, unknown>,
        });
        const normalized = this.normalizeRevenueTrendsFromErp(result, args, now);
        return { success: true, data: normalized };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get revenue trends';
        this.logger.error(`getRevenueTrends ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for revenue trends' };
  }

  /**
   * Action: revenue-summary
   * Executive revenue snapshot: Gross billing, refunds, net collections, active members, ARPU, and substantiated recurring status.
   */
  async getRevenueSummary(
    context: ToolContext,
    args: RevenueSummaryArgs = {},
  ): Promise<ToolResult> {
    const contextError = this.validateContext(context);
    if (contextError) {
      return contextError;
    }

    const periodMonths = args.periodMonths !== undefined ? Math.max(1, Math.min(Number(args.periodMonths), 12)) : 1;
    const now = args.referenceDate ? new Date(args.referenceDate) : new Date();

    if (this.prismaService) {
      try {
        const result = await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const lookbackDays = periodMonths * 30;
          const startDate = new Date(now.getTime() - lookbackDays * 86400000);

          const [payments, activeMembersCount] = await Promise.all([
            tx.studioPayment.findMany({
              where: {
                tenantId: context.tenantId,
                status: { in: ['Paid', 'Completed', 'Settled'] },
                date: { gte: startDate, lte: now },
              },
            }),
            tx.studioMember.count({
              where: {
                tenantId: context.tenantId,
                status: { equals: 'Active', mode: 'insensitive' },
              },
            }),
          ]);

          const grossBilling = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
          const refundTotals = payments.reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0);
          const netCollections = grossBilling - refundTotals;

          const arpu = activeMembersCount > 0
            ? Number((netCollections / activeMembersCount).toFixed(2))
            : 0;

          const estimatedMonthlyBilling = Number((netCollections / periodMonths).toFixed(2));

          return {
            success: true,
            data: {
              currency: 'INR',
              reportingWindow: `${lookbackDays}_days`,
              startDate: startDate.toISOString().slice(0, 10),
              endDate: now.toISOString().slice(0, 10),
              grossBilling: Number(grossBilling.toFixed(2)),
              refundTotals: Number(refundTotals.toFixed(2)),
              netCollections: Number(netCollections.toFixed(2)),
              totalSettledTransactions: payments.length,
              activeMembersCount,
              activeMembersDefinition: "Studio members with status = 'Active' under current tenant",
              arpu,
              arpuPeriod: `${lookbackDays}_days`,
              arpuDenominator: `Active members count (${activeMembersCount})`,
              mrr: {
                status: 'unsubstantiated',
                value: null,
                reason: 'Schema does not track automated recurring subscription renewal schedules or contractual billing commitments on StudioMember.',
              },
              arr: {
                status: 'unsubstantiated',
                value: null,
                reason: 'ARR cannot be verified without contractual annual recurring commitments.',
              },
              estimatedMonthlyBilling,
              recurringRevenueDisclosure: 'Estimated monthly billing reflects observed net collections over the lookback window; it is not a verified contractual MRR subscription guarantee.',
              source: 'postgresql',
            },
          };
        });

        return result;
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for revenue summary failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.REPORT_REVENUE_SUMMARY || 'wellness_studio.api.reports.revenue_summary',
          body: args as unknown as Record<string, unknown>,
        });
        const normalized = this.normalizeRevenueSummaryFromErp(result, args, now);
        return { success: true, data: normalized };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get revenue summary';
        this.logger.error(`getRevenueSummary ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for revenue summary' };
  }

  /**
   * Action: churn-risk-modeling
   * Analytical cohort identification of active members with verified attendance inactivity over approved window (21 or 30 days).
   */
  async getChurnRiskModeling(
    context: ToolContext,
    args: ChurnRiskModelingArgs = {},
  ): Promise<ToolResult> {
    const contextError = this.validateContext(context);
    if (contextError) {
      return contextError;
    }

    const inactivityDays = args.inactivityDays !== undefined ? Number(args.inactivityDays) : 21;
    if (![21, 30].includes(inactivityDays)) {
      return {
        success: false,
        error: `Unsupported inactivityDays '${inactivityDays}'. Supported windows are 21 and 30 days.`,
      };
    }

    const now = args.referenceDate ? new Date(args.referenceDate) : new Date();

    if (this.prismaService) {
      try {
        const result = await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const activeMembers = await tx.studioMember.findMany({
            where: {
              tenantId: context.tenantId,
              status: { equals: 'Active', mode: 'insensitive' },
            },
          });

          if (activeMembers.length === 0) {
            return {
              success: true,
              data: {
                inactivityWindowDays: inactivityDays,
                totalActiveMembers: 0,
                inactiveMembersCount: 0,
                inactivityRatePercent: 0,
                cohortBreakdown: { low: 0, medium: 0, high: 0, critical: 0 },
                inactiveMembers: [],
                methodology: 'Deterministic attendance recency rule based on verified session check-ins over the lookback window.',
                readOnlyConfirmation: 'Analytical cohort report only. No messaging actions or winback campaigns dispatched.',
                source: 'postgresql',
              },
            };
          }

          const memberIds = activeMembers.map((m: any) => m.id);

          // Query bookings for active members
          const bookings = await tx.studioBooking.findMany({
            where: {
              tenantId: context.tenantId,
              memberId: { in: memberIds },
            },
          });

          const bookingIds = bookings.map((b: any) => b.id);

          // Query attendance records with authoritative attended status
          const attendances = (tx.studioAttendance && bookingIds.length > 0)
            ? await tx.studioAttendance.findMany({
                where: {
                  tenantId: context.tenantId,
                  bookingId: { in: bookingIds },
                  status: { in: ['Present', 'Attended', 'Completed'] },
                },
              })
            : [];

          const bookingMap = new Map<string, any>(bookings.map((b: any) => [b.id, b]));
          const lastVisitMap = new Map<string, Date>();

          // Evidence 1: StudioAttendance with valid status ('Present', 'Attended', 'Completed') <= now
          for (const att of attendances) {
            const booking = bookingMap.get(att.bookingId);
            if (!booking) continue;
            const visitDate = att.checkedInAt
              ? new Date(att.checkedInAt)
              : (att.createdAt ? new Date(att.createdAt) : new Date(booking.bookedAt));

            // Exclude future-dated attendance
            if (visitDate.getTime() <= now.getTime()) {
              const existing = lastVisitMap.get(booking.memberId);
              if (!existing || visitDate.getTime() > existing.getTime()) {
                lastVisitMap.set(booking.memberId, visitDate);
              }
            }
          }

          // Evidence 2: StudioBooking with valid attended status ('Attended', 'Completed') <= now
          for (const b of bookings) {
            if (['Attended', 'Completed'].includes(b.status)) {
              const visitDate = new Date(b.bookedAt);
              if (visitDate.getTime() <= now.getTime()) {
                const existing = lastVisitMap.get(b.memberId);
                if (!existing || visitDate.getTime() > existing.getTime()) {
                  lastVisitMap.set(b.memberId, visitDate);
                }
              }
            }
          }

          const cohorts = { low: 0, medium: 0, high: 0, critical: 0 };
          const memberResults: any[] = [];

          for (const member of activeMembers) {
            const lastVisit = lastVisitMap.get(member.id);
            const daysSinceLastVisit = lastVisit
              ? Math.max(0, Math.floor((now.getTime() - lastVisit.getTime()) / 86400000))
              : null;

            let riskLevel: 'low' | 'medium' | 'high' | 'critical';
            let reason: string;

            if (daysSinceLastVisit === null) {
              riskLevel = 'critical';
              reason = 'No recorded attended sessions since membership activation.';
            } else if (daysSinceLastVisit > 30) {
              riskLevel = 'critical';
              reason = `Severe inactivity: ${daysSinceLastVisit} days since last session.`;
            } else if (daysSinceLastVisit > 21) {
              riskLevel = 'high';
              reason = `High churn risk: ${daysSinceLastVisit} days since last session (>21 day threshold).`;
            } else if (daysSinceLastVisit > 14) {
              riskLevel = 'medium';
              reason = `Moderate inactivity: ${daysSinceLastVisit} days since last session.`;
            } else {
              riskLevel = 'low';
              reason = `Active engagement: last session ${daysSinceLastVisit} days ago.`;
            }

            cohorts[riskLevel]++;

            const isInactiveInWindow = daysSinceLastVisit === null || daysSinceLastVisit >= inactivityDays;

            if (isInactiveInWindow) {
              memberResults.push({
                memberId: member.id,
                name: member.fullName,
                currentPlan: member.plan,
                daysSinceLastVisit,
                lastVisitDate: lastVisit ? lastVisit.toISOString().slice(0, 10) : null,
                riskLevel,
                reason,
              });
            }
          }

          memberResults.sort((a, b) => (b.daysSinceLastVisit ?? 999) - (a.daysSinceLastVisit ?? 999));

          const inactiveMembersCount = memberResults.length;
          const totalActiveMembers = activeMembers.length;
          const inactivityRatePercent = totalActiveMembers > 0
            ? Number(((inactiveMembersCount / totalActiveMembers) * 100).toFixed(1))
            : 0;

          return {
            success: true,
            data: {
              inactivityWindowDays: inactivityDays,
              totalActiveMembers,
              inactiveMembersCount,
              inactivityRatePercent,
              cohortBreakdown: cohorts,
              inactiveMembers: memberResults,
              methodology: 'Deterministic attendance recency rule based on verified session check-ins over the lookback window.',
              readOnlyConfirmation: 'Analytical cohort report only. No messaging actions or winback campaigns dispatched.',
              source: 'postgresql',
            },
          };
        });

        return result;
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for churn risk cohorts failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: (ERP_METHODS as any).GET_CHURN_PREDICTIONS || 'wellness_studio.api.retention.churn_risks',
          body: args as unknown as Record<string, unknown>,
        });
        const normalized = this.normalizeChurnRiskModelingFromErp(result, args);
        return { success: true, data: normalized };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get churn risk cohorts';
        this.logger.error(`getChurnRiskModeling ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for churn risk cohorts' };
  }

  /**
   * Action: dashboard-kpi
   * Defers composite health score/grade pending approved specification; exposes verified component metrics.
   */
  async getDashboardKpi(
    context: ToolContext,
    args: DashboardKpiArgs = {},
  ): Promise<ToolResult> {
    const contextError = this.validateContext(context);
    if (contextError) {
      return contextError;
    }

    const now = args.referenceDate ? new Date(args.referenceDate) : new Date();

    if (this.prismaService) {
      try {
        const result = await this.prismaService.withTenant(context.tenantId, async (tx) => {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

          const [classes, bookings, activeMembers, payments] = await Promise.all([
            tx.studioClass.findMany({
              where: {
                tenantId: context.tenantId,
                date: { gte: thirtyDaysAgo, lte: now },
                status: { notIn: ['Cancelled', 'cancelled', 'Draft'] },
              },
            }),
            tx.studioBooking.findMany({
              where: {
                tenantId: context.tenantId,
                bookedAt: { gte: thirtyDaysAgo, lte: now },
                status: { in: ['Confirmed', 'Attended', 'Completed'] },
              },
            }),
            // Use case-insensitive match for 'Active' status to handle data inconsistencies
            tx.studioMember.findMany({
              where: {
                tenantId: context.tenantId,
                status: { equals: 'Active', mode: 'insensitive' },
              },
            }),
            tx.studioPayment.findMany({
              where: {
                tenantId: context.tenantId,
                status: { in: ['Paid', 'Completed', 'Settled'] },
                date: { gte: thirtyDaysAgo, lte: now },
              },
            }),
          ]);

          // Denominator: exclude cancelled, draft, or future classes
          const eligibleClasses = classes.filter((c: any) => {
            const cDate = new Date(c.date);
            return cDate >= thirtyDaysAgo && cDate <= now && !['Cancelled', 'cancelled', 'Draft'].includes(c.status);
          });
          const totalCapacity = eligibleClasses.reduce((sum: number, c: any) => sum + (c.capacity || 0), 0);
          const eligibleClassIds = new Set(eligibleClasses.map((c: any) => c.id));

          // Eligible bookings matching held sessions
          const eligibleBookings = bookings.filter((b: any) => eligibleClassIds.has(b.classId));
          const eligibleBookingIds = eligibleBookings.map((b: any) => b.id);

          // Find verified attendances for eligible bookings
          const attendances = (tx.studioAttendance && eligibleBookingIds.length > 0)
            ? await tx.studioAttendance.findMany({
                where: {
                  tenantId: context.tenantId,
                  bookingId: { in: eligibleBookingIds },
                  status: { in: ['Present', 'Attended', 'Completed'] },
                },
              })
            : [];

          const attendedBookingIdSet = new Set(attendances.map((a: any) => a.bookingId));

          // Numerator: deduplicate verified attendance per class:member to prevent duplicate inflation
          const attendedClassMemberSet = new Set<string>();

          for (const b of eligibleBookings) {
            const isAttended = ['Attended', 'Completed'].includes(b.status) || attendedBookingIdSet.has(b.id);
            if (isAttended) {
              attendedClassMemberSet.add(`${b.classId}:${b.memberId}`);
            }
          }

          const totalAttended = attendedClassMemberSet.size;
          const occupancyRatePercent = totalCapacity > 0
            ? Number(((totalAttended / totalCapacity) * 100).toFixed(1))
            : 0;

          const engagedMemberIds = new Set(
            eligibleBookings
              .filter((b: any) => ['Attended', 'Completed'].includes(b.status) || attendedBookingIdSet.has(b.id))
              .map((b: any) => b.memberId),
          );
          const totalActiveMembers = activeMembers.length;
          const engagedMembersCount = activeMembers.filter((m: any) => engagedMemberIds.has(m.id)).length;
          const retentionRatePercent = totalActiveMembers > 0
            ? Number(((engagedMembersCount / totalActiveMembers) * 100).toFixed(1))
            : 0;

          const grossBilling = payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);
          const refunds = payments.reduce((sum: number, p: any) => sum + (p.refundedAmount || 0), 0);
          const netRevenue = grossBilling - refunds;

          return {
            success: true,
            data: {
              status: 'deferred_pending_specification',
              message: 'Composite Studio Health Index score and letter grade are deferred pending an approved business specification.',
              compositeScore: null,
              financialHealthGrade: null,
              componentMetrics: {
                occupancy: {
                  totalSessions: eligibleClasses.length,
                  totalCapacity,
                  totalAttended,
                  occupancyRatePercent,
                  denominatorDefinition: 'Sum of capacity for non-cancelled classes within lookback window (<= referenceDate)',
                },
                retention: {
                  totalActiveMembers,
                  engagedMembersLast30Days: engagedMembersCount,
                  retentionRatePercent,
                },
                cashFlow: {
                  grossBilling30Days: Number(grossBilling.toFixed(2)),
                  refunds30Days: Number(refunds.toFixed(2)),
                  netRevenue30Days: Number(netRevenue.toFixed(2)),
                  currency: 'INR',
                },
              },
              source: 'postgresql',
            },
          };
        });

        return result;
      } catch (dbError) {
        this.logger.warn(
          `PostgreSQL query for dashboard KPI failed: ${dbError instanceof Error ? dbError.message : String(dbError)}. Checking ERP fallback.`,
        );
      }
    }

    if (this.erpService) {
      try {
        const result = await this.erpService.call({
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          method: ERP_METHODS.REPORT_DASHBOARD_STATS || 'wellness_studio.api.reports.dashboard_stats',
          body: {},
        });
        const normalized = this.normalizeDashboardKpiFromErp(result);
        return { success: true, data: normalized };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get dashboard KPI';
        this.logger.error(`getDashboardKpi ERP fallback failed:`, error);
        return { success: false, error: errorMessage };
      }
    }

    return { success: false, error: 'No persistence provider available for dashboard KPI' };
  }

  // =========================================================================
  // ERPNext Normalization Helpers
  // =========================================================================

  private normalizeRevenueTrendsFromErp(
    raw: any,
    args: RevenueTrendsArgs,
    now: Date,
  ): any {
    const periodDays = args.periodDays !== undefined ? Number(args.periodDays) : 30;
    const interval = args.interval || (periodDays === 30 ? 'daily' : 'weekly');
    const currentStart = new Date(now.getTime() - periodDays * 86400000);

    const currentPeriodRaw = raw?.current_period || raw?.currentPeriod || {};
    const previousPeriodRaw = raw?.previous_period || raw?.previousPeriod || raw?.prior_period || {};

    const currentGross = Number(currentPeriodRaw.gross_revenue ?? currentPeriodRaw.grossRevenue ?? raw?.total_revenue ?? raw?.revenue_this_month ?? 0);
    const currentRefunds = Number(currentPeriodRaw.refunds ?? currentPeriodRaw.refunded_amount ?? 0);
    const currentNet = Number(currentPeriodRaw.net_revenue ?? currentPeriodRaw.netRevenue ?? (currentGross - currentRefunds));
    const currentTxCount = Number(currentPeriodRaw.transaction_count ?? currentPeriodRaw.transactionCount ?? raw?.transaction_count ?? 0);

    const priorGross = Number(previousPeriodRaw.gross_revenue ?? previousPeriodRaw.grossRevenue ?? raw?.revenue_last_month ?? 0);
    const priorRefunds = Number(previousPeriodRaw.refunds ?? previousPeriodRaw.refunded_amount ?? 0);
    const priorNet = Number(previousPeriodRaw.net_revenue ?? previousPeriodRaw.netRevenue ?? (priorGross - priorRefunds));
    const priorTxCount = Number(previousPeriodRaw.transaction_count ?? previousPeriodRaw.transactionCount ?? 0);

    const netDelta = currentNet - priorNet;

    let growthPercent: number | null = null;
    let growthStatus: 'calculated' | 'baseline_zero_non_comparable' | 'no_activity' | 'negative_baseline' = 'calculated';

    if (priorNet > 0) {
      growthPercent = Number((((currentNet - priorNet) / priorNet) * 100).toFixed(1));
      growthStatus = 'calculated';
    } else if (priorNet < 0) {
      growthPercent = Number((((currentNet - priorNet) / Math.abs(priorNet)) * 100).toFixed(1));
      growthStatus = 'negative_baseline';
    } else {
      growthPercent = null;
      growthStatus = currentNet === 0 ? 'no_activity' : 'baseline_zero_non_comparable';
    }

    const trendDirection = netDelta > 0 ? 'up' : (netDelta < 0 ? 'down' : 'flat');

    const rawTrends = Array.isArray(raw?.trends) ? raw.trends : [];
    const trends = rawTrends.map((t: any) => {
      const g = Number(t.gross_revenue ?? t.grossRevenue ?? t.revenue ?? 0);
      const r = Number(t.refunds ?? t.refunded_amount ?? 0);
      const n = Number(t.net_revenue ?? t.netRevenue ?? (g - r));
      return {
        date: String(t.date || t.period || ''),
        grossRevenue: Number(g.toFixed(2)),
        refunds: Number(r.toFixed(2)),
        netRevenue: Number(n.toFixed(2)),
        transactionCount: Number(t.transaction_count ?? t.transactionCount ?? 0),
      };
    });

    return {
      periodDays,
      interval,
      startDate: String(raw?.start_date || raw?.period_start || currentStart.toISOString().slice(0, 10)),
      endDate: String(raw?.end_date || raw?.period_end || now.toISOString().slice(0, 10)),
      currency: String(raw?.currency || 'INR'),
      currentPeriod: {
        grossRevenue: Number(currentGross.toFixed(2)),
        refunds: Number(currentRefunds.toFixed(2)),
        netRevenue: Number(currentNet.toFixed(2)),
        transactionCount: currentTxCount,
      },
      previousPeriod: {
        grossRevenue: Number(priorGross.toFixed(2)),
        refunds: Number(priorRefunds.toFixed(2)),
        netRevenue: Number(priorNet.toFixed(2)),
        transactionCount: priorTxCount,
      },
      variance: {
        netRevenueDelta: Number(netDelta.toFixed(2)),
        growthPercent,
        growthStatus,
        trendDirection,
      },
      trends,
      source: 'erpnext',
    };
  }

  private normalizeRevenueSummaryFromErp(
    raw: any,
    args: RevenueSummaryArgs,
    now: Date,
  ): any {
    const periodMonths = args.periodMonths !== undefined ? Math.max(1, Math.min(Number(args.periodMonths), 12)) : 1;
    const lookbackDays = periodMonths * 30;
    const startDate = new Date(now.getTime() - lookbackDays * 86400000);

    const grossBilling = Number(raw?.gross_billing ?? raw?.grossBilling ?? raw?.total_revenue ?? raw?.revenue_this_month ?? 0);
    const refundTotals = Number(raw?.refund_totals ?? raw?.refundTotals ?? raw?.refunds ?? 0);
    const netCollections = Number(raw?.net_collections ?? raw?.netCollections ?? (grossBilling - refundTotals));
    const totalSettledTransactions = Number(raw?.total_settled_transactions ?? raw?.totalSettledTransactions ?? raw?.transaction_count ?? 0);
    const activeMembersCount = Number(raw?.active_members_count ?? raw?.activeMembersCount ?? raw?.active_memberships ?? raw?.active_members ?? raw?.total_members ?? 0);

    const arpu = activeMembersCount > 0
      ? Number((netCollections / activeMembersCount).toFixed(2))
      : 0;

    const estimatedMonthlyBilling = Number((netCollections / periodMonths).toFixed(2));

    return {
      currency: String(raw?.currency || 'INR'),
      reportingWindow: `${lookbackDays}_days`,
      startDate: String(raw?.start_date || raw?.period_start || startDate.toISOString().slice(0, 10)),
      endDate: String(raw?.end_date || raw?.period_end || now.toISOString().slice(0, 10)),
      grossBilling: Number(grossBilling.toFixed(2)),
      refundTotals: Number(refundTotals.toFixed(2)),
      netCollections: Number(netCollections.toFixed(2)),
      totalSettledTransactions,
      activeMembersCount,
      activeMembersDefinition: "Studio members with status = 'Active' under current tenant",
      arpu,
      arpuPeriod: `${lookbackDays}_days`,
      arpuDenominator: `Active members count (${activeMembersCount})`,
      mrr: {
        status: 'unsubstantiated',
        value: null,
        reason: 'Schema does not track automated recurring subscription renewal schedules or contractual billing commitments on StudioMember.',
      },
      arr: {
        status: 'unsubstantiated',
        value: null,
        reason: 'ARR cannot be verified without contractual annual recurring commitments.',
      },
      estimatedMonthlyBilling,
      recurringRevenueDisclosure: 'Estimated monthly billing reflects observed net collections over the lookback window; it is not a verified contractual MRR subscription guarantee.',
      source: 'erpnext',
    };
  }

  private normalizeChurnRiskModelingFromErp(
    raw: any,
    args: ChurnRiskModelingArgs,
  ): any {
    const inactivityDays = args.inactivityDays !== undefined ? Number(args.inactivityDays) : 21;
    const totalActiveMembers = Number(raw?.total_active_members ?? raw?.totalActiveMembers ?? 0);
    const inactiveMembersCount = Number(raw?.inactive_members_count ?? raw?.inactiveMembersCount ?? 0);
    const inactivityRatePercent = Number(raw?.inactivity_rate_percent ?? raw?.inactivityRatePercent ?? (
      totalActiveMembers > 0 ? Number(((inactiveMembersCount / totalActiveMembers) * 100).toFixed(1)) : 0
    ));

    const rawCohorts = raw?.cohort_breakdown || raw?.cohortBreakdown || {};
    const cohortBreakdown = {
      low: Number(rawCohorts.low ?? 0),
      medium: Number(rawCohorts.medium ?? 0),
      high: Number(rawCohorts.high ?? 0),
      critical: Number(rawCohorts.critical ?? 0),
    };

    const rawInactive = Array.isArray(raw?.inactive_members)
      ? raw.inactive_members
      : (Array.isArray(raw?.inactiveMembers) ? raw.inactiveMembers : []);

    const inactiveMembers = rawInactive.map((m: any) => ({
      memberId: String(m.member_id ?? m.memberId ?? ''),
      name: String(m.member_name ?? m.name ?? ''),
      currentPlan: String(m.current_plan ?? m.currentPlan ?? m.plan ?? ''),
      daysSinceLastVisit: m.days_since_last_visit !== undefined
        ? (m.days_since_last_visit === null ? null : Number(m.days_since_last_visit))
        : (m.daysSinceLastVisit !== undefined ? m.daysSinceLastVisit : null),
      lastVisitDate: m.last_visit_date ? String(m.last_visit_date) : (m.lastVisitDate ? String(m.lastVisitDate) : null),
      riskLevel: (m.risk_level ?? m.riskLevel ?? 'critical') as 'low' | 'medium' | 'high' | 'critical',
      reason: String(m.reason ?? ''),
    }));

    return {
      inactivityWindowDays: inactivityDays,
      totalActiveMembers,
      inactiveMembersCount,
      inactivityRatePercent,
      cohortBreakdown,
      inactiveMembers,
      methodology: 'Deterministic attendance recency rule based on verified session check-ins over the lookback window.',
      readOnlyConfirmation: 'Analytical cohort report only. No messaging actions or winback campaigns dispatched.',
      source: 'erpnext',
    };
  }

  private normalizeDashboardKpiFromErp(
    raw: any,
  ): any {
    const rawMetrics = raw?.component_metrics || raw?.componentMetrics || {};
    const rawOcc = rawMetrics?.occupancy || raw?.occupancy || {};
    const rawRet = rawMetrics?.retention || raw?.retention || {};
    const rawCash = rawMetrics?.cash_flow || rawMetrics?.cashFlow || raw?.cash_flow || {};

    const totalSessions = Number(rawOcc.total_sessions ?? rawOcc.totalSessions ?? raw?.total_sessions ?? 0);
    const totalCapacity = Number(rawOcc.total_capacity ?? rawOcc.totalCapacity ?? raw?.total_capacity ?? 0);
    const totalAttended = Number(rawOcc.total_attended ?? rawOcc.totalAttended ?? raw?.total_attended ?? raw?.total_attendance ?? 0);
    const occupancyRatePercent = Number(
      rawOcc.occupancy_rate_percent ?? rawOcc.occupancyRatePercent ?? (
        totalCapacity > 0 ? Number(((totalAttended / totalCapacity) * 100).toFixed(1)) : 0
      )
    );

    const totalActiveMembers = Number(rawRet.total_active_members ?? rawRet.totalActiveMembers ?? raw?.total_members ?? 0);
    const engagedMembersLast30Days = Number(rawRet.engaged_members_last_30_days ?? rawRet.engagedMembersLast30Days ?? 0);
    const retentionRatePercent = Number(
      rawRet.retention_rate_percent ?? rawRet.retentionRatePercent ?? (
        totalActiveMembers > 0 ? Number(((engagedMembersLast30Days / totalActiveMembers) * 100).toFixed(1)) : 0
      )
    );

    const grossBilling30Days = Number(rawCash.gross_billing_30_days ?? rawCash.grossBilling30Days ?? raw?.revenue_this_month ?? 0);
    const refunds30Days = Number(rawCash.refunds_30_days ?? rawCash.refunds30Days ?? 0);
    const netRevenue30Days = Number(rawCash.net_revenue_30_days ?? rawCash.netRevenue30Days ?? (grossBilling30Days - refunds30Days));

    return {
      status: 'deferred_pending_specification',
      message: 'Composite Studio Health Index score and letter grade are deferred pending an approved business specification.',
      compositeScore: null,
      financialHealthGrade: null,
      componentMetrics: {
        occupancy: {
          totalSessions,
          totalCapacity,
          totalAttended,
          occupancyRatePercent,
          denominatorDefinition: 'Sum of capacity for non-cancelled classes within lookback window (<= referenceDate)',
        },
        retention: {
          totalActiveMembers,
          engagedMembersLast30Days,
          retentionRatePercent,
        },
        cashFlow: {
          grossBilling30Days: Number(grossBilling30Days.toFixed(2)),
          refunds30Days: Number(refunds30Days.toFixed(2)),
          netRevenue30Days: Number(netRevenue30Days.toFixed(2)),
          currency: String(rawCash.currency || raw?.currency || 'INR'),
        },
      },
      source: 'erpnext',
    };
  }
}
