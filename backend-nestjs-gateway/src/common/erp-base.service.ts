import { Injectable } from '@nestjs/common';
import { ErpnextService } from '../erpnext/erpnext.service';

export interface ToolContext {
  tenantId: string;
  tenantCode: string;
  userId: string;
  role: string;
  correlationId: string;
  isConfirmedPendingAction?: boolean;
  idempotencyKey?: string;
  memberRef?: string;
}

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

@Injectable()
export abstract class ErpBaseService {
  constructor(protected readonly erp: ErpnextService) {}

  protected async callErp<T extends Record<string, unknown> = Record<string, unknown>>(
    context: ToolContext,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<ToolResult<T>> {
    try {
      const result = await this.erp.call({
        tenantId: context.tenantId,
        correlationId: context.correlationId,
        method,
        body,
      });
      return { success: true, data: result as T };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'ERP call failed';
      return { success: false, error: errorMessage };
    }
  }

  // Alias for backward compatibility - matches service call signatures
  protected async call<T extends Record<string, unknown> = Record<string, unknown>>(
    context: ToolContext,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<ToolResult<T>> {
    return this.callErp(context, method, body);
  }

  protected validateRequired(args: Record<string, unknown>, required: string[]): string | null {
    for (const field of required) {
      if (args[field] === undefined || args[field] === null || args[field] === '') {
        return `Missing required field: ${field}`;
      }
    }
    return null;
  }

  protected success<T>(data: T) {
    return { success: true, data };
  }

  protected error(message: string) {
    return { success: false, error: message };
  }
}