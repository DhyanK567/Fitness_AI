import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LlmObservabilityService } from './llm-observability.service';
import { LlmGatewayService } from '../gateway/llm-gateway.service';

@Injectable()
export class LlmObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new (require('@nestjs/common').Logger)(LlmObservabilityInterceptor.name);

  constructor(
    private readonly observability: LlmObservabilityService,
    private readonly llmGateway: LlmGatewayService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest();
    const correlationId = request.headers['x-correlation-id'] || randomUUID();
    const tenantId = request.headers['x-tenant-id'] || request.user?.tenantId;
    const userId = request.user?.id;

    // Add correlation ID to response headers
    const response = context.switchToHttp().getResponse();
    response.setHeader('X-Correlation-ID', correlationId);

    return next.handle().pipe(
      tap({
        next: (response) => {
          // Record metrics on successful response
          const latencyMs = Date.now() - startTime;
          
          if (response?.meta) {
            this.recordMetrics({
              correlationId,
              tenantId: tenantId || 'unknown',
              userId: userId || 'unknown',
              provider: response.meta.provider,
              model: response.meta.model,
              latencyMs: response.meta.latencyMs || latencyMs,
              inputTokens: response.meta.usage?.inputTokens || 0,
              outputTokens: response.meta.usage?.outputTokens || 0,
              totalTokens: (response.meta.usage?.inputTokens || 0) + (response.meta.usage?.outputTokens || 0),
              toolCallsCount: response.toolCalls?.length || 0,
              success: true,
              timestamp: new Date()
            });
          }
        },
        error: (error) => {
          const latencyMs = Date.now() - startTime;
          
          this.recordMetrics({
            correlationId,
            tenantId: tenantId || 'unknown',
            userId: userId || 'unknown',
            provider: 'unknown',
            model: 'unknown',
            latencyMs,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            toolCallsCount: 0,
            success: false,
            errorCode: error.code || 'unknown',
            errorMessage: error.message || 'Unknown error',
            timestamp: new Date()
          });
        }
      })
    );
  }

  private async recordMetrics(metrics: any): Promise<void> {
    try {
      await this.observability.recordLlmCall({
        correlationId: metrics.correlationId,
        tenantId: metrics.tenantId,
        userId: metrics.userId,
        provider: metrics.provider,
        model: metrics.model,
        latencyMs: metrics.latencyMs,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        totalTokens: metrics.totalTokens,
        toolCallsCount: metrics.toolCallsCount,
        success: metrics.success,
        errorCode: metrics.errorCode,
        errorMessage: metrics.errorMessage,
        timestamp: metrics.timestamp
      });
    } catch (error) {
      this.logger.error('Failed to record LLM metrics', error);
    }
  }
}