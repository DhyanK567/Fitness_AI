import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { FeedbackService } from '../../modules/feedback/feedback.service';

@Injectable()
export class GetFeedbackSummaryTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly feedbackService?: FeedbackService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: {
      scope: 'session' | 'week';
      sessionId?: string;
      weekStart?: string;
    },
  ): Promise<ToolResult> {
    if (!args.scope) return this.error('scope is required (session or week)');
    if (args.scope === 'session' && !args.sessionId) return this.error('sessionId required for session scope');
    if (args.scope === 'week' && !args.weekStart) return this.error('weekStart required for week scope');

    if (!this.feedbackService) {
      return this.error('FeedbackService is unavailable for summary aggregation');
    }

    try {
      const result = await this.feedbackService.getSummary(
        {
          tenantId: context.tenantId,
          userId: context.userId,
          roles: context.role ? [context.role] : [],
          correlationId: context.correlationId,
        },
        args,
      );

      return this.success({
        ...result,
        summary: `Computed ${result.scope} feedback summary (${result.totalFeedback} entries, NPS: ${result.npsScore}, Avg Rating: ${result.averageRating}/5)`,
      });
    } catch (err) {
      return this.error(`Feedback summary calculation failed: ${(err as Error).message}`);
    }
  }
}