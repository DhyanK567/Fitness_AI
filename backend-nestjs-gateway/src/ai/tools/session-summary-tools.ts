import { Injectable } from '@nestjs/common';
import { AiTool, ToolContext, ToolResult } from './base-tool';
import { SessionSummaryService } from '../operations/session-summary.service';

@Injectable()
export class SessionDebriefTool implements AiTool {
  constructor(private readonly sessionSummaryService: SessionSummaryService) {}

  name = 'sessionDebrief';

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.sessionSummaryService.getSessionDebrief(context, args as any);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error, errorCode: 'SESSION_DEBRIEF_FAILED' };
  }
}

@Injectable()
export class TrainerNotesTool implements AiTool {
  constructor(private readonly sessionSummaryService: SessionSummaryService) {}

  name = 'trainerNotes';

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.sessionSummaryService.getTrainerNotes(context, args as any);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error, errorCode: 'TRAINER_NOTES_FAILED' };
  }
}

@Injectable()
export class MemberMilestonesTool implements AiTool {
  constructor(private readonly sessionSummaryService: SessionSummaryService) {}

  name = 'memberMilestones';

  async execute(context: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.sessionSummaryService.getMemberMilestones(context, args as any);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return { success: false, error: result.error, errorCode: 'MEMBER_MILESTONES_FAILED' };
  }
}