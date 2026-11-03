import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { FeedbackService } from '../../modules/feedback/feedback.service';

@Injectable()
export class StoreFeedbackClassificationTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly feedbackService?: FeedbackService,
  ) {
    super(erp);
  }

  async execute(
    context: ToolContext,
    args: {
      feedbackId: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      topics: Array<'trainer' | 'class_content' | 'music' | 'timing' | 'duration' | 'facility'>;
      theme: string;
      lowConfidence?: boolean;
    },
  ): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['feedbackId', 'sentiment', 'topics', 'theme']);
    if (validationError) return this.error(validationError);

    if (!this.feedbackService) {
      return this.error('FeedbackService is unavailable for storing classification');
    }

    try {
      const result = await this.feedbackService.storeClassification(
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
        summary: `Feedback classification successfully persisted for ${args.feedbackId} (${args.sentiment})`,
      });
    } catch (err) {
      return this.error(`Storing classification failed: ${(err as Error).message}`);
    }
  }
}