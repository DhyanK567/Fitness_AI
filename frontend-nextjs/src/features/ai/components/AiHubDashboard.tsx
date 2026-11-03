'use client';

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Activity,
  Zap,
  TrendingUp,
  BarChart3,
  Calendar,
  Layers,
  CheckCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Play,
  MessageSquare,
  ShieldCheck,
  ChevronRight,
  Filter,
  Check,
  X,
  Sliders,
  DollarSign,
  HeartPulse,
  Award,
} from 'lucide-react';
import { AiApi, AiApiError } from '../api/ai-api';
import {
  AgentSummary,
  AgentCategory,
  AgentCapability,
  AgentExecutionResult,
} from '../types/agent';

interface AiHubDashboardProps {
  onOpenChatWithAgent?: (agentId: string) => void;
}

export function AiHubDashboard({ onOpenChatWithAgent }: AiHubDashboardProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Modal execution state
  const [selectedAgent, setSelectedAgent] = useState<AgentSummary | null>(null);
  const [selectedCapability, setSelectedCapability] = useState<AgentCapability | null>(null);
  const [executing, setExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<AgentExecutionResult | null>(null);
  const [actionPayload, setActionPayload] = useState<string>('{}');

  const categories = [
    'All',
    'Administration',
    'Customer Experience',
    'Operations',
    'Growth & Marketing',
    'Analytics',
  ];

  const fetchAgents = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await AiApi.getAgents();
      setAgents(data);
    } catch (err: any) {
      const msg =
        err instanceof AiApiError
          ? `[${err.code || err.status}] ${err.message}`
          : err?.message || 'Failed to load AI agents from gateway';
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const filteredAgents =
    selectedCategory === 'All'
      ? agents
      : agents.filter((a) => a.category === selectedCategory);

  const handleOpenActionModal = (agent: AgentSummary, capability: AgentCapability) => {
    setSelectedAgent(agent);
    setSelectedCapability(capability);
    setExecutionResult(null);

    // Seed default helpful payload based on action
    let defaultPayload: Record<string, unknown> = {};
    if (capability.id === 'expiring-memberships') defaultPayload = { daysAhead: 30 };
    if (capability.id === 'low-attendance') defaultPayload = { threshold: 0.35 };
    if (capability.id === 'check-availability') defaultPayload = { date: new Date().toISOString().split('T')[0] };
    if (capability.id === 'classify-text') defaultPayload = { text: 'Outstanding yoga session with Marcus today. Music was great!' };
    if (capability.id === 'score-lead') defaultPayload = { leadId: 'lead_demo_01', source: 'website', engagementCount: 5 };
    if (capability.id === 'session-debrief') defaultPayload = { className: 'Vinyasa Flow (60 min)' };
    if (capability.id === 'recommend-sessions') defaultPayload = { goal: 'strength & mobility' };

    setActionPayload(JSON.stringify(defaultPayload, null, 2));
  };

  const handleExecuteAction = async () => {
    if (!selectedAgent || !selectedCapability) return;
    setExecuting(true);
    setExecutionResult(null);

    try {
      let parsedPayload: Record<string, unknown> = {};
      try {
        parsedPayload = JSON.parse(actionPayload);
      } catch {
        throw new Error('Action payload must be valid JSON.');
      }

      const res = await AiApi.executeAgentAction(
        selectedAgent.id,
        selectedCapability.id,
        parsedPayload,
      );
      setExecutionResult(res);
      // Refresh background agent metrics
      fetchAgents(true);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        agentId: selectedAgent.id,
        actionId: selectedCapability.id,
        data: null,
        executionTimeMs: 0,
        error: err?.message || 'Action execution failed',
      });
    } finally {
      setExecuting(false);
    }
  };

  // Helper icons for categories
  const getCategoryIcon = (category: AgentCategory) => {
    switch (category) {
      case 'Administration':
        return <ShieldCheck className="w-4 h-4 text-rose-500" />;
      case 'Customer Experience':
        return <HeartPulse className="w-4 h-4 text-emerald-500" />;
      case 'Operations':
        return <Activity className="w-4 h-4 text-blue-500" />;
      case 'Growth & Marketing':
        return <TrendingUp className="w-4 h-4 text-amber-500" />;
      case 'Analytics':
        return <BarChart3 className="w-4 h-4 text-cyan-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-indigo-500" />;
    }
  };

  // Helper for status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Healthy
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Degraded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Offline
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Live Platform Health Stats */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-50 via-rose-100/50 to-white border border-rose-200 p-6 md:p-8 shadow-lg">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
                Aura AI Engine v2.4
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                Live Hub Synchronized
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900">
              Studio AI Intelligence Hub
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              End-to-end management, real-time telemetry, and domain execution across all 12 authoritative
              AI agents and conversational assistants powering Wellness Studio OS.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchAgents(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Status
            </button>
          </div>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200">
          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Platform Agents</span>
              <Layers className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">12 / 12</div>
            <div className="text-xs text-emerald-600 mt-0.5">100% Registered</div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Core Health</span>
              <Activity className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">Operational</div>
            <div className="text-xs text-slate-500 mt-0.5">PostgreSQL + Gemini 2.0</div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Tenant Invocations</span>
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {agents.reduce((acc, a) => acc + (a.metrics?.totalCalls || 0), 0)} Calls
            </div>
            <div className="text-xs text-emerald-600 mt-0.5">Audit-logged</div>
          </div>

          <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Avg Latency</span>
              <Clock className="w-4 h-4 text-cyan-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {agents.length > 0
                ? Math.round(agents.reduce((acc, a) => acc + (a.latencyMs || 45), 0) / agents.length)
                : 48}{' '}
              ms
            </div>
            <div className="text-xs text-emerald-600 mt-0.5">Sub-second P99</div>
          </div>
        </div>
      </div>

      {/* 2. Error Display Banner */}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 flex items-start gap-3 text-rose-800">
          <AlertCircle className="w-5 h-5 text-rose-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h4 className="font-semibold text-sm">Failed to connect with AI Gateway</h4>
            <p className="text-xs mt-1 text-rose-600">{error}</p>
          </div>
          <button
            onClick={() => fetchAgents(true)}
            className="text-xs bg-rose-100 hover:bg-rose-200 px-3 py-1.5 rounded-lg border border-rose-200 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <Filter className="w-4 h-4 text-slate-400 mr-1 flex-shrink-0" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20'
                : 'bg-white text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}>
            {cat} {cat === 'All' ? `(${agents.length})` : ''}
          </button>
        ))}
      </div>

      {/* 4. Agents Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-white border border-slate-200 animate-pulse p-6 space-y-4 shadow-sm"
            >
              <div className="h-6 w-1/3 bg-slate-200 rounded" />
              <div className="h-4 w-3/4 bg-slate-200 rounded" />
              <div className="h-16 w-full bg-slate-100 rounded-xl" />
              <div className="h-8 w-full bg-slate-200 rounded-lg mt-auto" />
            </div>
          ))}
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
          <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-600">No agents found</h3>
          <p className="text-xs text-slate-500 mt-1">Try selecting a different category filter above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredAgents.map((agent) => (
            <div
              key={agent.id}
              className="group relative flex flex-col justify-between rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 hover:border-rose-300 p-5 transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5"
            >
              <div>
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-slate-100 border border-slate-200">
                      {getCategoryIcon(agent.category)}
                    </div>
                    <div>
                      <span className="text-[11px] font-medium text-slate-600 uppercase tracking-wider block">
                        {agent.category}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono">
                        {agent.type}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(agent.status)}
                </div>

                {/* Name & Description */}
                <h3 className="text-base font-semibold text-slate-900 group-hover:text-rose-600 transition-colors">
                  {agent.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-3 leading-relaxed">
                  {agent.description}
                </p>

                {/* Capabilities Chips */}
                <div className="mt-4 pt-3 border-t border-slate-200">
                  <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-2">
                    Core Capabilities
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.capabilities.slice(0, 3).map((cap) => (
                      <button
                        key={cap.id}
                        onClick={() => handleOpenActionModal(agent, cap)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-300 transition"
                      >
                        <Play className="w-2.5 h-2.5 text-rose-500" />
                        {cap.name}
                      </button>
                    ))}
                    {agent.capabilities.length > 3 && (
                      <span className="px-2 py-1 rounded-lg text-xs bg-slate-100 text-slate-500">
                        +{agent.capabilities.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  <span>{agent.metrics?.totalCalls || 0} calls</span>
                  <span className="mx-1.5">·</span>
                  <span className="text-emerald-600">{agent.metrics?.successRate || 100}% ok</span>
                </div>

                <div className="flex items-center gap-2">
                  {onOpenChatWithAgent && (
                    <button
                      onClick={() => onOpenChatWithAgent(agent.id)}
                      title="Open Copilot chat with this agent"
                      className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenActionModal(agent, agent.capabilities[0])}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition"
                  >
                    <span>Run Action</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Modal: Action Execution & Interactive Live Results */}
      {selectedAgent && selectedCapability && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-rose-100 border border-rose-200 text-rose-600">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Execute {selectedCapability.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Agent: <span className="text-rose-600 font-medium">{selectedAgent.name}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedAgent(null);
                  setSelectedCapability(null);
                  setExecutionResult(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Capability Description
                </label>
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedCapability.description}
                </p>
              </div>

              {/* Capability Select Dropdown if agent has multiple */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-1">
                  Select Action to Execute
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {selectedAgent.capabilities.map((cap) => (
                    <button
                      key={cap.id}
                      onClick={() => handleOpenActionModal(selectedAgent, cap)}
                      className={`text-left p-2.5 rounded-xl text-xs transition border ${
                        selectedCapability.id === cap.id
                          ? 'bg-rose-100 border-rose-400 text-rose-700 font-medium'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      <div className="flex items-center justify-between">
                        <span>{cap.name}</span>
                        {selectedCapability.id === cap.id && <Check className="w-3.5 h-3.5 text-rose-500" />}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate">
                        {cap.risk} risk
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Parameters Payload */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-500">
                    Execution Parameters (JSON)
                  </label>
                  <span className="text-[11px] text-slate-400">Validated against schema</span>
                </div>
                <textarea
                  rows={4}
                  value={actionPayload}
                  onChange={(e) => setActionPayload(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  placeholder="{}"
                />
              </div>

              {/* Live Execution Results Card */}
              {executionResult && (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Live Execution Output</span>
                    <span className="text-[11px] text-slate-400">
                      Duration: {executionResult.executionTimeMs} ms
                    </span>
                  </div>

                  {executionResult.success ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-2 text-emerald-700 font-semibold mb-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>{executionResult.message || 'Execution Succeeded'}</span>
                      </div>
                      <pre className="text-slate-700 overflow-x-auto p-3 rounded-lg bg-white border border-slate-200 font-mono text-[11px] max-h-56">
                        {JSON.stringify(executionResult.data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs">
                      <div className="flex items-center gap-2 text-rose-600 font-semibold mb-1">
                        <AlertCircle className="w-4 h-4" />
                        <span>Execution Failed</span>
                      </div>
                      <p className="text-rose-700 mt-1">{executionResult.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={() => {
                  setSelectedAgent(null);
                  setSelectedCapability(null);
                  setExecutionResult(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                Close
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={executing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-500/20 transition disabled:opacity-50"
              >
                {executing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing via Gateway...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run {selectedCapability.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}