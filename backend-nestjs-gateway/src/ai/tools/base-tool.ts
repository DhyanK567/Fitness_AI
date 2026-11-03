import { Injectable } from '@nestjs/common';
import { ErpnextService } from '../../erpnext/erpnext.service';
import { ERP_METHODS } from '@wsos/erp-methods';

export interface ToolContext {
  tenantId: string;
  userId: string;
  role: string;
  correlationId: string;
  isConfirmedPendingAction?: boolean;
  idempotencyKey?: string;
  memberRef?: string;
}

export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Tool execution wrapper for consistent interface
 */
export interface AiTool {
  readonly name?: string;
  execute(context: ToolContext, args?: any): Promise<ToolResult | any>;
}

/**
 * Base class for all AI tools
 * Provides common ERP calling functionality and error handling
 */
@Injectable()
export abstract class BaseTool implements AiTool {
  constructor(protected readonly erp: ErpnextService) {}

  abstract execute(context: ToolContext, args: any): Promise<ToolResult>;

  /**
   * Call an ERP method with standard context
   */
  protected async callErp<T extends object = object>(
    context: ToolContext,
    method: string,
    body?: Record<string, unknown>,
    httpMethod?: 'GET' | 'POST',
  ): Promise<ToolResult<T>> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        userId: context.userId,
        role: context.role,
        method,
        body,
        httpMethod,
        idempotencyKey: context.idempotencyKey,
      });
      return { success: true, data: result as T };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ERP call failed';
      const isTimeout =
        errorMessage.toLowerCase().includes('timeout') ||
        errorMessage.toLowerCase().includes('unavailable') ||
        (error as any)?.code === 'ECONNABORTED' ||
        (error as any)?.code === 'ETIMEDOUT' ||
        (error as any)?.status === 504 ||
        (error as any)?.status === 408;
      const effectiveMethod = httpMethod || (method.includes('.get') || method.includes('.list') || method.includes('.report') ? 'GET' : 'POST');
      const isMutation = (effectiveMethod === 'POST' || Boolean(context.isConfirmedPendingAction) || Boolean(context.idempotencyKey)) &&
        !method.includes('.get') && !method.includes('.list') && !method.includes('.report');
      return {
        success: false,
        error: errorMessage,
        errorCode: isMutation && isTimeout ? 'TIMEOUT_UNCERTAIN' : 'ERP_CALL_FAILED',
      };
    }
  }

  /**
   * Validate required fields in args
   */
  protected validateRequired(args: Record<string, unknown>, required: string[]): string | null {
    for (const field of required) {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }

  /**
   * Format success response
   */
  protected success<T>(data: T): ToolResult<T> {
    return { success: true, data };
  }

  /**
   * Format error response
   */
  protected error(message: string, errorCode?: string): ToolResult<never> {
    return { success: false, error: message, errorCode };
  }
}
