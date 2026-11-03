import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';

interface MemberGoalResponse {
  goal?: string;
  level?: string;
}

@Injectable()
export class GetMemberGoalAndLevelTool extends BaseTool {
  constructor(@Optional() protected readonly erp: ErpnextService) {
    super(erp);
  }

  async execute(context: ToolContext, args?: { goal?: string; level?: string }): Promise<ToolResult> {
    // If the member explicitly provided or declared goal/level, prioritize it
    if (args?.goal || args?.level) {
      const goal = args.goal?.trim() || undefined;
      const level = args.level?.trim() || 'All Levels';
      return this.success({
        goal,
        level,
        summary: goal ? `Goal: ${goal}, Level: ${level}` : `Goal: Undeclared, Level: ${level}`,
      });
    }

    // Otherwise attempt to query member record from ERP/persistence
    if (this.erp) {
      const result = await this.callErp<MemberGoalResponse>(context, ERP_METHODS.MEMBER_GET, {
        id: context.userId,
      });

      if (result.success && result.data) {
        const member = result.data;
        const goal = member.goal?.trim() || undefined;
        const level = member.level?.trim() || 'All Levels';
        return this.success({
          goal,
          level,
          summary: goal ? `Goal: ${goal}, Level: ${level}` : `Goal: Undeclared, Level: ${level}`,
        });
      }
    }

    // Safe handling when persistent field is unset or ERP is unavailable: do not impute a goal
    return this.success({
      goal: undefined,
      level: 'All Levels',
      summary: 'Goal: Undeclared, Level: All Levels',
    });
  }
}
