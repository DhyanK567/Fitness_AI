'use client';

import React, { useState, useEffect } from 'react';
import { useAiStore } from '../stores/aiStore';
import { AiApi, AiApiError } from '../api/ai-api';
import {
  MessageSquarePlusIcon,
  Trash2Icon,
  ShieldCheckIcon,
  ClockIcon,
  WrenchIcon,
  Loader2Icon,
  AlertCircleIcon,
  InfoIcon,
} from 'lucide-react';

interface RecentSessionMeta {
  id: string;
  createdAt: string;
  preview?: string;
}

const RECENT_SESSIONS_KEY = 'ws_ai_recent_sessions';

function getStoredRecentSessions(): RecentSessionMeta[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENT_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function storeRecentSession(session: RecentSessionMeta) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredRecentSessions().filter((s) => s.id !== session.id);
    const updated = [session, ...existing].slice(0, 15);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

function removeStoredRecentSession(id: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredRecentSessions().filter((s) => s.id !== id);
    localStorage.setItem(RECENT_SESSIONS_KEY, JSON.stringify(existing));
  } catch {
    // Ignore
  }
}

export function ConversationHistory() {
  const {
    sessionId,
    sessionExpiry,
    availableTools,
    disclaimer,
    messages,
    setSession,
    setMessages,
    resetSession,
    setThinking,
    setErrorMessage,
  } = useAiStore();

  const [recentSessions, setRecentSessions] = useState<RecentSessionMeta[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [showToolsList, setShowToolsList] = useState(false);

  useEffect(() => {
    setRecentSessions(getStoredRecentSessions());
  }, [sessionId]);

  // Record current session into recent list when messages arrive
  useEffect(() => {
    if (sessionId) {
      const firstUserMsg = messages.find((m) => m.role === 'user');
      const meta: RecentSessionMeta = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        preview: firstUserMsg?.content.slice(0, 40) || 'Assistant Session',
      };
      storeRecentSession(meta);
      setRecentSessions(getStoredRecentSessions());
    }
  }, [sessionId, messages.length]);

  const handleNewSession = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setThinking(true);
    setErrorMessage(null);

    try {
      const newSession = await AiApi.createSession();
      setSession(newSession);
      setMessages([]);
      storeRecentSession({
        id: newSession.session_id,
        createdAt: new Date().toISOString(),
        preview: 'New session',
      });
      setRecentSessions(getStoredRecentSessions());
    } catch (err: any) {
      const msg = err?.message || 'Failed to initialize AI assistant session';
      setErrorMessage(msg);
    } finally {
      setIsCreating(false);
      setThinking(false);
    }
  };

  const handleSelectSession = async (id: string) => {
    if (id === sessionId || isSwitching) return;
    setIsSwitching(true);
    setThinking(true);
    setErrorMessage(null);

    try {
      const details = await AiApi.getSession(id);
      setSession({
        session_id: details.session_id,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        tools: availableTools,
        disclaimer: disclaimer || 'AI responses advisory',
      });

      const loadedMessages = (details.turns || []).map((t, idx) => ({
        id: `${details.session_id}_turn_${t.turn_no || idx}`,
        role: t.role as 'user' | 'assistant' | 'system',
        content: t.content,
        createdAt: t.created_at || new Date().toISOString(),
      }));

      setMessages(loadedMessages);
    } catch (err: any) {
      if (err instanceof AiApiError && err.status === 404) {
        removeStoredRecentSession(id);
        setRecentSessions(getStoredRecentSessions());
        setErrorMessage('Session was expired or not found. Starting a new session.');
        await handleNewSession();
      } else {
        setErrorMessage(err?.message || 'Failed to switch session');
      }
    } finally {
      setIsSwitching(false);
      setThinking(false);
    }
  };

  const handleDeleteCurrentSession = async () => {
    if (!sessionId) return;
    const confirmPurge = window.confirm(
      'Are you sure you want to purge this session? All history will be deleted.',
    );
    if (!confirmPurge) return;

    try {
      await AiApi.deleteSession(sessionId);
      removeStoredRecentSession(sessionId);
      resetSession();
      setRecentSessions(getStoredRecentSessions());
    } catch (err: any) {
      console.warn('Failed to delete session on server:', err);
      // Still reset locally
      removeStoredRecentSession(sessionId);
      resetSession();
      setRecentSessions(getStoredRecentSessions());
    }
  };

  return (
    <aside
      aria-label="AI Session and History"
      className="w-72 sm:w-80 border-r border-slate-200 bg-slate-50/70 flex flex-col h-full shrink-0 shadow-xs"
    >
      {/* New Session Action */}
      <div className="p-4 border-b border-slate-200 bg-white">
        <button
          type="button"
          onClick={handleNewSession}
          disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2.5 text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors"
        >
          {isCreating ? (
            <Loader2Icon size={15} className="animate-spin" />
          ) : (
            <MessageSquarePlusIcon size={15} />
          )}
          New Assistant Session
        </button>
      </div>

      {/* Active Session Info Card */}
      <div className="p-4 border-b border-slate-200/80 bg-white/60 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Active Session
          </span>
          {sessionId && (
            <button
              type="button"
              onClick={handleDeleteCurrentSession}
              title="Purge active session"
              className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors"
            >
              <Trash2Icon size={13} />
            </button>
          )}
        </div>

        {sessionId ? (
          <div className="space-y-1.5 font-mono text-[11px] text-slate-600 bg-slate-100/80 p-2.5 rounded-lg border border-slate-200/70">
            <div className="flex items-center justify-between text-slate-700 font-sans">
              <span className="font-semibold text-[10px] uppercase text-emerald-700 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Connected
              </span>
              <span className="text-[10px] text-slate-400">
                {messages.length} {messages.length === 1 ? 'turn' : 'turns'}
              </span>
            </div>
            <div className="truncate text-[10px] text-slate-500">
              ID: {sessionId}
            </div>
            {sessionExpiry && (
              <div className="text-[10px] text-slate-500 flex items-center gap-1">
                <ClockIcon size={10} />
                Expires:{' '}
                {new Date(sessionExpiry).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            )}
            <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between">
              <span className="text-[10px] text-slate-600 flex items-center gap-1">
                <WrenchIcon size={10} className="text-rose-600" />
                {availableTools.length} tools available
              </span>
              <button
                type="button"
                onClick={() => setShowToolsList(!showToolsList)}
                className="text-[10px] text-rose-600 hover:underline font-sans"
              >
                {showToolsList ? 'Hide' : 'View'}
              </button>
            </div>
            {showToolsList && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-200 max-h-32 overflow-y-auto space-y-0.5 text-[10px] text-slate-600 font-sans">
                {availableTools.map((t) => (
                  <div key={t} className="flex items-center gap-1 truncate">
                    <span className="text-emerald-600 font-bold">•</span> {t}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-[11px] text-slate-400 italic py-1">
            No active session. Click New Assistant Session to begin.
          </div>
        )}
      </div>

      {/* Recent Sessions List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <h3 className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Recent Sessions
        </h3>

        {recentSessions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-400">
            No recent sessions saved.
          </p>
        ) : (
          recentSessions.map((s) => {
            const isActive = s.id === sessionId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSession(s.id)}
                disabled={isSwitching}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors flex flex-col gap-1 border ${
                  isActive
                    ? 'bg-rose-50 text-rose-900 border-rose-200 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100/90 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate max-w-[170px] text-xs">
                    {s.preview || 'Assistant Session'}
                  </span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 font-mono truncate">
                  {s.id.slice(0, 16)}...
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Advisory disclaimer footer */}
      {disclaimer && (
        <div className="p-3 border-t border-slate-200 bg-slate-50 text-[10px] text-slate-500 flex items-start gap-1.5 leading-snug">
          <InfoIcon size={12} className="text-slate-400 shrink-0 mt-0.5" />
          <span>{disclaimer}</span>
        </div>
      )}
    </aside>
  );
}