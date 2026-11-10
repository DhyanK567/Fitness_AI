import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';

interface PlanResponse {
  id: string;
  planName: string;
  planType: string;
  price: number;
  billingCycle: string;
  features: string;
}

@Injectable()
export class GetActivePlansPublicTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    super(undefined as any);
  }

  async execute(context: ToolContext): Promise<ToolResult> {
    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const result = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const plans = await tx.studioMembership.findMany({
          where: {
            tenantId: context.tenantId,
            active: true,
          },
          orderBy: { priceINR: 'asc' },
        });

        const formatted = plans.map((p) => {
          // Determine billing cycle from planType or default to monthly
          const billingCycle = this.inferBillingCycle(p.planType);
          const features = `Up to ${p.sessionLimit} sessions per month`;
          
          return {
            id: p.id,
            planName: p.name,
            planType: p.planType,
            price: p.priceINR,
            billingCycle,
            features,
          };
        });

        return this.success({
          count: formatted.length,
          plans: formatted,
          summary: `${formatted.length} active membership plan(s) available`,
        });
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      console.error(`[GetActivePlansPublicTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }

  private inferBillingCycle(planType: string): string {
    const type = planType.toLowerCase();
    if (type.includes('year') || type.includes('annual')) return 'Yearly';
    if (type.includes('quarter')) return 'Quarterly';
    if (type.includes('month')) return 'Monthly';
    if (type.includes('week')) return 'Weekly';
    if (type.includes('day')) return 'Daily';
    // Default assumption: most fitness memberships are monthly
    return 'Monthly';
  }
}