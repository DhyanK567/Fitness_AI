import { randomUUID, timingSafeEqual } from 'node:crypto';
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
  HttpException,
  Optional,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConversationOrchestrator, ConversationTurn } from './orchestrator/conversation-loop';
import { ConversationService } from './conversation.service';
import { PendingActionService } from './pending-action.service';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { Prisma } from '@prisma/client';
import { can } from '../common/policy';
import { getAvailableTools, TOOL_PERMISSIONS } from './guardrails/scope-rules';
import { TOOLS } from '@wsos/ai-tool-definitions';
import { PiiRedaction } from './guardrails/pii-redaction';
import {
  ChatRequestDto,
  ChatResponseDto,
  ConversationListDto,
  ConversationDto,
  PendingActionDto,
  PendingActionListDto,
  ApproveActionDto,
  RejectActionDto,
  ExecuteActionDto,
  ToolCallDto,
  AdminChatRequestDto,
  AdminChatResponseDto,
} from './dto/ai-chat.dto';
import {
  CreateAssistantSessionDto,
  AssistantSessionResponseDto,
  PostAssistantMessageDto,
  AssistantMessageResponseDto,
  AssistantPendingActionPreviewDto,
  AssistantToolUsedDto,
  AssistantResponseType,
  ConfirmActionContractDto,
  ActionExecutionResponseDto,
  RejectActionContractDto,
  AiAuditQueryDto,
} from './dto/ai-assistant-contract.dto';
import { ToolRegistry } from './tools/tool-registry';
import { AgentRegistryService } from './agents/agent-registry.service';
import { ExecuteAgentActionDto, AgentChatDto } from './dto/agent.dto';

@ApiTags('Admin AI')
@ApiBearerAuth()
@Controller('ai')
@UseGuards(AuthGuard, PermissionGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly orchestrator: ConversationOrchestrator,
    private readonly conversationService: ConversationService,
    private readonly pendingActionService: PendingActionService,
    private readonly prisma: PrismaService,
    private readonly auditOutbox: AuditOutboxService,
    @Optional() private readonly toolRegistry?: ToolRegistry,
    @Optional() private readonly agentRegistry?: AgentRegistryService,
  ) {}

  // ============================================================
  // CHAT ENDPOINT
  // ============================================================
  @Post('chat')
  @RequirePermission('ai:chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a message to the Admin AI',
    description: 'Process a natural language query and return AI response with optional tool calls or pending action proposal.',
  })
  async chat(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Body() dto: ChatRequestDto,
  ): Promise<ChatResponseDto> {
    const correlationId = randomUUID();
    const tenantId = user.tenantId;

    const result = await this.orchestrator.processMessage(
      {
        tenantId,
        tenantCode: user.tenantCode,
        userId: user.id,
        role: user.role,
        correlationId,
      },
      dto.message,
      dto.history || [],
    );

    // Save conversation turn
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conversation = await this.conversationService.create({
        tenantId,
        userId: user.id,
        title: this.generateTitle(dto.message),
      });
      conversationId = conversation.id;
    }

    const finalConversationId = conversationId as string;

    await this.conversationService.addMessage({
      conversationId: finalConversationId,
      tenantId: user.tenantId,
      role: 'user',
      content: dto.message,
    });

    await this.conversationService.addMessage({
      conversationId: finalConversationId,
      tenantId: user.tenantId,
      role: 'assistant',
      content: result.response,
      toolCalls: result.toolCalls as any,
    });

    // If there's a pending action, return it with the response and conversationId
    if (result.pendingActionId) {
      return {
        response: result.response,
        conversationId: finalConversationId,
        pendingActionId: result.pendingActionId,
        confirmToken: result.confirmToken,
        requiresConfirmation: true,
        toolCalls: result.toolCalls as any,
      };
    }

    return {
      response: result.response,
      conversationId: finalConversationId,
      toolCalls: result.toolCalls as any,
    };
  }

  // ============================================================
  // UNIFIED ADMIN AI CHAT ENDPOINT
  // ============================================================
  @Post('admin/chat')
  @RequirePermission('ai:chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unified Admin AI Chat - General or Agent-Specific',
    description:
      'Single conversational endpoint for all admin AI interactions. Supports general admin chat, explicit agent routing, and page context awareness. Handles answers, clarifications, pending approvals, action results, and out-of-scope responses.',
  })
  async adminChat(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Body() dto: AdminChatRequestDto,
  ): Promise<AdminChatResponseDto> {
    const correlationId = randomUUID();
    const tenantId = user.tenantId;

    // Verify agent access if agentId provided
    if (dto.agentId) {
      if (!this.agentRegistry) {
        throw new InternalServerErrorException('AgentRegistryService not initialized');
      }
      await this.agentRegistry.getAgent(tenantId, dto.agentId, user.role);
    }

    // Create or reuse conversation
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conversation = await this.conversationService.create({
        tenantId,
        userId: user.id,
        title: this.generateTitle(dto.message),
      });
      conversationId = conversation.id;
    }

    // Persist user message
    await this.conversationService.addMessage({
      conversationId,
      tenantId: user.tenantId,
      role: 'user',
      content: dto.message,
    });

    // Determine execution path based on agentId
    let result: { response: string; toolCalls?: any[]; pendingActionId?: string; confirmToken?: string; requiresConfirmation?: boolean; toolResults?: any[]; error?: string; data?: Record<string, unknown> };

    if (dto.agentId) {
      // Explicit agent chat path
      if (!this.agentRegistry) {
        throw new InternalServerErrorException('AgentRegistryService not initialized');
      }
      result = await this.agentRegistry.chatWithAgent(
        tenantId,
        user.tenantCode,
        dto.agentId,
        dto.message,
        dto.history || [],
        user,
        conversationId,
      );
    } else {
      // General admin copilot path
      const orchestratorResult = await this.orchestrator.processMessage(
        {
          tenantId,
          tenantCode: user.tenantCode,
          userId: user.id,
          role: user.role,
          correlationId,
          sessionId: conversationId,
        },
        dto.message,
        dto.history || [],
      );

      result = {
        response: orchestratorResult.response,
        toolCalls: orchestratorResult.toolCalls,
        pendingActionId: orchestratorResult.pendingActionId,
        confirmToken: orchestratorResult.confirmToken,
        requiresConfirmation: orchestratorResult.requiresConfirmation,
        toolResults: orchestratorResult.toolResults,
        error: orchestratorResult.error,
      };
    }

    // Persist assistant message
    await this.conversationService.addMessage({
      conversationId,
      tenantId: user.tenantId,
      role: 'assistant',
      content: result.response,
      toolCalls: result.toolCalls as any,
    });

    // Build unified response
    const response: AdminChatResponseDto = {
      response: result.response,
      conversationId,
      toolCalls: result.toolCalls as any,
      pendingActionId: result.pendingActionId,
      confirmToken: result.confirmToken,
      requiresConfirmation: result.requiresConfirmation,
      data: result.data,
      error: result.error,
    };

    return response;
  }

  // ============================================================
  // CONVERSATION ENDPOINTS
  // ============================================================
  @Get('conversations')
  @RequirePermission('ai:chat')
  @ApiOperation({ summary: 'List user conversations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'archived'] })
  async listConversations(
    @CurrentUser() user: { id: string; tenantId: string },
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.conversationService.findByUser(user.tenantId, user.id, {
      page: Number(page),
      limit: Math.min(Number(limit), 50),
      status,
    });
  }

  @Get('conversations/:id')
  @RequirePermission('ai:chat')
  @ApiOperation({ summary: 'Get conversation with messages' })
  async getConversation(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.conversationService.findById(user.tenantId, id);
  }

  @Patch('conversations/:id/archive')
  @RequirePermission('ai:chat')
  @ApiOperation({ summary: 'Archive a conversation' })
  async archiveConversation(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ) {
    return this.conversationService.archive(user.tenantId, id);
  }

  @Delete('conversations/:id')
  @RequirePermission('ai:chat')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a conversation' })
  async deleteConversation(
    @CurrentUser() user: { tenantId: string },
    @Param('id') id: string,
  ) {
    await this.conversationService.delete(user.tenantId, id);
  }

  // ============================================================
  // PENDING ACTION ENDPOINTS
  // ============================================================
  @Get('pending-actions')
  @RequirePermission('ai:approve')
  @ApiOperation({ summary: 'List pending actions for approval' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['proposed', 'approved', 'rejected', 'executing', 'executed', 'failed', 'expired', 'cancelled'] })
  async listPendingActions(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    const result = await this.pendingActionService.findByTenant(user.tenantId, {
      page: Number(page),
      limit: Math.min(Number(limit), 50),
      status,
    });

    const actions = (result.actions || []).map((action) => {
      const { confirmToken: _removed, ...safeAction } = action as any;
      return safeAction;
    });

    return {
      ...result,
      actions,
    };
  }

  @Get('pending-actions/:id')
  @RequirePermission('ai:approve')
  @ApiOperation({ summary: 'Get pending action details' })
  async getPendingAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
  ) {
    const action = await this.pendingActionService.findById(user.tenantId, id);
    if (!action) {
      throw new NotFoundException('Pending action not found');
    }

    const { confirmToken: _removed, ...safeAction } = action as any;
    return safeAction;
  }

  @Post('pending-actions/:id/approval-token')
  @RequirePermission('ai:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request single-use approval token for pending action',
    description: 'Generates or retrieves a single-use approval token for authorized administrators reviewing actions in the queue. Audits token issuance.',
  })
  async requestApprovalToken(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
  ): Promise<{ confirm_token: string }> {
    const action = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.findFirst({
        where: { id, tenantId: user.tenantId },
      });
    });

    if (!action) {
      throw new NotFoundException('Pending action not found');
    }

    if (user.role !== 'owner' && user.role !== 'admin' && action.userId !== user.id) {
      throw new ForbiddenException('Only administrators, owners, or the proposing user can request an approval token');
    }

    if (new Date() > action.expiresAt) {
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id },
          data: { status: 'expired' },
        });
      });
      throw new HttpException(
        {
          error: {
            code: 'AI_ACTION_EXPIRED',
            message: 'Pending action confirmation window has expired',
          },
        },
        HttpStatus.GONE,
      );
    }

    if (action.status !== 'proposed') {
      throw new ConflictException(`AI_ACTION_ALREADY_DECIDED: Cannot approve action in status ${action.status}`);
    }

    // Fail-closed domain tool permission check
    const requiredPermission = TOOL_PERMISSIONS[action.actionType];
    if (requiredPermission === undefined) {
      throw new ForbiddenException(`PERMISSION_DENIED: Unmapped or unknown action type ${action.actionType}`);
    }
    if (requiredPermission !== null && !can(user.role, requiredPermission)) {
      throw new ForbiddenException(`PERMISSION_DENIED: User lacks required permission ${requiredPermission}`);
    }

    if (!action.confirmToken) {
      throw new ConflictException('No confirmation token available for this action');
    }

    // Record audit event for token issuance
    await this.auditOutbox.record({
      tenantId: user.tenantId,
      correlationId: randomUUID(),
      actorType: 'human',
      actorId: user.id,
      action: `ai.action.approval_token_issued.${action.actionType}`,
      resourceType: 'pending_action',
      resourceRef: id,
      eventType: 'ai.action.approval_token_issued',
      payload: {
        actionType: action.actionType,
        recipientRole: user.role,
      } as Prisma.InputJsonValue,
      afterData: {
        actionType: action.actionType,
        issuedTo: user.id,
      } as Prisma.InputJsonValue,
    });

    return {
      confirm_token: action.confirmToken,
    };
  }

  @Post('pending-actions/:id/approve')
  @RequirePermission('ai:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve and execute a pending action' })
  async approveAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: ApproveActionDto,
  ) {
    const result = await this.executeConfirmedAction(user, id, dto?.confirmToken || (dto as any)?.confirm_token);

    return {
      success: result.status === 'succeeded',
      state: result.status,
      recordId: result.record_id,
      auditId: result.audit_id,
      response: result.status === 'succeeded' ? `Action completed successfully. Record: ${result.record_id || id}` : undefined,
      error: result.error?.message,
    };
  }

  @Post('pending-actions/:id/reject')
  @RequirePermission('ai:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending action' })
  async rejectAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: RejectActionDto,
  ) {
    const result = await this.rejectAssistantAction(user, id, { reason: dto?.reason });
    return { success: true, message: 'Action rejected', ...result };
  }

  @Post('pending-actions/:id/execute')
  @RequirePermission('ai:approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute an already approved action' })
  async executeAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: ExecuteActionDto,
  ) {
    // 1. Fetch action strictly within tenant context
    const action = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.findFirst({
        where: { id, tenantId: user.tenantId },
      });
    });

    if (!action) {
      throw new NotFoundException('Pending action not found');
    }

    // 2. Ownership check: Requesting user or admin/owner
    if (action.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Only the requesting user or admin can execute this action');
    }

    // 3. Status check: must be approved
    if (action.status !== 'approved') {
      throw new ConflictException(`AI_ACTION_NOT_APPROVED: Cannot execute action in status ${action.status}`);
    }

    // 4. Domain tool permission check (fail-closed)
    const requiredPermission = TOOL_PERMISSIONS[action.actionType];
    if (requiredPermission === undefined) {
      throw new ForbiddenException(`PERMISSION_DENIED: Unmapped or unknown action type ${action.actionType}`);
    }
    if (requiredPermission !== null && !can(user.role, requiredPermission)) {
      throw new ForbiddenException(`PERMISSION_DENIED: User lacks required permission ${requiredPermission}`);
    }

    // 5. Atomic state transition to 'executing'
    const updateResult = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.updateMany({
        where: { id, tenantId: user.tenantId, status: 'approved' },
        data: {
          status: 'executing',
          executedBy: user.id,
        },
      });
    });

    if (updateResult.count === 0) {
      throw new ConflictException('AI_ACTION_NOT_APPROVED: Action is no longer in approved status');
    }

    // 6. Execute frozen payload from DB
    try {
      let erpResult: unknown;
      if (this.toolRegistry) {
        const toolResult = await this.toolRegistry.execute(
          action.actionType,
          {
            tenantId: user.tenantId,
            tenantCode: user.tenantCode,
            userId: user.id,
            role: user.role,
            correlationId: randomUUID(),
            isConfirmedPendingAction: true,
          },
          action.payload as Record<string, unknown>,
          { isConfirmedPendingAction: true },
        );
        if (!toolResult.success) {
          const err: any = new Error(toolResult.error || 'Tool execution failed');
          err.code = toolResult.errorCode;
          throw err;
        }
        erpResult = toolResult.data;
      } else {
        erpResult = await this.orchestrator.callErpTool(
          {
            tenantId: user.tenantId,
            tenantCode: user.tenantCode,
            userId: user.id,
            role: user.role,
            correlationId: randomUUID(),
          },
          action.actionType,
          action.payload as Record<string, unknown>,
        );
      }

      await this.prisma.withTenant(user.tenantId, async (tx) => {
        return tx.pendingAction.update({
          where: { id },
          data: {
            status: 'executed',
            executedAt: new Date(),
            result: erpResult as Prisma.InputJsonValue,
          },
        });
      });

      await this.auditOutbox.record({
        tenantId: user.tenantId,
        correlationId: randomUUID(),
        actorType: 'human',
        actorId: user.id,
        action: `ai.action.execute.${action.actionType}`,
        resourceType: 'pending_action',
        resourceRef: id,
        eventType: 'ai.action.executed',
        payload: {
          actionType: action.actionType,
          arguments: PiiRedaction.sanitizeForLogging((action.payload as Record<string, unknown>) || {}),
        } as Prisma.InputJsonValue,
        afterData: {
          actionType: action.actionType,
          arguments: PiiRedaction.sanitizeForLogging((action.payload as Record<string, unknown>) || {}),
          result: typeof erpResult === 'object' && erpResult !== null
            ? PiiRedaction.sanitizeForLogging(erpResult as Record<string, unknown>)
            : erpResult,
          decision: 'executed',
          approval: { approved_by: user.id },
        } as Prisma.InputJsonValue,
      });

      return {
        success: true,
        state: 'succeeded',
        response: 'Action completed successfully',
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id },
          data: {
            status: 'failed',
            error: errorMessage,
          },
        });
      });

      return {
        success: false,
        state: 'failed',
        error: errorMessage,
      };
    }
  }

  @Post('pending-actions/:id/cancel')
  @RequirePermission('ai:chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a proposed pending action (by proposer)' })
  async cancelAction(
    @CurrentUser() user: { id: string; tenantId: string },
    @Param('id') id: string,
  ) {
    await this.pendingActionService.cancel(user.tenantId, id, user.id);

    return { success: true, message: 'Action cancelled' };
  }

  // ============================================================
  // OFFICIAL API CONTRACT ENDPOINTS (Document 5 Section 6.1 & 6.2)
  // ============================================================

  /**
   * POST /api/v1/ai/assistant/sessions
   * Contract: 201 { session_id, expires_at, tools:[names], disclaimer }
   * Security: Staff JWT; ai:query; tenant-bound; session tied to user
   */
  @Post('assistant/sessions')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an authenticated AI assistant session',
    description: 'Initializes a session tied to the caller with permitted tools, expiry, and governance disclaimer.',
  })
  async createAssistantSession(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Body() dto: CreateAssistantSessionDto,
  ): Promise<AssistantSessionResponseDto> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h expiry
    const conversation = await this.conversationService.create({
      tenantId: user.tenantId,
      userId: user.id,
      title: 'AI Assistant Session',
    });

    const availableTools = getAvailableTools(user.role, TOOLS);
    const toolNames = availableTools.map((t) => t.name);

    return {
      session_id: conversation.id,
      expires_at: expiresAt.toISOString(),
      tools: toolNames,
      disclaimer: 'AI assistant responses and actions are advisory, governed by studio policy, and subject to staff verification.',
    };
  }

  /**
   * POST /api/v1/ai/assistant/sessions/:id/messages
   * Contract: Message response envelope { session_id, turn_no, type, text, data?, pending_action?, tools_used, correlation_id }
   * Security: ai:query; tenant isolation; prompt-injection filters; tool validation
   */
  @Post('assistant/sessions/:id/messages')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a message in an AI assistant session',
    description: 'Processes input message within session context, validates tenant ownership, and returns standard message envelope.',
  })
  async sendAssistantMessage(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: PostAssistantMessageDto,
  ): Promise<AssistantMessageResponseDto> {
    // 1. Verify session exists and belongs to the caller's tenant
    const session = await this.conversationService.findById(user.tenantId, id);
    if (!session) {
      throw new NotFoundException('AI session not found or expired');
    }

    if (session.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Access denied to other user session');
    }

    const correlationId = 'msg_' + randomUUID();
    const history: ConversationTurn[] = (session.messages || []).map((m) => ({
      role: m.role as any,
      content: m.content,
      toolCalls: (m.toolCalls as any) || undefined,
      toolResults: (m.toolResults as any) || undefined,
      timestamp: m.createdAt,
    }));

    // 2. Process message through existing orchestrator
    const result = await this.orchestrator.processMessage(
      {
        tenantId: user.tenantId,
        tenantCode: user.tenantCode,
        userId: user.id,
        role: user.role,
        correlationId,
        sessionId: id,
      },
      dto.message,
      history,
    );

    // 3. Persist user and assistant turns
    await this.conversationService.addMessage({
      conversationId: id,
      tenantId: user.tenantId,
      role: 'user',
      content: dto.message,
    });

    await this.conversationService.addMessage({
      conversationId: id,
      tenantId: user.tenantId,
      role: 'assistant',
      content: result.response,
      toolCalls: result.toolCalls as any,
    });

    const turnNo = (session.messages?.length || 0) + 1;

    // 4. Determine response type per Document 5 Section 6.1
    let type: AssistantResponseType = 'answer';
    let pendingActionPreview: AssistantPendingActionPreviewDto | undefined;

    if (result.pendingActionId) {
      type = 'confirmation';
      const action = await this.pendingActionService.findById(user.tenantId, result.pendingActionId);
      if (action) {
        pendingActionPreview = {
          id: action.id,
          tool: action.actionType,
          summary: action.summary || 'Confirmation required for proposed action',
          arguments_preview: action.payload as Record<string, unknown>,
          expires_at: action.expiresAt.toISOString(),
          confirm_token: action.confirmToken || result.confirmToken,
        };
      }
    } else if (
      result.response.toLowerCase().includes('what is') ||
      result.response.toLowerCase().includes('please provide') ||
      result.response.includes('?')
    ) {
      type = 'question';
    } else if (
      result.response.toLowerCase().includes("can't process") ||
      result.response.toLowerCase().includes("don't have any tools") ||
      result.response.toLowerCase().includes('out of scope')
    ) {
      type = 'out_of_scope';
    }

    const toolsUsed: AssistantToolUsedDto[] =
      result.toolResults && result.toolResults.length > 0
        ? result.toolResults.map((tr) => ({
            name: tr.name,
            status: tr.error ? 'failed' : 'success',
          }))
        : (result.toolCalls || []).map((tc) => ({
            name: tc.name,
            status: result.error ? 'failed' : 'success',
          }));

    return {
      session_id: id,
      turn_no: turnNo,
      type,
      text: result.response,
      pending_action: pendingActionPreview,
      tools_used: toolsUsed,
      correlation_id: correlationId,
    };
  }

  /**
   * GET /api/v1/ai/assistant/sessions/:id
   * Contract: 200 { session_id, turns:[...], pending_actions:[...] }
   * Security: Session owner or owner/admin
   */
  @Get('assistant/sessions/:id')
  @RequirePermission('ai:query')
  @ApiOperation({ summary: 'Get assistant session turns and pending actions' })
  async getAssistantSession(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
  ) {
    const session = await this.conversationService.findById(user.tenantId, id);
    if (!session) {
      throw new NotFoundException('AI session not found');
    }

    if (session.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Access denied to other user session');
    }

    return {
      session_id: session.id,
      turns: (session.messages || []).map((m, idx) => ({
        turn_no: idx + 1,
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls,
        created_at: m.createdAt,
      })),
      pending_actions: (session.pendingActions || []).map((pa) => ({
        id: pa.id,
        tool: pa.actionType,
        summary: pa.summary,
        status: pa.status,
        expires_at: pa.expiresAt,
        error: (pa as any).error,
        result: (pa as any).result,
      })),
    };
  }

  /**
   * DELETE /api/v1/ai/assistant/sessions/:id
   * Contract: 204; conversation purged
   * Security: Session owner or owner/admin
   */
  @Delete('assistant/sessions/:id')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Purge assistant session' })
  async deleteAssistantSession(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
  ) {
    const session = await this.conversationService.findById(user.tenantId, id);
    if (!session) {
      throw new NotFoundException('AI session not found');
    }

    if (session.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Access denied to other user session');
    }

    await this.conversationService.purge(user.tenantId, id);
  }

  /**
   * POST /api/v1/ai/assistant/actions/:pending_id/confirm
   * Contract: 200 { status: succeeded|failed, record_id?, error?, audit_id }
   * Security: Requesting user; pending action not expired/decided; permission re-checked at execution
   * Errors: 410 AI_ACTION_EXPIRED, 409 AI_ACTION_ALREADY_DECIDED, 403 PERMISSION_DENIED
   */
  @Post('assistant/actions/:pending_id/confirm')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm and execute a proposed pending action',
    description: 'Executes frozen action payload using durable pending-action lifecycle with tenant isolation, expiry check, and atomic transition.',
  })
  async confirmAssistantAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('pending_id') pendingId: string,
    @Body() dto: ConfirmActionContractDto,
  ): Promise<ActionExecutionResponseDto> {
    return this.executeConfirmedAction(user, pendingId, dto?.confirm_token || dto?.confirmToken);
  }

  /**
   * Internal unified executor for confirmed pending actions.
   * Enforces strict authorization parity: tenant isolation, requesting user or admin ownership,
   * expiry (410 GONE), status (409 CONFLICT), domain tool permission check (fail-closed),
   * timing-safe token validation, atomic CAS state transition to 'executing' with token clearance,
   * frozen database argument execution, and tamper-evident audit logging.
   */
  private async executeConfirmedAction(
    user: { id: string; tenantId: string; tenantCode: string; role: string },
    pendingId: string,
    confirmToken?: string,
    correlationId?: string,
  ): Promise<ActionExecutionResponseDto> {
    // 1. Fetch action strictly within tenant context
    const action = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.findFirst({
        where: { id: pendingId, tenantId: user.tenantId },
      });
    });

    if (!action) {
      throw new NotFoundException('Pending action not found');
    }

    // 2. Security: Verify requesting user ownership
    if (action.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Only the requesting user can confirm this pending action');
    }

    // 3. Expiry check: 410 if expired
    if (new Date() > action.expiresAt) {
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id: pendingId },
          data: { status: 'expired' },
        });
      });
      throw new HttpException(
        {
          error: {
            code: 'AI_ACTION_EXPIRED',
            message: 'Pending action confirmation window has expired',
          },
        },
        HttpStatus.GONE,
      );
    }

    // 4. Status check: 409 if already decided
    if (action.status !== 'proposed') {
      throw new ConflictException(`AI_ACTION_ALREADY_DECIDED: Cannot confirm action in status ${action.status}`);
    }

    // 5. Tool permission check (fail-closed)
    const requiredPermission = TOOL_PERMISSIONS[action.actionType];
    if (requiredPermission === undefined) {
      throw new ForbiddenException(`PERMISSION_DENIED: Unmapped or unknown action type ${action.actionType}`);
    }
    if (requiredPermission !== null && !can(user.role, requiredPermission)) {
      throw new ForbiddenException(`PERMISSION_DENIED: User lacks required permission ${requiredPermission}`);
    }

    // 6. Mandatory token validation: must be non-empty and match stored token exactly (timing-safe)
    const clientToken = (confirmToken || '').trim();
    const storedToken = (action.confirmToken || '').trim();
    if (!clientToken || !storedToken || !this.secureTokenEquals(clientToken, storedToken)) {
      throw new ForbiddenException('Invalid confirmation token');
    }

    // 7. Atomic state transition to 'executing' and token clearance
    const updateResult = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.updateMany({
        where: { id: pendingId, tenantId: user.tenantId, status: 'proposed' },
        data: {
          status: 'executing',
          approvedBy: user.id,
          executedBy: user.id,
          confirmToken: null, // Clear token immediately to prevent replay
        },
      });
    });

    if (updateResult.count === 0) {
      throw new ConflictException('AI_ACTION_ALREADY_DECIDED: Action is no longer in proposed status');
    }

    // 8. Execute frozen payload from DB via canonical ToolRegistry
    let downstreamExecuted = false;
    const idempotencyKey = action.idempotencyKey || `pa-${pendingId}`;

    try {
      let erpResult: unknown;

      if (this.toolRegistry) {
        const toolResult = await this.toolRegistry.execute(
          action.actionType,
          {
            tenantId: user.tenantId,
            tenantCode: user.tenantCode,
            userId: user.id,
            role: user.role,
            correlationId: correlationId || randomUUID(),
            isConfirmedPendingAction: true,
            idempotencyKey,
          },
          action.payload as Record<string, unknown>,
          { isConfirmedPendingAction: true },
        );

        if (!toolResult.success) {
          const err: any = new Error(toolResult.error || 'Tool execution failed');
          err.code = toolResult.errorCode;
          throw err;
        }
        erpResult = toolResult.data;
        downstreamExecuted = true;
      } else {
        erpResult = await this.orchestrator.callErpTool(
          {
            tenantId: user.tenantId,
            tenantCode: user.tenantCode,
            userId: user.id,
            role: user.role,
            correlationId: correlationId || randomUUID(),
          },
          action.actionType,
          action.payload as Record<string, unknown>,
        );
        downstreamExecuted = true;
      }

      // Record success in DB
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        return tx.pendingAction.update({
          where: { id: pendingId },
          data: {
            status: 'executed',
            executedAt: new Date(),
            result: erpResult as Prisma.InputJsonValue,
          },
        });
      });

      // Write audit log
      const audit = await this.auditOutbox.record({
        tenantId: user.tenantId,
        correlationId: correlationId || randomUUID(),
        actorType: 'human',
        actorId: user.id,
        action: `ai.action.confirm.${action.actionType}`,
        resourceType: 'pending_action',
        resourceRef: pendingId,
        eventType: 'ai.action.confirmed',
        payload: {
          actionType: action.actionType,
          result: typeof erpResult === 'object' && erpResult !== null
            ? PiiRedaction.sanitizeForLogging(erpResult as Record<string, unknown>)
            : erpResult,
        } as Prisma.InputJsonValue,
        afterData: {
          actionType: action.actionType,
          arguments: PiiRedaction.sanitizeForLogging((action.payload as Record<string, unknown>) || {}),
          result: typeof erpResult === 'object' && erpResult !== null
            ? PiiRedaction.sanitizeForLogging(erpResult as Record<string, unknown>)
            : erpResult,
          decision: 'approved',
          approval: { approved_by: user.id },
        } as Prisma.InputJsonValue,
      });

      const recordId =
        (erpResult as any)?.record_id ||
        (erpResult as any)?.id ||
        (erpResult as any)?.name ||
        (erpResult as any)?.bookingId ||
        (erpResult as any)?.memberId;

      return {
        status: 'succeeded',
        record_id: recordId ? String(recordId) : undefined,
        audit_id: audit?.audit?.id,
      };
    } catch (err: any) {
      const errorMessage = err?.message || String(err);
      const sanitizedError = typeof errorMessage === 'string' ? PiiRedaction.redact(errorMessage).redacted : errorMessage;

      if (downstreamExecuted) {
        // Downstream ERP mutation completed, but local state update or audit logging threw an error.
        // DO NOT mark status: 'failed' to prevent misleading the user into double-executing side effects!
        this.logger.error(
          `DOWNSTREAM_MUTATION_UNCERTAIN: Action ${pendingId} (${action.actionType}) completed in ERP, but PostgreSQL update failed: ${errorMessage}`,
        );
        try {
          await this.prisma.withTenant(user.tenantId, async (tx) => {
            await tx.pendingAction.update({
              where: { id: pendingId },
              data: {
                status: 'executing',
                error: `DOWNSTREAM_SUCCEEDED_DB_FINALIZATION_FAILED: ${errorMessage}`,
              },
            });
          });
        } catch (dbErr) {
          this.logger.error(`Failed to record uncertain execution state for action ${pendingId}: ${(dbErr as Error)?.message}`);
        }

        return {
          status: 'failed',
          error: {
            code: 'EXECUTION_UNCERTAIN',
            message: 'Downstream operation succeeded but local state update encountered an error. Please do not re-submit. Check studio records before retrying.',
          },
        };
      }

      const isUncertain =
        err.code === 'OUTCOME_UNCERTAIN' ||
        err.code === 'EXECUTION_UNCERTAIN' ||
        errorMessage.includes('OUTCOME_UNCERTAIN') ||
        errorMessage.includes('EXECUTION_UNCERTAIN') ||
        err.status === 'uncertain';

      // Record failure / uncertain state in DB
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id: pendingId },
          data: {
            status: 'failed',
            error: errorMessage,
            ...(isUncertain ? { result: { outcome: 'uncertain', unresolved: true } as Prisma.InputJsonValue } : {}),
          },
        });
      });

      // Record failure audit log
      try {
        await this.auditOutbox.record({
          tenantId: user.tenantId,
          correlationId: correlationId || randomUUID(),
          actorType: 'human',
          actorId: user.id,
          action: `ai.action.confirm.error.${action.actionType}`,
          resourceType: 'pending_action',
          resourceRef: pendingId,
          eventType: 'ai.action.failed',
          payload: {
            actionType: action.actionType,
            error: sanitizedError,
          } as Prisma.InputJsonValue,
          afterData: {
            actionType: action.actionType,
            arguments: PiiRedaction.sanitizeForLogging((action.payload as Record<string, unknown>) || {}),
            result: 'failed',
            error: sanitizedError,
            decision: 'approved',
            approval: { approved_by: user.id },
          } as Prisma.InputJsonValue,
        });
      } catch (auditErr) {
        this.logger.warn(`Failed to record audit log for failed confirm: ${(auditErr as Error)?.message}`);
      }

      // Relay duplicate conflict or execution error verbatim with status
      const isDuplicate =
        errorMessage.toLowerCase().includes('duplicate') ||
        errorMessage.toLowerCase().includes('already exists') ||
        errorMessage.toLowerCase().includes('already registered') ||
        err.code === 'CONFLICT_DUPLICATE';

      return {
        status: 'failed',
        error: {
          code: isDuplicate
            ? 'CONFLICT_DUPLICATE'
            : isUncertain
              ? (err.code || 'OUTCOME_UNCERTAIN')
              : (err.code || 'EXECUTION_FAILED'),
          message: errorMessage,
        },
      };
    }
  }

  /**
   * POST /api/v1/ai/assistant/actions/:pending_id/reject
   * Contract: 200 { status: 'rejected' }
   * Security: Requesting user or owner/admin
   */
  @Post('assistant/actions/:pending_id/reject')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a pending action' })
  async rejectAssistantAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('pending_id') pendingId: string,
    @Body() dto: RejectActionContractDto,
  ) {
    const action = await this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.pendingAction.findFirst({
        where: { id: pendingId, tenantId: user.tenantId },
      });
    });

    if (!action) {
      throw new NotFoundException('Pending action not found');
    }

    if (action.userId !== user.id && user.role !== 'owner' && user.role !== 'admin') {
      throw new ForbiddenException('Only the requesting user or admin can reject this action');
    }

    if (new Date() > action.expiresAt) {
      await this.prisma.withTenant(user.tenantId, async (tx) => {
        await tx.pendingAction.update({
          where: { id: pendingId },
          data: { status: 'expired' },
        });
      });
      throw new HttpException(
        { error: { code: 'AI_ACTION_EXPIRED', message: 'Action has expired' } },
        HttpStatus.GONE,
      );
    }

    if (action.status !== 'proposed') {
      throw new ConflictException(`AI_ACTION_ALREADY_DECIDED: Cannot reject action in status ${action.status}`);
    }

    await this.pendingActionService.reject(user.tenantId, pendingId, user.id, dto?.reason || 'User rejected');

    try {
      await this.auditOutbox.record({
        tenantId: user.tenantId,
        correlationId: randomUUID(),
        actorType: 'human',
        actorId: user.id,
        action: `ai.action.reject.${action.actionType}`,
        resourceType: 'pending_action',
        resourceRef: pendingId,
        eventType: 'ai.action.rejected',
        payload: {
          actionType: action.actionType,
          reason: dto?.reason || 'User rejected',
        } as Prisma.InputJsonValue,
        afterData: {
          actionType: action.actionType,
          arguments: PiiRedaction.sanitizeForLogging((action.payload as Record<string, unknown>) || {}),
          result: 'rejected',
          decision: 'rejected',
          reason: dto?.reason || 'User rejected',
          approval: { approved_by: user.id },
        } as Prisma.InputJsonValue,
      });
    } catch (auditErr) {
      this.logger.warn(`Failed to record audit log for reject: ${(auditErr as Error)?.message}`);
    }

    return { status: 'rejected' };
  }

  // ============================================================
  // 12 AGENTS REGISTRY & EXECUTION ENDPOINTS
  // ============================================================

  @Get('agents')
  @RequirePermission('ai:query')
  @ApiOperation({
    summary: 'List all 12 authoritative AI agents and assistants',
    description: 'Retrieves live status, capabilities, and metrics across all 12 platform agents.',
  })
  async listAgents(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
  ) {
    if (!this.agentRegistry) {
      throw new InternalServerErrorException('AgentRegistryService not initialized');
    }
    return this.agentRegistry.getAgents(user.tenantId, user.role);
  }

  @Get('agents/:id')
  @RequirePermission('ai:query')
  @ApiOperation({
    summary: 'Get details for a specific AI agent',
    description: 'Retrieves capabilities, live health, and metrics for one agent.',
  })
  async getAgent(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
  ) {
    if (!this.agentRegistry) {
      throw new InternalServerErrorException('AgentRegistryService not initialized');
    }
    return this.agentRegistry.getAgent(user.tenantId, id, user.role);
  }

  @Post('agents/:id/execute')
  @RequirePermission('ai:query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute an authorized domain action on an AI agent',
    description: 'Dispatches action to the agent backend service with audit logging.',
  })
  async executeAgentAction(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: ExecuteAgentActionDto,
  ) {
    if (!this.agentRegistry) {
      throw new InternalServerErrorException('AgentRegistryService not initialized');
    }
    return this.agentRegistry.executeAgentAction(
      user.tenantId,
      user.tenantCode,
      id,
      dto.actionId,
      dto.payload || {},
      user,
    );
  }

  @Post('agents/:id/chat')
  @RequirePermission('ai:chat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Converse with a specific AI agent',
    description: 'Processes message through conversation loop scoped to agent persona and tools.',
  })
  async chatWithAgent(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Param('id') id: string,
    @Body() dto: AgentChatDto,
  ) {
    if (!this.agentRegistry) {
      throw new InternalServerErrorException('AgentRegistryService not initialized');
    }

    const correlationId = randomUUID();

    // Create or reuse conversation (mirrors main Copilot flow)
    let conversationId = dto.conversationId;
    if (!conversationId) {
      const conversation = await this.conversationService.create({
        tenantId: user.tenantId,
        userId: user.id,
        title: this.generateTitle(dto.message),
      });
      conversationId = conversation.id;
    }

    // Persist user message
    await this.conversationService.addMessage({
      conversationId,
      tenantId: user.tenantId,
      role: 'user',
      content: dto.message,
    });

    // Process message through agent
    const result = await this.agentRegistry.chatWithAgent(
      user.tenantId,
      user.tenantCode,
      id,
      dto.message,
      dto.history || [],
      user,
      conversationId,
    );

    // Persist assistant message
    await this.conversationService.addMessage({
      conversationId,
      tenantId: user.tenantId,
      role: 'assistant',
      content: result.response,
      toolCalls: result.toolCalls as any,
    });

    return {
      ...result,
      conversationId,
    };
  }

  /**
   * GET /api/v1/ai/audit
   * Contract: 200 [ { id, actor, tool, arguments_redacted, decision, approval, result, at } ]
   * Security: audit:read (Owner full, Admin limited); tenant-scoped
   */
  @Get('audit')
  @RequirePermission('audit:read')
  @ApiOperation({
    summary: 'Retrieve AI audit logs',
    description: 'Retrieves tenant-scoped audit records subject to authorization, tool filtering, and pagination.',
  })
  async getAiAudit(
    @CurrentUser() user: { id: string; tenantId: string; tenantCode: string; role: string },
    @Query('cursor') cursor?: string | Record<string, unknown>,
    @Query('user_id') userId?: string,
    @Query('tool') tool?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') rawLimit: number | string = 50,
    @Query('page') rawPage: number | string = 1,
    @Query('filter[user_id]') filterUserId?: string,
    @Query('filter[tool]') filterTool?: string,
    @Query('filter') filterObj?: { user_id?: string; tool?: string },
  ) {
    if (!user || !user.tenantId) {
      throw new UnauthorizedException('Authentication required');
    }

    if (!can(user.role, 'audit:read')) {
      throw new ForbiddenException('Insufficient permissions: audit:read required');
    }

    // Support positional arguments, query DTO object, or Document 5 filter[...] format
    let cursorParam = typeof cursor === 'string' ? cursor : undefined;
    let userIdParam = userId || filterUserId || filterObj?.user_id;
    let toolParam = tool || filterTool || filterObj?.tool;
    let fromParam = from;
    let toParam = to;
    let limitParam: any = rawLimit;
    let pageParam: any = rawPage;

    if (cursor && typeof cursor === 'object' && !Array.isArray(cursor)) {
      const q = cursor as any;
      cursorParam = typeof q.cursor === 'string' ? q.cursor : undefined;
      userIdParam = q.user_id || q['filter[user_id]'] || q.filter?.user_id || userIdParam;
      toolParam = q.tool || q['filter[tool]'] || q.filter?.tool || toolParam;
      fromParam = q.from || fromParam;
      toParam = q.to || toParam;
      limitParam = q.limit ?? rawLimit ?? 50;
      pageParam = q.page ?? rawPage ?? 1;
    }

    // Validate date range
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (fromParam) {
      const parsedFrom = Date.parse(fromParam);
      if (isNaN(parsedFrom)) {
        throw new BadRequestException('Invalid "from" date format. Expected valid ISO-8601 date string.');
      }
      fromDate = new Date(parsedFrom);
    }

    if (toParam) {
      const parsedTo = Date.parse(toParam);
      if (isNaN(parsedTo)) {
        throw new BadRequestException('Invalid "to" date format. Expected valid ISO-8601 date string.');
      }
      toDate = new Date(parsedTo);
    }

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('"from" date must be earlier than or equal to "to" date.');
    }

    // Validate limit and page
    const parsedLimit = Number(limitParam);
    if (isNaN(parsedLimit) || !Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      throw new BadRequestException('Invalid "limit". Limit must be an integer between 1 and 100.');
    }

    const parsedPage = Number(pageParam);
    if (isNaN(parsedPage) || !Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new BadRequestException('Invalid "page". Page must be an integer greater than or equal to 1.');
    }

    // Server-derived tenant scoping strictly enforced on every query
    const where: Prisma.AuditLogWhereInput = {
      tenantId: user.tenantId,
      ...(userIdParam ? { actorId: userIdParam } : {}),
      ...(toolParam ? { resourceRef: toolParam } : {}),
      ...(fromDate || toDate
        ? {
            createdAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    let logs;
    try {
      logs = await this.prisma.withTenant(user.tenantId, async (tx) => {
        return tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: parsedLimit,
          skip: cursorParam ? 1 : (parsedPage - 1) * parsedLimit,
          cursor: cursorParam ? { id: cursorParam } : undefined,
        });
      });
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      this.logger.error(`Database failure during audit retrieval for tenant ${user.tenantId}: ${err?.message}`);
      throw new InternalServerErrorException({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Failed to retrieve audit logs due to database error',
        code: 'DATABASE_ERROR',
      });
    }

    return logs.map((log) => {
      const afterData = (log.afterData as Record<string, unknown>) || {};
      const rawArgs =
        afterData.arguments ??
        afterData.payload ??
        (log.resourceType === 'tool' ? afterData : {});
      const argsObj =
        typeof rawArgs === 'object' && rawArgs !== null ? (rawArgs as Record<string, unknown>) : {};

      // Ensure credentials, PII (phone, email, cards, Aadhaar, PAN), and secrets are always redacted
      const sanitizedArgs = PiiRedaction.sanitizeForLogging(argsObj);

      const decision =
        afterData.decision ??
        (log.action.includes('reject')
          ? 'rejected'
          : log.action.includes('confirm') || log.action.includes('approve')
          ? 'approved'
          : null);

      const approval =
        (afterData.approval as { approved_by: string } | null) ??
        (log.actorId ? { approved_by: log.actorId } : null);

      let result: unknown = afterData.result;
      if (result && typeof result === 'object') {
        result = PiiRedaction.sanitizeForLogging(result as Record<string, unknown>);
      } else if (typeof result === 'string') {
        result = PiiRedaction.redactTextForAudit(result);
      } else if (result === undefined) {
        // Check action type and eventType for failure indicators
        const afterDataObj = (log.afterData as Record<string, unknown>) || {};
        const eventType = afterDataObj.eventType as string | undefined;
        const isFailureAction =
          log.action.includes('.error.') ||
          log.action.includes('.failed') ||
          log.action.includes('.unauthorized') ||
          eventType === 'ai.action.failed' ||
          eventType === 'ai.tool.failed';
        result = isFailureAction ? 'failed' : 'succeeded';
      }

      const toolName =
        (afterData.toolName as string) ??
        (afterData.actionType as string) ??
        (log.resourceType === 'tool' ? log.resourceRef : undefined) ??
        (log.action.startsWith('ai.action.confirm.')
          ? log.action.replace('ai.action.confirm.', '')
          : log.action.startsWith('ai.action.reject.')
          ? log.action.replace('ai.action.reject.', '')
          : log.action.startsWith('ai.tool.')
          ? log.action.replace('ai.tool.', '')
          : log.resourceRef || log.action);

      return {
        id: log.id,
        actor: log.actorId || log.actorType,
        tool: toolName,
        arguments_redacted: sanitizedArgs,
        decision,
        approval,
        result,
        at: (log.createdAt || log.occurredAt || new Date()).toISOString(),
      };
    });
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================
  private generateTitle(message: string): string {
    const words = message.trim().split(/\s+/).slice(0, 6).join(' ');
    return words.length > 50 ? words.slice(0, 47) + '...' : words;
  }

  private secureTokenEquals(supplied: string, stored: string): boolean {
    if (!supplied || !stored) {
      return false;
    }
    const suppliedBuf = Buffer.from(supplied, 'utf8');
    const storedBuf = Buffer.from(stored, 'utf8');
    return suppliedBuf.length === storedBuf.length && timingSafeEqual(suppliedBuf, storedBuf);
  }
}
