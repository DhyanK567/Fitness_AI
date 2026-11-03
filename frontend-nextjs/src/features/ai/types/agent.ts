export type AgentType = 'assistant' | 'agent';
export type AgentCategory =
  | 'Administration'
  | 'Customer Experience'
  | 'Operations'
  | 'Growth & Marketing'
  | 'Analytics';
export type AgentHealthStatus = 'healthy' | 'degraded' | 'offline';

export interface AgentCapability {
  id: string;
  name: string;
  description: string;
  risk: 'read' | 'write' | 'internal';
  requiresConfirmation?: boolean;
}

export interface AgentMetricSummary {
  totalCalls: number;
  successRate: number;
  lastExecutedAt: string | null;
  avgLatencyMs: number;
}

export interface AgentSummary {
  id: string;
  name: string;
  type: AgentType;
  category: AgentCategory;
  description: string;
  status: AgentHealthStatus;
  latencyMs: number;
  requiredRoles: string[];
  isAccessible: boolean;
  capabilities: AgentCapability[];
  metrics: AgentMetricSummary;
}

export interface AgentExecutionResult {
  success: boolean;
  agentId: string;
  actionId: string;
  data: unknown;
  executionTimeMs: number;
  message?: string;
  error?: string;
}
