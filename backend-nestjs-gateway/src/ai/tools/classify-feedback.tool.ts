import { Injectable, Optional } from '@nestjs/common';
import { BaseTool, ToolContext, ToolResult } from './base-tool';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { FeedbackService } from '../../modules/feedback/feedback.service';
import { LlmGatewayService } from '../gateway/llm-gateway.service';

@Injectable()
export class ClassifyFeedbackTool extends BaseTool {
  constructor(
    @Optional() protected readonly erp: ErpnextService,
    @Optional() private readonly feedbackService?: FeedbackService,
    @Optional() private readonly llmGateway?: LlmGatewayService,
  ) {
    super(erp);
  }

  async execute(context: ToolContext, args: { feedbackId: string; rawComment?: string }): Promise<ToolResult> {
    const validationError = this.validateRequired(args, ['feedbackId']);
    if (validationError) return this.error(validationError);

    if (!this.feedbackService) {
      return this.error('FeedbackService is unavailable for classification');
    }

    try {
      const result = await this.feedbackService.classifyFeedback(
        {
          tenantId: context.tenantId,
          userId: context.userId,
          roles: context.role ? [context.role] : [],
          correlationId: context.correlationId,
        },
        args,
        this.llmGateway,
      );

      return this.success({
        ...result,
        summary: `Feedback classified as ${result.sentiment} sentiment (${result.topics.join(', ') || 'general'})`,
      });
    } catch (err) {
      return this.error(`Classification failed: ${(err as Error).message}`);
    }
  }
}