/**
 * Wellness Studio OS — AI Copilot Types & Contracts
 * Aligned with Official Document 5 (Section 6.1 & 6.2) and Document 6 (AI & Agent Architecture)
 */

export type AssistantResponseType =
  | 'answer'
  | 'question'
  | 'confirmation'
  | 'action_result'
  | 'out_of_scope'
  | 'handoff';

export interface CreateAssistantSessionPayload {
  locale?: string;
}

export interface AssistantSessionResponse {
  session_id: string;
  expires_at: string;
  tools: string[];
  disclaimer: string;
}

export interface PostAssistantMessagePayload {
  message: string;
  client_msg_id?: string;
}

export interface AssistantPendingActionPreview {
  id: string;
  tool: string;
  summary: string;
  arguments_preview?: Record<string, unknown>;
  expires_at: string;
  confirm_token?: string;
  confirmToken?: string;
  status?: string;
  error?: string | null;
  result?: Record<string, unknown> | null;
}

export interface AssistantToolUsed {
  name: string;
  status: string;
}

export interface AssistantMessageResponse {
  session_id: string;
  turn_no: number;
  type: AssistantResponseType;
  text: string;
  data?: Record<string, unknown>;
  pending_action?: AssistantPendingActionPreview;
  tools_used: AssistantToolUsed[];
  correlation_id: string;
}

export interface ConfirmActionPayload {
  confirm_token?: string;
  confirmToken?: string;
}

export interface RejectActionPayload {
  reason?: string;
}

export interface ActionExecutionResponse {
  status: 'succeeded' | 'failed' | 'uncertain';
  record_id?: string;
  error?: {
    code: string;
    message: string;
  };
  audit_id?: string;
}

export interface RejectActionResponse {
  status: 'rejected';
}

export interface AssistantTurnRecord {
  turn_no: number;
  role: string;
  content: string;
  tool_calls?: unknown;
  created_at: string;
}

export interface AssistantPendingActionSummary {
  id: string;
  tool: string;
  summary: string;
  status: string;
  expires_at: string;
  error?: string | null;
  result?: Record<string, unknown> | null;
}

export interface AssistantSessionDetails {
  session_id: string;
  turns: AssistantTurnRecord[];
  pending_actions: AssistantPendingActionSummary[];
}

export interface PendingActionItem {
  id: string;
  actionType: string;
  status: 'proposed' | 'approved' | 'rejected' | 'executing' | 'executed' | 'failed' | 'expired' | 'cancelled';
  payload: Record<string, unknown>;
  summary?: string;
  createdAt: string;
  expiresAt: string;
  proposedBy?: string;
  confirmToken?: string;
  confirm_token?: string;
  error?: string | null;
  result?: Record<string, unknown> | null;
}

export interface ActionResolutionState {
  pendingId: string;
  status: 'confirming' | 'rejecting' | 'confirmed' | 'rejected' | 'failed' | 'uncertain';
  outcome?: ActionExecutionResponse | RejectActionResponse;
  errorMessage?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: AssistantResponseType;
  data?: Record<string, unknown>;
  pendingAction?: AssistantPendingActionPreview;
  toolsUsed?: AssistantToolUsed[];
  correlationId?: string;
  createdAt: string;
  resolution?: ActionResolutionState;
}

// Backward-compatible aliases for legacy imports
export type Conversation = AssistantSessionResponse;
export type PendingAction = PendingActionItem;
export type AiChatResponse = AssistantMessageResponse;

export interface AiAuditLogItem {
  id: string;
  actor: string;
  tool: string;
  arguments_redacted: Record<string, unknown>;
  decision: 'approved' | 'rejected' | null;
  approval: { approved_by: string } | null;
  result: unknown;
  at: string;
}

export interface AiAuditQueryParams {
  cursor?: string;
  user_id?: string;
  'filter[user_id]'?: string;
  tool?: string;
  'filter[tool]'?: string;
  from?: string;
  to?: string;
  limit?: number;
  page?: number;
}