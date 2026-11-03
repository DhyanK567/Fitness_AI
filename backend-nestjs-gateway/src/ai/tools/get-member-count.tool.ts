import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';

interface MemberListResponse {
  members: Array<{ id: string; status: string }>;
  total: number;
}

/**
 * PostgreSQL-first member count tool.
 * 
 * Queries the local PostgreSQL database using tenant-aware Prisma transactions.
 * Does not fall back to ERPNext on failure - failures are propagated to the caller.
 * 
 * Supported status filters: 'Active', 'Inactive', 'Pending', 'Cancelled', etc.
 * If no status is provided, returns count of all members for the tenant.
 */
@Injectable()
export class GetMemberCountTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    private readonly prisma: PrismaService,
  ) {
    // Parent BaseTool requires ErpnextService, but we make it optional
    // since this tool is PostgreSQL-first and doesn't require ERPNext
    super(erp);
  }

  async execute(context: ToolContext, args: { status?: string }): Promise<ToolResult> {
    // Validate tenant ID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.tenantId)) {
      return this.error('Invalid tenant ID format');
    }

    try {
      const count = await this.prisma.withTenant(context.tenantId, async (tx) => {
        const where: any = { tenantId: context.tenantId };
        if (args.status) {
          where.status = args.status;
        }
        return tx.studioMember.count({ where });
      });

      return this.success({
        total: count,
        status: args.status || 'all',
        summary: `${count} member(s)${args.status ? ` with status '${args.status}'` : ''}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'PostgreSQL query failed';
      // Log the error but don't fall back to ERPNext
      console.error(`[GetMemberCountTool] PostgreSQL query failed: ${errorMessage}`);
      return this.error(errorMessage, 'POSTGRES_QUERY_FAILED');
    }
  }
}