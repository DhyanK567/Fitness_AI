import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Prisma } from '@prisma/client';

export interface LlmCallMetrics {
  correlationId: string;
  tenantId: string;
  userId: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolCallsCount: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  timestamp: Date;
}

export interface ToolCallMetrics {
  correlationId: string;
  tenantId: string;
  userId: string;
  toolName: string;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  timestamp: Date;
}

export interface PendingActionMetrics {
  correlationId: string;
  tenantId: string;
  userId: string;
  actionType: string;
  status: string;
  durationMs: number;
  timestamp: Date;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
function toUuid(val?: string | null): string {
  if (val && UUID_REGEX.test(val)) return val;
  return NIL_UUID;
}

@Injectable()
export class LlmObservabilityService {
  private readonly logger = new Logger(LlmObservabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordLlmCall(metrics: LlmCallMetrics): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ai.llm_call_metrics (
          correlation_id, tenant_id, user_id, provider, model, 
          latency_ms, input_tokens, output_tokens, total_tokens,
          tool_calls_count, success, error_code, error_message, timestamp
        ) VALUES (
          CAST(${toUuid(metrics.correlationId)} AS uuid), CAST(${toUuid(metrics.tenantId)} AS uuid), CAST(${toUuid(metrics.userId)} AS uuid),
          ${metrics.provider}, ${metrics.model}, ${metrics.latencyMs},
          ${metrics.inputTokens}, ${metrics.outputTokens}, ${metrics.totalTokens},
          ${metrics.toolCallsCount}, ${metrics.success}, ${metrics.errorCode || null},
          ${metrics.errorMessage || null}, ${metrics.timestamp}
        )
      `;
    } catch (error) {
      this.logger.error('Failed to record LLM call metrics', error);
    }
  }

  async recordToolCall(metrics: ToolCallMetrics): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ai.tool_call_metrics (
          correlation_id, tenant_id, user_id, tool_name,
          latency_ms, success, error_code, error_message, timestamp
        ) VALUES (
          CAST(${toUuid(metrics.correlationId)} AS uuid), CAST(${toUuid(metrics.tenantId)} AS uuid), CAST(${toUuid(metrics.userId)} AS uuid),
          ${metrics.toolName}, ${metrics.latencyMs}, ${metrics.success},
          ${metrics.errorCode || null}, ${metrics.errorMessage || null}, ${metrics.timestamp}
        )
      `;
    } catch (error) {
      this.logger.error('Failed to record tool call metrics', error);
    }
  }

  async recordPendingAction(metrics: PendingActionMetrics): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO ai.pending_action_metrics (
          correlation_id, tenant_id, user_id, action_type,
          status, duration_ms, timestamp
        ) VALUES (
          CAST(${toUuid(metrics.correlationId)} AS uuid), CAST(${toUuid(metrics.tenantId)} AS uuid), CAST(${toUuid(metrics.userId)} AS uuid),
          ${metrics.actionType}, ${metrics.status}, ${metrics.durationMs}, ${metrics.timestamp}
        )
      `;
    } catch (error) {
      this.logger.error('Failed to record pending action metrics', error);
    }
  }

  async getLlmUsageStats(tenantId: string, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        DATE_TRUNC('day', timestamp) as day,
        COUNT(*) as total_calls,
        SUM(input_tokens + output_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens
      FROM ai.llm_call_metrics
      WHERE tenant_id = ${tenantId} AND timestamp >= ${since}
      GROUP BY DATE_TRUNC('day', timestamp)
      ORDER BY day DESC
    `;

    const totals = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total_calls,
        SUM(input_tokens + output_tokens) as total_tokens,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate,
        SUM(input_tokens) as total_input_tokens,
        SUM(output_tokens) as total_output_tokens
      FROM ai.llm_call_metrics
      WHERE tenant_id = ${tenantId} AND timestamp >= ${since}
    `;

    return {
      daily: stats,
      totals: totals[0] || {}
    };
  }

  async getToolUsageStats(tenantId: string, days: number = 30): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        tool_name,
        COUNT(*) as total_calls,
        AVG(latency_ms) as avg_latency_ms,
        SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
      FROM ai.tool_call_metrics
      WHERE tenant_id = ${tenantId} AND timestamp >= ${since}
      GROUP BY tool_name
      ORDER BY total_calls DESC
    `;

    return stats;
  }

  async getErrorStats(tenantId: string, days: number = 7): Promise<any> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const llmErrors = await this.prisma.$queryRaw<any[]>`
      SELECT 
        error_code,
        COUNT(*) as count
      FROM ai.llm_call_metrics
      WHERE tenant_id = ${tenantId} 
        AND timestamp >= ${since}
        AND success = false
      GROUP BY error_code
      ORDER BY count DESC
    `;

    const toolErrors = await this.prisma.$queryRaw<any[]>`
      SELECT 
        tool_name,
        error_code,
        COUNT(*) as count
      FROM ai.tool_call_metrics
      WHERE tenant_id = ${tenantId} 
        AND timestamp >= ${since}
        AND success = false
      GROUP BY tool_name, error_code
      ORDER BY count DESC
    `;

    return {
      llmErrors,
      toolErrors
    };
  }

  async getCostEstimate(tenantId: string, days: number = 30): Promise<any> {
    const stats = await this.getLlmUsageStats(tenantId, days);
    const totals = stats.totals;
    
    // Rough cost estimates (adjust based on actual provider pricing)
    const costPer1kInputTokens = 0.0001; // $0.0001 per 1K input tokens (Gemini 1.5 Flash)
    const costPer1kOutputTokens = 0.0004; // $0.0004 per 1K output tokens
    
    const inputCost = (totals.total_input_tokens || 0) / 1000 * costPer1kInputTokens;
    const outputCost = (totals.total_output_tokens || 0) / 1000 * costPer1kOutputTokens;
    
    return {
      estimatedCostUsd: inputCost + outputCost,
      inputTokens: totals.total_input_tokens || 0,
      outputTokens: totals.total_output_tokens || 0,
      totalTokens: totals.total_tokens || 0,
      currency: 'USD'
    };
  }
}