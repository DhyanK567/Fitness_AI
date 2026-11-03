import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsObject,
  IsISO8601,
  IsNumber,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAssistantSessionDto {
  @ApiPropertyOptional({ example: 'en-IN', description: 'Session locale' })
  @IsOptional()
  @IsString()
  locale?: string;
}

export class AssistantSessionResponseDto {
  @ApiProperty({ description: 'Unique identifier of the assistant session' })
  @IsUUID()
  session_id: string;

  @ApiProperty({ description: 'ISO-8601 expiry timestamp for the session' })
  @IsISO8601()
  expires_at: string;

  @ApiProperty({ type: [String], description: 'List of tool names available to the caller' })
  @IsArray()
  @IsString({ each: true })
  tools: string[];

  @ApiProperty({ description: 'Mandatory disclaimer for AI outputs' })
  @IsString()
  disclaimer: string;
}

export class PostAssistantMessageDto {
  @ApiProperty({ description: 'User message to the assistant (1-2000 chars)', minLength: 1, maxLength: 2000 })
  @IsString()
  @Length(1, 2000)
  message: string;

  @ApiPropertyOptional({ description: 'Client-provided message identifier for deduplication' })
  @IsOptional()
  @IsString()
  client_msg_id?: string;
}

export class AssistantPendingActionPreviewDto {
  @ApiProperty({ description: 'Unique identifier for the pending action' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Name of the tool to be executed' })
  @IsString()
  tool: string;

  @ApiProperty({ description: 'Human-readable summary of the proposed action' })
  @IsString()
  summary: string;

  @ApiPropertyOptional({ description: 'Sanitized arguments preview' })
  @IsOptional()
  @IsObject()
  arguments_preview?: Record<string, unknown>;

  @ApiProperty({ description: 'ISO-8601 expiry timestamp for action confirmation' })
  @IsISO8601()
  expires_at: string;

  @ApiPropertyOptional({ description: 'Confirmation token required to confirm action' })
  @IsOptional()
  @IsString()
  confirm_token?: string;
}

export class AssistantToolUsedDto {
  @ApiProperty({ description: 'Tool name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Status of tool invocation', example: 'success' })
  @IsString()
  status: string;
}

export type AssistantResponseType =
  | 'answer'
  | 'question'
  | 'confirmation'
  | 'action_result'
  | 'out_of_scope'
  | 'handoff';

export class AssistantMessageResponseDto {
  @ApiProperty()
  @IsString()
  session_id: string;

  @ApiProperty()
  @IsNumber()
  turn_no: number;

  @ApiProperty({ enum: ['answer', 'question', 'confirmation', 'action_result', 'out_of_scope', 'handoff'] })
  @IsString()
  type: AssistantResponseType;

  @ApiProperty()
  @IsString()
  text: string;

  @ApiPropertyOptional()
  @IsOptional()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ type: AssistantPendingActionPreviewDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantPendingActionPreviewDto)
  pending_action?: AssistantPendingActionPreviewDto;

  @ApiProperty({ type: [AssistantToolUsedDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssistantToolUsedDto)
  tools_used: AssistantToolUsedDto[];

  @ApiProperty()
  @IsString()
  correlation_id: string;
}

export class ConfirmActionContractDto {
  @ApiPropertyOptional({ description: 'Optional confirmation token if issued' })
  @IsOptional()
  @IsString()
  confirm_token?: string;

  @ApiPropertyOptional({ description: 'CamelCase alias for confirm_token' })
  @IsOptional()
  @IsString()
  confirmToken?: string;
}

export class ActionExecutionResponseDto {
  @ApiProperty({ enum: ['succeeded', 'failed', 'uncertain'] })
  @IsString()
  status: 'succeeded' | 'failed' | 'uncertain';

  @ApiPropertyOptional({ description: 'Identifier of the created or affected record' })
  @IsOptional()
  @IsString()
  record_id?: string;

  @ApiPropertyOptional({ description: 'Error details if execution failed or uncertain' })
  @IsOptional()
  error?: {
    code: string;
    message: string;
  };

  @ApiPropertyOptional({ description: 'Audit log record ID' })
  @IsOptional()
  @IsString()
  audit_id?: string;
}

export class RejectActionContractDto {
  @ApiPropertyOptional({ description: 'Reason for rejecting the proposed action' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AiAuditItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  actor: string;

  @ApiPropertyOptional()
  tool?: string;

  @ApiProperty()
  arguments_redacted: Record<string, unknown>;

  @ApiPropertyOptional()
  decision: string | null;

  @ApiPropertyOptional()
  approval: Record<string, unknown> | null;

  @ApiProperty()
  result: unknown;

  @ApiProperty()
  at: string;
}

export class AiAuditQueryDto {
  @ApiPropertyOptional({ description: 'Pagination cursor ID' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ description: 'Filter by user / actor ID' })
  @IsOptional()
  @IsString()
  user_id?: string;

  @ApiPropertyOptional({ description: 'Document 5 filter[user_id] alias' })
  @IsOptional()
  @IsString()
  'filter[user_id]'?: string;

  @ApiPropertyOptional({ description: 'Filter by tool name' })
  @IsOptional()
  @IsString()
  tool?: string;

  @ApiPropertyOptional({ description: 'Document 5 filter[tool] alias' })
  @IsOptional()
  @IsString()
  'filter[tool]'?: string;

  @ApiPropertyOptional({ description: 'Start date ISO-8601' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date ISO-8601' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Page limit (1-100, default 50)' })
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number (>= 1, default 1)' })
  @IsOptional()
  page?: number;

  @IsOptional()
  filter?: {
    user_id?: string;
    tool?: string;
  };
}
