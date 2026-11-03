import { IsString, IsNotEmpty, IsOptional, IsObject, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecuteAgentActionDto {
  @ApiProperty({ description: 'ID of the capability action to execute', example: 'pipeline-overview' })
  @IsString()
  @IsNotEmpty()
  actionId: string;

  @ApiPropertyOptional({ description: 'Optional key-value parameters for the action' })
  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;
}

export class AgentChatDto {
  @ApiProperty({ description: 'Message sent to the agent' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Conversation history turns' })
  @IsArray()
  @IsOptional()
  history?: any[];

  @ApiPropertyOptional({ description: 'Optional existing conversation ID to continue' })
  @IsString()
  @IsOptional()
  conversationId?: string;
}
