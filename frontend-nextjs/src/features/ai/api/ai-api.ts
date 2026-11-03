/**
 * Wellness Studio OS — AI Copilot API Client
 * Interfacing directly with NestJS Gateway AI Controller endpoints (/api/v1/ai/...)
 * Aligned with Document 5 §6.1 & §6.2
 */

import {
  ActionExecutionResponse,
  AiAuditLogItem,
  AiAuditQueryParams,
  AssistantMessageResponse,
  AssistantSessionDetails,
  AssistantSessionResponse,
  CreateAssistantSessionPayload,
  PendingActionItem,
  PostAssistantMessagePayload,
  RejectActionResponse,
} from '../types';
import { AgentSummary, AgentExecutionResult } from '../types/agent';
import { resolveClientTenantHost } from '@/lib/tenant';

export class AiApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class AiApi {
  public static getBaseUrl(): string {
    const raw = process.env.NEXT_PUBLIC_API_URL
      ? process.env.NEXT_PUBLIC_API_URL.trim()
      : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001');
    return raw.replace(/\/+$/, '').replace(/\/api\/v1\/?$/, '');
  }

  public static getEndpoint(path: string): string {
    const base = this.getBaseUrl();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    if (cleanPath.startsWith('/api/v1/ai')) {
      return `${base}${cleanPath}`;
    }
    if (cleanPath.startsWith('/api/v1')) {
      return `${base}/api/v1/ai${cleanPath.slice('/api/v1'.length)}`;
    }
    return `${base}/api/v1/ai${cleanPath}`;
  }

  public static getAuthHeaders(): Record<string, string> {
    const tenantHost = resolveClientTenantHost();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(tenantHost ? { 'Host': tenantHost, 'x-tenant-host': tenantHost } : {}),
    };

    if (typeof window !== 'undefined') {
      const token =
        localStorage.getItem('ws_staff_token') ||
        localStorage.getItem('ws_member_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  private static async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = this.getEndpoint(path);
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers as Record<string, string>),
    };

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    let payload: any = null;
    let rawText: string | null = null;
    try {
      if (typeof res.json === 'function') {
        payload = await res.json();
      } else if (typeof res.text === 'function') {
        rawText = await res.text();
        payload = rawText ? JSON.parse(rawText) : null;
      }
    } catch {
      try {
        if (typeof res.text === 'function') {
          rawText = await res.text();
        }
      } catch {
        rawText = null;
      }
      payload = null;
    }

    if (!res.ok) {
      const code =
        payload?.error?.code ||
        payload?.code ||
        (res.status === 410
          ? 'AI_ACTION_EXPIRED'
          : res.status === 409
            ? 'AI_ACTION_ALREADY_DECIDED'
            : res.status === 403
              ? 'PERMISSION_DENIED'
              : res.status === 401
                ? 'UNAUTHORIZED'
                : res.status === 404
                  ? 'NOT_FOUND'
                  : 'API_ERROR');

      const message =
        payload?.error?.message ||
        (Array.isArray(payload?.message) ? payload.message.join('; ') : payload?.message) ||
        (rawText && rawText.length < 300 ? rawText : `Request failed with status ${res.status} (${res.statusText})`);

      throw new AiApiError(message, res.status, code, payload);
    }

    // Auto-unwrap NestJS ResponseEnvelopeInterceptor wrapper { success: true, data: T, request_id }
    if (
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      (payload.success === true || 'request_id' in payload)
    ) {
      return payload.data as T;
    }

    return payload as T;
  }

  /**
   * POST /api/v1/ai/assistant/sessions
   * Initializes a real authenticated assistant session on the NestJS gateway.
   */
  static async createSession(
    payload?: CreateAssistantSessionPayload,
  ): Promise<AssistantSessionResponse> {
    return this.request<AssistantSessionResponse>('/assistant/sessions', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  /**
   * POST /api/v1/ai/assistant/sessions/:id/messages
   * Sends user prompt into the session context and receives real AssistantMessageResponse.
   */
  static async sendMessage(
    sessionId: string,
    message: string,
    clientMsgId?: string,
  ): Promise<AssistantMessageResponse> {
    const body: PostAssistantMessagePayload = {
      message,
      ...(clientMsgId ? { client_msg_id: clientMsgId } : {}),
    };

    return this.request<AssistantMessageResponse>(
      `/assistant/sessions/${encodeURIComponent(sessionId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * POST /api/v1/ai/pending-actions/:id/approval-token
   * Requests single-use approval token for an authorized administrator reviewing a pending action.
   */
  static async requestApprovalToken(
    pendingId: string,
  ): Promise<{ confirm_token: string }> {
    return this.request<{ confirm_token: string }>(
      `/pending-actions/${encodeURIComponent(pendingId)}/approval-token`,
      {
        method: 'POST',
      },
    );
  }

  /**
   * POST /api/v1/ai/assistant/actions/:pending_id/confirm
   * Confirms and executes a pending action proposed by the assistant.
   * If confirmToken is not provided, automatically requests a single-use approval token.
   */
  static async confirmAction(
    pendingId: string,
    confirmToken?: string,
  ): Promise<ActionExecutionResponse> {
    let token = confirmToken;
    if (!token) {
      const res = await this.requestApprovalToken(pendingId);
      token = res?.confirm_token;
    }
    const body = token ? { confirm_token: token } : {};

    return this.request<ActionExecutionResponse>(
      `/assistant/actions/${encodeURIComponent(pendingId)}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * POST /api/v1/ai/assistant/actions/:pending_id/reject
   * Rejects a proposed pending action.
   */
  static async rejectAction(
    pendingId: string,
    reason?: string,
  ): Promise<RejectActionResponse> {
    const body = reason ? { reason } : {};

    return this.request<RejectActionResponse>(
      `/assistant/actions/${encodeURIComponent(pendingId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * GET /api/v1/ai/assistant/sessions/:id
   * Retrieves conversation turns and pending actions for a session.
   */
  static async getSession(sessionId: string): Promise<AssistantSessionDetails> {
    return this.request<AssistantSessionDetails>(
      `/assistant/sessions/${encodeURIComponent(sessionId)}`,
    );
  }

  /**
   * DELETE /api/v1/ai/assistant/sessions/:id
   * Purges assistant session and its messages.
   */
  static async deleteSession(sessionId: string): Promise<void> {
    return this.request<void>(
      `/assistant/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
      },
    );
  }

  /**
   * GET /api/v1/ai/pending-actions?status=proposed
   * Lists pending approval actions across the tenant with optional pagination.
   */
  static async getPendingActions(
    params?: string | { status?: string; page?: number; limit?: number },
  ): Promise<{
    actions: PendingActionItem[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  }> {
    const qs = new URLSearchParams();
    if (typeof params === 'string') {
      qs.set('status', params);
    } else if (params) {
      if (params.status) qs.set('status', params.status);
      if (params.page) qs.set('page', String(params.page));
      if (params.limit) qs.set('limit', String(params.limit));
    } else {
      qs.set('status', 'proposed');
    }
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<{
      actions: PendingActionItem[];
      total?: number;
      page?: number;
      limit?: number;
      totalPages?: number;
    }>(`/pending-actions${query}`);
  }

  /**
   * GET /api/v1/ai/audit
   * Retrieves AI audit logs for the tenant.
   */
  static async getAuditLogs(
    params?: AiAuditQueryParams,
  ): Promise<AiAuditLogItem[]> {
    const qs = new URLSearchParams();
    if (params?.cursor) qs.set('cursor', params.cursor);
    const userId = params?.user_id || params?.['filter[user_id]'];
    if (userId) qs.set('user_id', userId);
    const tool = params?.tool || params?.['filter[tool]'];
    if (tool) qs.set('tool', tool);
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.page) qs.set('page', String(params.page));
    const query = qs.toString() ? `?${qs.toString()}` : '';
    return this.request<AiAuditLogItem[]>(`/audit${query}`);
  }

  /**
   * GET /api/v1/ai/agents
   * Retrieves all 12 authoritative AI agents with live health and metrics
   */
  static async getAgents(): Promise<AgentSummary[]> {
    return this.request<AgentSummary[]>('/agents');
  }

  /**
   * GET /api/v1/ai/agents/:id
   * Retrieves single agent details and capabilities
   */
  static async getAgent(agentId: string): Promise<AgentSummary> {
    return this.request<AgentSummary>(`/agents/${encodeURIComponent(agentId)}`);
  }

  /**
   * POST /api/v1/ai/agents/:id/execute
   * Executes an authorized action on an agent
   */
  static async executeAgentAction(
    agentId: string,
    actionId: string,
    payload: Record<string, unknown> = {},
  ): Promise<AgentExecutionResult> {
    return this.request<AgentExecutionResult>(
      `/agents/${encodeURIComponent(agentId)}/execute`,
      {
        method: 'POST',
        body: JSON.stringify({ actionId, payload }),
      },
    );
  }

  /**
   * POST /api/v1/ai/agents/:id/chat
   * Converse with a specific agent
   */
  static async chatWithAgent(
    agentId: string,
    message: string,
    history: any[] = [],
    conversationId?: string,
  ): Promise<any> {
    return this.request<any>(
      `/agents/${encodeURIComponent(agentId)}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({ message, history, conversationId }),
      },
    );
  }
}