'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAiStore } from '../stores/aiStore';
import { AiApi, AiApiError } from '../api/ai-api';
import { ChatInput } from '../components/ChatInput';
import { MessageList } from '../components/MessageList';
import { PendingActionsPanel } from '../components/PendingActionsPanel';
import { AiAuditLogsPanel } from '../components/AiAuditLogsPanel';
import { ConversationHistory } from '../components/ConversationHistory';
import { AiHubDashboard } from '../components/AiHubDashboard';
import {
  SparklesIcon,
  ShieldAlertIcon,
  MessageSquareIcon,
  MessageSquarePlusIcon,
  FileTextIcon,
  AlertCircleIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  LayoutGridIcon,
  ZapIcon,
  UsersIcon,
  CalendarIcon,
  TargetIcon,
  TrendingUpIcon,
  BarChartIcon,
  HelpCircleIcon,
  ChevronDownIcon,
  XIcon,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChatMessage } from '../types';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Example query groups for the welcome state
const EXAMPLE_QUERY_GROUPS = [
  {
    group: 'Administration',
    queries: [
      'Summarize my studio\'s current operational status.',
      'What operational issues need my attention today?',
      'Summarize staff performance using available data.',
    ],
  },
  {
    group: 'Members',
    queries: [
      'Find members whose memberships are expiring soon.',
      'Identify members with incomplete contact information.',
      'Suggest ways to improve member retention.',
    ],
  },
  {
    group: 'Bookings',
    queries: [
      'Show today\'s scheduled classes.',
      'Summarize today\'s bookings and attendance.',
      'Check available slots for tomorrow.',
    ],
  },
  {
    group: 'CRM and Growth',
    queries: [
      'Which enquiries need follow-up?',
      'How can we improve enquiry-to-membership conversion?',
      'Draft a 30-day member-retention campaign for review.',
    ],
  },
  {
    group: 'Insights',
    queries: [
      'Summarize common member complaints from available feedback.',
      'Which classes are most popular in the available data?',
      'Summarize available membership and growth trends.',
    ],
  },
  {
    group: 'AI Help',
    queries: [
      'Explain which AI agents are available and what they can do.',
      'What information do you need to generate a reliable studio report?',
      'Summarize this conversation and list the next steps.',
    ],
  },
] as const;

type ExampleQueryGroup = typeof EXAMPLE_QUERY_GROUPS[number];

// Welcome state component shown before first message
function WelcomeState({
  onSelectExample,
  currentAgentId,
  onAgentChange,
  agents,
  isThinking,
}: {
  onSelectExample: (query: string) => void;
  currentAgentId: string | null;
  onAgentChange: (agentId: string | null) => void;
  agents: Array<{ id: string; name: string }>;
  isThinking: boolean;
}) {
  return (
    <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center p-6 space-y-6">
      {/* Welcome Header */}
      <div className="max-w-2xl">
        <div className="h-14 w-14 bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-200 mx-auto mb-4">
          <SparklesIcon size={28} />
        </div>
        <h3 className="text-lg font-serif font-bold text-slate-900">
          What can I help you manage today?
        </h3>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed max-w-md mx-auto">
          I can answer questions, retrieve live studio data, and propose operational actions that require your approval.
        </p>
      </div>

      {/* Current Agent Selector */}
      <div className="w-full max-w-md mx-auto">
        <label htmlFor="agent-select" className="block text-[11px] font-medium text-slate-700 mb-1.5">
          Current Agent
        </label>
        <div className="relative">
          <select
            id="agent-select"
            value={currentAgentId || ''}
            onChange={(e) => onAgentChange(e.target.value || null)}
            disabled={isThinking}
            className="w-full h-10 pl-3 pr-10 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 disabled:opacity-50 text-slate-800 appearance-none bg-white"
          >
            <option value="">General Admin Copilot</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <ChevronDownIcon size={14} />
          </div>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 text-left">
          {currentAgentId
            ? agents.find((a) => a.id === currentAgentId)?.name || 'Unknown Agent'
            : 'Using general admin copilot — responses draw on all available tools.'}
        </p>
      </div>

      {/* Example Query Groups */}
      <div className="w-full max-w-3xl mx-auto">
        <p className="text-[11px] font-semibold text-slate-600 mb-3 text-left">Example queries by topic</p>
        <div className="space-y-3 max-h-[320px] overflow-y-auto">
          {EXAMPLE_QUERY_GROUPS.map((group: ExampleQueryGroup) => (
            <div key={group.group} className="bg-white border border-slate-200 rounded-xl p-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 mb-2">
                <span className="text-rose-600">{group.group}</span>
                <span className="ml-auto text-[10px] text-slate-400 font-mono">
                  {group.queries.length} queries
                </span>
              </div>
              <div className="space-y-2 pt-2 border-t border-slate-100">
                {group.queries.map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => onSelectExample(query)}
                    disabled={isThinking}
                    className="w-full text-left text-xs bg-white border border-slate-200 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50 text-slate-600 px-3 py-2 rounded-xl shadow-xs transition-colors text-left"
                  >
                    {query}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Guidance Footer */}
      <div className="w-full max-w-2xl mx-auto pt-4 border-t border-slate-200">
        <p className="text-[10px] text-slate-500 leading-relaxed">
          <strong className="text-slate-700">Note:</strong> Responses depend on available studio data and your permissions.
        </p>
      </div>
    </div>
  );
}

export function AiCopilotPage() {
  const {
    sessionId,
    sessionExpiry,
    disclaimer,
    messages,
    addMessage,
    isThinking,
    setThinking,
    activeTool,
    setSession,
    errorMessage,
    setErrorMessage,
    currentAgentId,
    setCurrentAgent,
  } = useAiStore();

  const [activeTab, setActiveTab] = useState<'chat' | 'hub' | 'pending' | 'audit'>('chat');
  const [initError, setInitError] = useState<string | null>(null);
  const initializingRef = useRef(false);

  // Auto-initialize session on mount if none active or expired
  useEffect(() => {
    async function ensureSession() {
      if (sessionId && sessionExpiry && new Date(sessionExpiry) > new Date()) {
        return; // Valid session already active
      }
      if (initializingRef.current) return;
      initializingRef.current = true;

      setThinking(true);
      setInitError(null);
      try {
        const session = await AiApi.createSession();
        setSession(session);
      } catch (err: any) {
        const msg =
          err instanceof AiApiError
            ? `[${err.code || err.status}] ${err.message}`
            : err?.message || 'Failed to connect to AI gateway session';
        setInitError(msg);
      } finally {
        setThinking(false);
        initializingRef.current = false;
      }
    }

    ensureSession();
  }, [sessionId, sessionExpiry, setSession, setThinking]);

  const handleSend = async (content: string) => {
    let currentSessionId = sessionId;

    // If session is missing or expired, attempt creation on-the-fly
    if (!currentSessionId || (sessionExpiry && new Date(sessionExpiry) <= new Date())) {
      setThinking(true);
      try {
        const newSession = await AiApi.createSession();
        setSession(newSession);
        currentSessionId = newSession.session_id;
      } catch (err: any) {
        setErrorMessage(
          `Unable to start session: ${err?.message || 'Gateway connection error'}`,
        );
        setThinking(false);
        return;
      }
    }

    const userMessageId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    addMessage(userMsg);

    setThinking(true);
    setErrorMessage(null);

    try {
      let res: any;

      if (currentAgentId) {
        // Agent-specific chat path
        res = await AiApi.chatWithAgent(currentAgentId, content, [], currentSessionId);
      } else {
        // General admin copilot path
        res = await AiApi.sendMessage(currentSessionId, content);
      }

      const assistantMsg: ChatMessage = {
        id: `${res.session_id}_turn_${res.turn_no}_${Date.now()}`,
        role: 'assistant',
        content: res.text,
        type: res.type,
        data: res.data,
        pendingAction: res.pending_action,
        toolsUsed: res.tools_used,
        correlationId: res.correlation_id,
        createdAt: new Date().toISOString(),
      };

      addMessage(assistantMsg);

      // If pending action was proposed, we display it inline in MessageList,
      // and staff can also inspect it in the approvals tab
    } catch (err: any) {
      const isExpired =
        err instanceof AiApiError && (err.status === 404 || err.status === 410);
      const isAuth =
        err instanceof AiApiError && (err.status === 401 || err.status === 403);

      let errorText = err?.message || 'Failed to communicate with AI gateway';
      if (isExpired) {
        errorText =
          'Your AI session has expired or was not found on the server. Please start a new session.';
      } else if (isAuth) {
        errorText =
          'Authentication failed or insufficient permissions (ai:query required).';
      }

      const systemMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'system',
        content: `⚠️ **Gateway Error**: ${errorText}`,
        createdAt: new Date().toISOString(),
      };
      addMessage(systemMsg);
      setErrorMessage(errorText);
    } finally {
      setThinking(false);
    }
  };

  const handleRestartSession = async () => {
    setThinking(true);
    setErrorMessage(null);
    setInitError(null);
    try {
      const newSession = await AiApi.createSession();
      setSession(newSession);
    } catch (err: any) {
      setInitError(err?.message || 'Failed to initialize session');
    } finally {
      setThinking(false);
    }
  };

  // Fetch agents for welcome state agent selector (only need id + name)
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchAgentsForSelector() {
      setAgentsLoading(true);
      try {
        const data = await AiApi.getAgents();
        if (mounted) {
          setAgents(data.map((a) => ({ id: a.id, name: a.name })));
        }
      } catch {
        // Silently fail - agent selector will just show general copilot option
      } finally {
        if (mounted) setAgentsLoading(false);
      }
    }
    fetchAgentsForSelector();
    return () => { mounted = false; };
  }, []);

  // Count pending proposals in chat that need resolution
  const pendingCount = messages.filter(
    (m) => m.pendingAction && (!m.resolution || m.resolution.status === 'confirming'),
  ).length;

  // Get agent name for display
  const currentAgentName = currentAgentId
    ? agents.find((a) => a.id === currentAgentId)?.name || 'Unknown Agent'
    : null;

  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'hub':
        return (
          <div className="flex flex-col h-full overflow-auto">
            <div className="p-4 sm:p-6">
              <div className="max-w-7xl mx-auto">
                <AiHubDashboard
                  onOpenChatWithAgent={(agentId) => {
                    setCurrentAgent(agentId);
                    setActiveTab('chat');
                  }}
                />
              </div>
            </div>
          </div>
        );
      case 'chat':
        return (
          <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            {/* Chat Header - only show when messages exist */}
            {messages.length > 0 && (
              <div className="shrink-0 px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600 shadow-xs border border-rose-200">
                    <SparklesIcon size={16} />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Chat Copilot</h2>
                    <p className="text-[10px] text-slate-500">
                      {currentAgentName
                        ? `Active agent: ${currentAgentName}`
                        : 'General admin copilot — all tools available'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                  <button
                    type="button"
                    onClick={handleRestartSession}
                    disabled={isThinking}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                    title="New conversation"
                  >
                    <MessageSquarePlusIcon size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Conversation Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {messages.length === 0 ? (
                <WelcomeState
                  onSelectExample={handleSend}
                  currentAgentId={currentAgentId}
                  onAgentChange={setCurrentAgent}
                  agents={agents}
                  isThinking={isThinking}
                />
              ) : (
                <MessageList
                  messages={messages}
                  isThinking={isThinking}
                  activeTool={activeTool}
                  onSelectPrompt={handleSend}
                />
              )}
            </div>

            {/* Composer - always visible at bottom */}
            <div className="shrink-0 bg-white border-t border-slate-200">
              <ChatInput onSend={handleSend} disabled={isThinking} />
            </div>
          </div>
        );
      case 'pending':
        return (
          <div className="flex flex-col h-full overflow-auto">
            <div className="p-4 sm:p-6">
              <div className="max-w-3xl mx-auto">
                <PendingActionsPanel />
              </div>
            </div>
          </div>
        );
      case 'audit':
        return (
          <div className="flex flex-col h-full overflow-auto">
            <div className="p-4 sm:p-6">
              <div className="max-w-5xl mx-auto">
                <AiAuditLogsPanel />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-full max-w-[1440px] mx-auto bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Sidebar: Session History & Info */}
      <ConversationHistory />

      {/* Main Copilot Workspace */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 bg-white flex justify-between items-center px-4 sm:px-6 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600 shadow-xs border border-rose-200">
              <SparklesIcon size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 truncate">
                  Studio Copilot
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircleIcon size={10} /> Live Gateway
                </span>
              </div>
              {/* Current agent indicator in chat mode */}
              {activeTab === 'chat' && currentAgentName && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 border border-rose-200">
                  <MessageSquareIcon size={10} />
                  <span>{currentAgentName}</span>
                </span>
              )}
              <p className="text-[10px] text-slate-500 truncate">
                Real-time operational AI with human-in-the-loop action controls
              </p>
            </div>
          </div>

          {/* Tab controls */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('chat')}
              className={`px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'chat'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquareIcon size={14} />
              <span>Chat Copilot</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hub')}
              className={`px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'hub'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <LayoutGridIcon size={14} />
              <span>AI Agents Hub (12)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <ShieldAlertIcon size={14} />
              <span>Approvals</span>
              {pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-amber-500 text-white">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-3 sm:px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileTextIcon size={14} />
              <span>Audit Trail</span>
            </button>
          </div>
        </header>

        {/* Global Error Banner */}
        {(initError || errorMessage) && (
          <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-800 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircleIcon size={16} className="text-rose-600 shrink-0" />
              <span className="truncate">{initError || errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={handleRestartSession}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 underline"
            >
              <RefreshCwIcon size={12} /> Reconnect
            </button>
          </div>
        )}

        {/* Disclaimer Banner */}
        {disclaimer && !initError && (
          <div className="bg-amber-50/60 border-b border-amber-200/60 px-4 py-1.5 text-[10px] text-amber-900/90 flex items-center justify-between shrink-0">
            <span className="truncate">
              <strong>Notice:</strong> {disclaimer}
            </span>
            <span className="shrink-0 text-amber-700 font-mono text-[9px]">
              ai:query
            </span>
          </div>
        )}

        {/* Workspace Body */}
        <div className="flex-1 overflow-auto relative bg-slate-50">
          <div className="p-4 sm:p-6">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AiCopilotWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <AiCopilotPage />
    </QueryClientProvider>
  );
}