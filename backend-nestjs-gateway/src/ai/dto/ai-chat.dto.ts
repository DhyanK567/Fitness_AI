import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsUUID, IsArray, ValidateNested, IsObject, IsBoolean, IsISO8601, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
  SYSTEM = 'system',
}

export class ToolCallDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsObject()
  arguments: Record<string, unknown>;
}

export class ToolResultDto {
  @ApiProperty()
  @IsString()
  toolCallId: string;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsObject()
  result: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}

export class MessageDto {
  @ApiProperty({ enum: MessageRole })
  @IsEnum(MessageRole)
  role: MessageRole;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiProperty()
  @IsISO8601()
  timestamp: Date;

  @ApiPropertyOptional({ type: [ToolCallDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallDto)
  toolCalls?: ToolCallDto[];

  @ApiPropertyOptional({ type: [ToolResultDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolResultDto)
  toolResults?: ToolResultDto[];
}

export class ChatRequestDto {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional({ type: [MessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  history?: MessageDto[];
}

export class ChatResponseDto {
  @ApiProperty()
  @IsString()
  response: string;

  @ApiProperty()
  @IsUUID()
  conversationId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallDto)
  toolCalls?: ToolCallDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pendingActionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;
}

export class ConversationDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiProperty()
  @IsISO8601()
  createdAt: Date;

  @ApiProperty()
  @IsISO8601()
  updatedAt: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  archivedAt?: Date;
}

export class ConversationListDto {
  @ApiProperty({ type: [ConversationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationDto)
  conversations: ConversationDto[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class PendingActionStatusEnum {
  static readonly PROPOSED = 'proposed';
  static readonly APPROVED = 'approved';
  static readonly REJECTED = 'rejected';
  static readonly EXECUTING = 'executing';
  static readonly EXECUTED = 'executed';
  static readonly FAILED = 'failed';
  static readonly EXPIRED = 'expired';
  static readonly CANCELLED = 'cancelled';
}

export class PendingActionDto {
  @ApiProperty()
  @IsUUID()
  id: string;

  @ApiProperty()
  @IsString()
  actionType: string;

  @ApiProperty()
  @IsObject()
  payload: Record<string, unknown>;

  @ApiProperty({ enum: ['proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired', 'cancelled'] })
  @IsString()
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  summary?: string;

  @ApiProperty()
  @IsISO8601()
  expiresAt: Date;

  @ApiProperty()
  @IsISO8601()
  createdAt: Date;

  @ApiProperty()
  @IsISO8601()
  updatedAt: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  executedAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}

export class PendingActionListDto {
  @ApiProperty({ type: [PendingActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PendingActionDto)
  actions: PendingActionDto[];

  @ApiProperty()
  @IsNumber()
  total: number;
}

export class ApproveActionDto {
  @ApiProperty()
  @IsString()
  confirmToken: string;
}

export class RejectActionDto {
  @ApiProperty()
  @IsString()
  reason: string;
}

export class ExecuteActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export interface PageContext {
  page?: string;
  entityId?: string;
}

export class AdminChatRequestDto {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => Object)
  context?: PageContext;

  @ApiPropertyOptional({ type: [MessageDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageDto)
  history?: MessageDto[];
}

export class AdminChatResponseDto {
  @ApiProperty()
  @IsString()
  response: string;

  @ApiProperty()
  @IsUUID()
  conversationId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallDto)
  toolCalls?: ToolCallDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pendingActionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  confirmToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  error?: string;
}