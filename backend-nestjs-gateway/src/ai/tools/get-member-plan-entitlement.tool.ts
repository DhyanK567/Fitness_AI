import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';

interface MembershipResponse {
  id: string;
  plan_name: string;
  plan_type: string;
  start_date: string;
  end_date: string;
  price: number;
  auto_renew: boolean;
}

@Injectable()
export class GetMemberPlanEntitlementTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext): Promise<ToolResult> {
    // Try PostgreSQL first (StudioMember model)
    try {
      const pgResult = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const member = await tx.studioMember.findFirst({
          where: {
            tenantId: context.tenantId,
            // For members, we need to link via userErpLink or userId
            // First try to find member by userId if it's a UUID
            ...(this.isValidUuid(context.userId) ? { id: context.userId } : {}),
          },
          select: {
            id: true,
            plan: true,
            status: true,
            expiry: true,
            fullName: true,
          },
        });

        if (!member) {
          return this.success({
            hasActiveMembership: false,
            summary: 'No member record found',
          });
        }

        if (member.status !== 'Active' || !member.expiry || new Date(member.expiry) < new Date()) {
          return this.success({
            hasActiveMembership: false,
            summary: `Membership is ${member.status.toLowerCase()}${member.expiry ? ` (expired ${member.expiry.toISOString().split('T')[0]})` : ''}`,
          });
        }

        return this.success({
          hasActiveMembership: true,
          membershipId: member.id,
          planName: member.plan,
          planType: member.plan,
          startDate: null, // Not stored in StudioMember
          endDate: member.expiry.toISOString().split('T')[0],
          price: null,
          autoRenew: false,
          summary: `Active ${member.plan} plan (ends ${member.expiry.toISOString().split('T')[0]})`,
        });
      });

      return pgResult;
    } catch (pgError) {
      console.error(`[GetMemberPlanEntitlementTool] PostgreSQL query failed: ${pgError instanceof Error ? pgError.message : String(pgError)}. Falling back to ERPNext.`);
    }

    // Fallback to ERPNext
    const result = await this.callErp<{ memberships: MembershipResponse[] }>(context, ERP_METHODS.MEMBERSHIP_LIST, {
      member_id: context.userId,
      status: 'active',
      limit: 1,
    });

    if (!result.success) return result;

    const memberships = result.data?.memberships || [];

    if (memberships.length === 0) {
      return this.success({
        hasActiveMembership: false,
        summary: 'No active membership found',
      });
    }

    const membership = memberships[0];

    return this.success({
      hasActiveMembership: true,
      membershipId: membership.id,
      planName: membership.plan_name,
      planType: membership.plan_type,
      startDate: membership.start_date,
      endDate: membership.end_date,
      price: membership.price,
      autoRenew: membership.auto_renew,
      summary: `Active ${membership.plan_type} plan: ${membership.plan_name} (ends ${membership.end_date})`,
    });
  }

  private isValidUuid(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
  }
}