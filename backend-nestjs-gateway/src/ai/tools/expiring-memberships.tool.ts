import { Injectable, Optional, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ERP_METHODS } from '@wsos/erp-methods';

export interface MembershipExpiringRecord {
  membership_id?: string;
  id?: string;
  name?: string;
  member_name?: string;
  member?: string;
  member_phone?: string;
  phone?: string;
  plan_name?: string;
  plan?: string;
  end_date?: string;
  status?: string;
  days_remaining?: number;
}

export interface FormattedExpiringMembership {
  membershipId: string;
  memberName: string;
  memberPhone?: string;
  planName: string;
  endDate: string;
  daysRemaining: number;
}

export interface ExpiringMembershipsArgs {
  daysAhead?: number;
  now?: Date | string;
  timezone?: string;
}

function getFormattedDateInTimezone(tz: string, date: Date): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class ExpiringMembershipsTool extends BaseTool {
  private readonly logger = new Logger(ExpiringMembershipsTool.name);

  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: ExpiringMembershipsArgs | Record<string, any> = {}): Promise<ToolResult> {
    const rawDays = args.daysAhead !== undefined ? Number(args.daysAhead) : 7;
    const daysAhead = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 30 ? rawDays : 7;

    const timezone = args.timezone || (context as any).timezone || process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';
    const clock = args.now ? (args.now instanceof Date ? args.now : new Date(args.now)) : ((context as any).now ? new Date((context as any).now) : new Date());

    const todayStr = getFormattedDateInTimezone(timezone, clock);
    const toDateStr = addDaysToDateString(todayStr, daysAhead);

    // Try PostgreSQL first (local database)
    try {
      const pgResult = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const today = new Date(todayStr);
        today.setHours(0, 0, 0, 0);
        const toDate = new Date(toDateStr);
        toDate.setHours(23, 59, 59, 999);

        const members = await tx.studioMember.findMany({
          where: {
            tenantId: context.tenantId,
            status: 'Active',
            expiry: {
              gte: today,
              lte: toDate,
            },
          },
          select: {
            id: true,
            fullName: true,
            phone: true,
            plan: true,
            expiry: true,
            status: true,
          },
        });

        const todayMs = today.getTime();
        const formatted = members
          .map((m) => {
            if (!m.expiry) return null;
            const endMs = m.expiry.getTime();
            if (isNaN(endMs)) return null;
            const daysRemaining = Math.round((endMs - todayMs) / (1000 * 60 * 60 * 24));
            if (daysRemaining < 0 || daysRemaining > daysAhead) return null;
            return {
              membershipId: m.id,
              memberName: m.fullName,
              memberPhone: m.phone || undefined,
              planName: m.plan,
              endDate: m.expiry.toISOString().slice(0, 10),
              daysRemaining,
            };
          })
          .filter((m): m is NonNullable<typeof m> => m !== null)
          .sort((a, b) => a.daysRemaining - b.daysRemaining);

        return this.success({
          count: formatted.length,
          daysAhead,
          timezone,
          referenceDate: todayStr,
          memberships: formatted,
          summary: `${formatted.length} active membership(s) expiring within ${daysAhead} days`,
        });
      });

      return pgResult;
    } catch (pgError) {
      this.logger.warn(`PostgreSQL query for expiring memberships failed: ${pgError instanceof Error ? pgError.message : String(pgError)}. Falling back to ERPNext.`);
    }

    // Fallback to ERPNext
    let result = await this.callErp<any>(
      context,
      ERP_METHODS.REPORT_RUN,
      {
        tenant: context.tenantId,
        report_code: 'memberships_expiring',
        from_date: todayStr,
        to_date: toDateStr,
      },
      'GET',
    );

    // If run_report returns method unavailable (e.g. in legacy tests), fallback to legacy endpoint
    if (!result.success && (result.error?.includes('unavailable') || result.error?.includes('DoesNotExistError') || result.error?.includes('Method not found'))) {
      const legacyResult = await this.callErp<any>(context, ERP_METHODS.REPORT_EXPIRING_MEMBERSHIPS, {
        days_ahead: daysAhead,
      });
      if (legacyResult.success) {
        result = legacyResult;
      }
    }

    if (!result.success) return result;

    // Support both wrapped { rows: [...] }, { memberships: [...] }, or raw array from Frappe
    const rawData = result.data?.rows ?? result.data?.memberships ?? (Array.isArray(result.data) ? result.data : []);
    const records: MembershipExpiringRecord[] = Array.isArray(rawData) ? rawData : [];

    const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
    const formatted: FormattedExpiringMembership[] = [];

    for (const m of records) {
      const membershipId = m.membership_id || m.id || m.name;
      if (!membershipId || !m.end_date || typeof m.end_date !== 'string') {
        // Skip invalid/unidentified records per domain rules
        continue;
      }

      // Check status: ignore inactive or cancelled records
      if (m.status && !['active', 'Active'].includes(m.status)) {
        continue;
      }

      const endDateClean = m.end_date.slice(0, 10);
      const endMs = Date.parse(`${endDateClean}T00:00:00Z`);
      if (isNaN(endMs)) {
        // Exclude invalid date strings like "TBD", "N/A"
        continue;
      }

      // Compute or verify days remaining relative to studio local date
      let daysRemaining = typeof m.days_remaining === 'number' && !isNaN(m.days_remaining)
        ? m.days_remaining
        : Math.round((endMs - todayMs) / (1000 * 60 * 60 * 24));

      // Boundary semantics:
      // Must be expiring within next N days: 0 <= daysRemaining <= daysAhead
      // Exclude already expired (daysRemaining < 0) and records beyond the boundary (daysRemaining > daysAhead)
      if (daysRemaining < 0 || daysRemaining > daysAhead) {
        continue;
      }

      formatted.push({
        membershipId,
        memberName: m.member_name || m.member || 'Unknown Member',
        memberPhone: m.member_phone || m.phone || undefined,
        planName: m.plan_name || m.plan || 'Standard Plan',
        endDate: endDateClean,
        daysRemaining,
      });
    }

    // Sort ascending by days remaining (soonest to expire first)
    formatted.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return this.success({
      count: formatted.length,
      daysAhead,
      timezone,
      referenceDate: todayStr,
      memberships: formatted,
      summary: `${formatted.length} active membership(s) expiring within ${daysAhead} days`,
    });
  }
}
