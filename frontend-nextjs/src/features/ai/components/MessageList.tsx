'use client';

import React, { useRef, useEffect, useState } from 'react';
import {
  ActionExecutionResponse,
  AssistantPendingActionPreview,
  ChatMessage,
  RejectActionResponse,
} from '../types';
import {
  BotIcon,
  UserIcon,
  WrenchIcon,
  AlertCircleIcon,
  Loader2Icon,
  CheckCircle2Icon,
  XCircleIcon,
  ClockIcon,
  ShieldAlertIcon,
  HelpCircleIcon,
  SparklesIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AiApi, AiApiError } from '../api/ai-api';
import { useAiStore } from '../stores/aiStore';
import { useQueryClient } from '@tanstack/react-query';

interface MessageListProps {
  messages: ChatMessage[];
  isThinking: boolean;
  activeTool: string | null;
  onSelectPrompt?: (prompt: string) => void;
}

export function MessageList({
  messages,
  isThinking,
  activeTool,
  onSelectPrompt,
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, activeTool]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      {messages.length === 0 && !isThinking ? (
        <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center p-6 space-y-4">
          <div className="h-14 w-14 bg-gradient-to-br from-rose-50 to-rose-100 rounded-2xl flex items-center justify-center text-rose-600 shadow-sm border border-rose-200">
            <SparklesIcon size={28} />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-serif font-bold text-slate-900">
              Studio Copilot
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Connected directly to the real studio AI gateway. Ask about live
              schedules, class occupancy, member renewals, lead pipeline, or
              request operational actions.
            </p>
          </div>
          {onSelectPrompt && (
            <div className="pt-4 w-full max-w-lg mx-auto">
              <p className="text-[11px] font-semibold text-slate-600 mb-3 text-left">Quick start</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  'How many active members do we have?',
                  'Which classes have low occupancy this week?',
                  'Show leads needing immediate follow-up',
                  'What is our projected revenue this month?',
                  'Summarize today\'s bookings and attendance.',
                  'Find members with expiring memberships.',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => onSelectPrompt(suggestion)}
                    disabled={isThinking}
                    className="text-left text-xs bg-white border border-slate-200 hover:border-rose-300 hover:text-rose-700 hover:bg-rose-50 text-slate-600 px-3 py-2.5 rounded-xl shadow-xs transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {messages.map((msg, idx) => (
        <div
          key={msg.id || idx}
          className={`flex gap-3.5 sm:gap-4 ${
            msg.role === 'user' ? 'flex-row-reverse' : ''
          }`}
        >
          {/* Avatar */}
          <div
            className={`shrink-0 h-8 w-8 rounded-xl flex items-center justify-center text-xs font-semibold shadow-xs ${
              msg.role === 'user'
                ? 'bg-slate-900 text-white'
                : msg.role === 'system'
                  ? 'bg-amber-100 text-amber-700 border border-amber-200'
                  : 'bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 border border-rose-200'
            }`}
          >
            {msg.role === 'user' ? (
              <UserIcon size={16} />
            ) : msg.role === 'system' ? (
              <AlertCircleIcon size={16} />
            ) : (
              <BotIcon size={16} />
            )}
          </div>

          {/* Message bubble */}
          <div
            className={`max-w-[85%] sm:max-w-[80%] rounded-2xl p-4 transition-all ${
              msg.role === 'user'
                ? 'bg-slate-900 text-white shadow-subtle'
                : msg.role === 'system'
                  ? 'bg-amber-50 text-amber-950 border border-amber-200 shadow-subtle'
                  : 'bg-white border border-slate-200 text-slate-900 shadow-subtle'
            }`}
          >
            {/* Assistant Response Type Header Badge */}
            {msg.role === 'assistant' && msg.type && (
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    msg.type === 'confirmation'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200'
                      : msg.type === 'question'
                        ? 'bg-sky-100 text-sky-800 border border-sky-200'
                        : msg.type === 'out_of_scope'
                          ? 'bg-purple-100 text-purple-800 border border-purple-200'
                          : msg.type === 'action_result'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {msg.type === 'confirmation' && <ShieldAlertIcon size={12} />}
                  {msg.type === 'question' && <HelpCircleIcon size={12} />}
                  {msg.type === 'action_result' && (
                    <CheckCircle2Icon size={12} />
                  )}
                  {msg.type.replace('_', ' ')}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {new Date(msg.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}

            {/* Markdown Text Body */}
            <div
              className={`text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white prose-invert'
                  : 'text-slate-800 prose prose-slate max-w-none'
              }`}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>

            {/* Tools Executed Chips */}
            {msg.toolsUsed && msg.toolsUsed.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1.5">
                  Tools invoked
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {msg.toolsUsed.map((tool, tIdx) => {
                    const isSuccess = tool.status === 'success';
                    return (
                      <span
                        key={tIdx}
                        className={`inline-flex items-center gap-1.5 ${
                          isSuccess
                            ? 'bg-slate-100 border-slate-200/80 text-slate-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        } border px-2 py-0.5 rounded-md text-[11px] font-mono`}
                      >
                        <WrenchIcon size={11} className={isSuccess ? 'text-slate-500' : 'text-rose-500'} />
                        {tool.name}
                        <span className={`text-[9px] font-bold uppercase ${isSuccess ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {isSuccess ? '✓ success' : `✗ ${tool.status}`}
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inline Pending Action Proposal Card */}
            {msg.pendingAction && (
              <InlinePendingActionCard
                pendingAction={msg.pendingAction}
                messageResolution={msg.resolution}
              />
            )}
          </div>
        </div>
      ))}

      {/* Thinking / Running Tool State */}
      {isThinking && (
        <div className="flex gap-3.5 sm:gap-4 items-start">
          <div className="shrink-0 h-8 w-8 rounded-xl bg-gradient-to-br from-rose-50 to-rose-100 text-rose-700 border border-rose-200 flex items-center justify-center shadow-xs">
            <BotIcon size={16} />
          </div>
          <div className="bg-white border border-slate-200 shadow-subtle rounded-2xl p-4 flex items-center gap-3">
            <Loader2Icon size={16} className="animate-spin text-rose-600" />
            <div className="text-xs">
              <span className="font-semibold text-slate-800">
                {activeTool ? `Invoking ${activeTool}...` : 'AI is analyzing...'}
              </span>
              <p className="text-[10px] text-slate-400">
                Querying studio gateway services
              </p>
            </div>
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

/**
 * Inline Interactive Pending Action Card
 * Allows the staff member to confirm or reject an action proposal directly in the conversation.
 * Strictly calls the real backend endpoints.
 */
function InlinePendingActionCard({
  pendingAction,
  messageResolution,
}: {
  pendingAction: AssistantPendingActionPreview;
  messageResolution?: ChatMessage['resolution'];
}) {
  const { updateMessageResolution } = useAiStore();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const resolution = messageResolution;

  const handleConfirm = async () => {
    if (isSubmitting || resolution?.status === 'confirmed') return;
    setIsSubmitting(true);
    updateMessageResolution(pendingAction.id, {
      pendingId: pendingAction.id,
      status: 'confirming',
    });

    try {
      const token = pendingAction.confirm_token || (pendingAction as any).confirmToken;
      const result: ActionExecutionResponse = await AiApi.confirmAction(
        pendingAction.id,
        token,
      );

      if (result.status === 'succeeded') {
        updateMessageResolution(pendingAction.id, {
          pendingId: pendingAction.id,
          status: 'confirmed',
          outcome: result,
        });
      } else {
        const isUncertain =
          result.status === 'uncertain' ||
          result.error?.code === 'OUTCOME_UNCERTAIN' ||
          result.error?.code === 'EXECUTION_UNCERTAIN' ||
          result.error?.message?.includes('OUTCOME_UNCERTAIN') ||
          result.error?.message?.includes('EXECUTION_UNCERTAIN');

        if (isUncertain) {
          updateMessageResolution(pendingAction.id, {
            pendingId: pendingAction.id,
            status: 'uncertain',
            outcome: result,
            errorMessage:
              result.error?.message ||
              'Execution outcome is uncertain. The operation was submitted to ERPNext, but its status could not be verified. Do not retry without checking studio records.',
          });
        } else {
          updateMessageResolution(pendingAction.id, {
            pendingId: pendingAction.id,
            status: 'failed',
            outcome: result,
            errorMessage:
              result.error?.message ||
              `Execution failed with code ${result.error?.code || 'UNKNOWN'}`,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    } catch (err: any) {
      const code = err instanceof AiApiError ? err.code : (err?.code || 'REQUEST_FAILED');
      const message =
        err?.message || 'Failed to communicate with gateway for action confirmation';
      const isUncertain =
        code === 'OUTCOME_UNCERTAIN' ||
        code === 'EXECUTION_UNCERTAIN' ||
        code === 'TIMEOUT_RECOVERED' ||
        message.includes('OUTCOME_UNCERTAIN') ||
        message.includes('EXECUTION_UNCERTAIN') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('gateway timeout') ||
        (err instanceof AiApiError && err.status === 504);

      if (isUncertain) {
        updateMessageResolution(pendingAction.id, {
          pendingId: pendingAction.id,
          status: 'uncertain',
          errorMessage: `[${code}] ${message}. Operation outcome unresolved. Retry disabled to prevent duplicate booking.`,
        });
      } else {
        updateMessageResolution(pendingAction.id, {
          pendingId: pendingAction.id,
          status: 'failed',
          errorMessage: `[${code}] ${message}`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (isSubmitting || resolution?.status === 'rejected') return;
    setIsSubmitting(true);
    updateMessageResolution(pendingAction.id, {
      pendingId: pendingAction.id,
      status: 'rejecting',
    });

    try {
      const result: RejectActionResponse = await AiApi.rejectAction(
        pendingAction.id,
        rejectReason.trim() || undefined,
      );

      updateMessageResolution(pendingAction.id, {
        pendingId: pendingAction.id,
        status: 'rejected',
        outcome: result,
      });
      setShowRejectInput(false);
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    } catch (err: any) {
      const code = err instanceof AiApiError ? err.code : 'REQUEST_FAILED';
      const message =
        err?.message || 'Failed to communicate with gateway for action rejection';

      updateMessageResolution(pendingAction.id, {
        pendingId: pendingAction.id,
        status: 'failed',
        errorMessage: `[${code}] ${message}`,
      });
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    } finally {
      setIsSubmitting(false);
    }
  };

  const serverIsUncertain =
    pendingAction.status === 'uncertain' ||
    pendingAction.status === 'executing' ||
    Boolean(pendingAction.error?.includes('OUTCOME_UNCERTAIN')) ||
    Boolean(pendingAction.error?.includes('EXECUTION_UNCERTAIN')) ||
    Boolean((pendingAction.result as any)?.outcome === 'uncertain') ||
    Boolean((pendingAction.result as any)?.unresolved);

  const isDecided =
    resolution?.status === 'confirmed' ||
    resolution?.status === 'rejected' ||
    resolution?.status === 'uncertain' ||
    serverIsUncertain ||
    pendingAction.status === 'executed' ||
    pendingAction.status === 'rejected' ||
    pendingAction.status === 'expired' ||
    pendingAction.status === 'cancelled' ||
    (pendingAction.status === 'failed' && Boolean(pendingAction.error));

  return (
    <div className="mt-3.5 rounded-xl border border-amber-200/90 bg-amber-50/50 p-3.5 text-xs text-slate-800 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[10px] text-amber-900">
          <ShieldAlertIcon size={14} className="text-amber-600" />
          Proposed Action Approval Required
        </span>
        {pendingAction.expires_at && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-full">
            <ClockIcon size={10} />
            Expires:{' '}
            {new Date(pendingAction.expires_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>

      {/* Action tool and summary */}
      <div>
        <p className="font-semibold text-slate-900">
          Tool: <span className="font-mono text-rose-700">{pendingAction.tool}</span>
        </p>
        <p className="text-slate-600 mt-0.5 leading-relaxed">
          {pendingAction.summary}
        </p>
      </div>

      {/* Arguments preview */}
      {pendingAction.arguments_preview && (
        <div className="rounded-lg bg-slate-900 p-2.5 text-slate-200 font-mono text-[11px] overflow-x-auto shadow-inner">
          <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
            Parameters Preview
          </div>
          <pre>{JSON.stringify(pendingAction.arguments_preview, null, 2)}</pre>
        </div>
      )}

      {/* Result Outcome Display */}
      {resolution?.status === 'confirmed' && (
        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2">
          <CheckCircle2Icon size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Action Confirmed & Executed</p>
            {resolution.outcome &&
              'record_id' in resolution.outcome &&
              resolution.outcome.record_id && (
                <p className="text-[11px] text-emerald-700 mt-0.5 font-mono">
                  Record ID: {resolution.outcome.record_id}
                </p>
              )}
            {resolution.outcome &&
              'audit_id' in resolution.outcome &&
              resolution.outcome.audit_id && (
                <p className="text-[10px] text-emerald-600 mt-0.5 font-mono">
                  Audit ID: {resolution.outcome.audit_id}
                </p>
              )}
          </div>
        </div>
      )}

      {resolution?.status === 'rejected' && (
        <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 flex items-start gap-2">
          <XCircleIcon size={16} className="text-slate-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Action Rejected</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              The proposed action was declined and was not executed.
            </p>
          </div>
        </div>
      )}

      {(resolution?.status === 'uncertain' || (!resolution && serverIsUncertain)) && (
        <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2">
          <AlertCircleIcon size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Execution Outcome Uncertain</p>
            <p className="text-[11px] text-amber-800 mt-0.5">
              {resolution?.errorMessage ||
                pendingAction.error ||
                'The operation was dispatched to ERPNext, but its final outcome could not be reliably confirmed. Retry has been disabled to prevent duplicate booking. Please verify studio records manually.'}
            </p>
          </div>
        </div>
      )}

      {resolution?.status === 'failed' && (
        <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
          <AlertCircleIcon size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Action Execution Failed</p>
            <p className="text-[11px] text-rose-700 mt-0.5">
              {resolution.errorMessage || 'An error occurred during execution.'}
            </p>
          </div>
        </div>
      )}

      {/* Action Buttons (Visible only if not yet decided) */}
      {!isDecided && (
        <div className="pt-1 space-y-2">
          {showRejectInput && (
            <div className="space-y-1.5">
              <input
                type="text"
                placeholder="Optional reason for rejection..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-rose-500 text-slate-800"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="flex-1 min-h-9 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-xs"
            >
              {resolution?.status === 'confirming' ? (
                <>
                  <Loader2Icon size={13} className="animate-spin" />
                  Confirming...
                </>
              ) : (
                'Confirm & Execute'
              )}
            </button>

            {showRejectInput ? (
              <button
                type="button"
                onClick={handleReject}
                disabled={isSubmitting}
                className="flex-1 min-h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-medium text-xs transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {resolution?.status === 'rejecting' ? (
                  <>
                    <Loader2Icon size={13} className="animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  'Submit Rejection'
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowRejectInput(true)}
                disabled={isSubmitting}
                className="flex-1 min-h-9 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-medium text-xs transition-colors disabled:opacity-50"
              >
                Reject Action
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}