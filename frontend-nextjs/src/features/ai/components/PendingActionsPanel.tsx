'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AiApi, AiApiError } from '../api/ai-api';
import {
  CheckIcon,
  ClockIcon,
  ShieldAlertIcon,
  CheckCircle2Icon,
  XCircleIcon,
  AlertTriangleIcon,
  Loader2Icon,
} from 'lucide-react';
import { ActionExecutionResponse, PendingActionItem } from '../types';

export function PendingActionsPanel() {
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [actionResults, setActionResults] = useState<
    Record<
      string,
      {
        status: 'succeeded' | 'failed' | 'rejected' | 'uncertain';
        recordId?: string;
        error?: string;
      }
    >
  >({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['pendingActions'],
    queryFn: () => AiApi.getPendingActions({ status: 'proposed,executing' }),
    refetchInterval: 10000,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ id, confirmToken }: { id: string; confirmToken?: string }) =>
      AiApi.confirmAction(id, confirmToken),
    onSuccess: (result: ActionExecutionResponse, variables) => {
      if (result.status === 'succeeded') {
        setActionResults((prev) => ({
          ...prev,
          [variables.id]: {
            status: 'succeeded',
            recordId: result.record_id,
          },
        }));
      } else {
        const isUncertain =
          result.status === 'uncertain' ||
          result.error?.code === 'OUTCOME_UNCERTAIN' ||
          result.error?.code === 'EXECUTION_UNCERTAIN' ||
          result.error?.message?.includes('OUTCOME_UNCERTAIN') ||
          result.error?.message?.includes('EXECUTION_UNCERTAIN');

        setActionResults((prev) => ({
          ...prev,
          [variables.id]: {
            status: isUncertain ? 'uncertain' : 'failed',
            error:
              result.error?.message ||
              (isUncertain
                ? 'Execution outcome is uncertain. Do not re-execute.'
                : `Execution failed (${result.error?.code || 'UNKNOWN'})`),
          },
        }));
      }
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    },
    onError: (err: any, variables) => {
      const code = err instanceof AiApiError ? err.code : (err?.code || 'FAILED');
      const msg = err?.message || 'Failed to confirm action';
      const isUncertain =
        code === 'OUTCOME_UNCERTAIN' ||
        code === 'EXECUTION_UNCERTAIN' ||
        code === 'TIMEOUT_RECOVERED' ||
        msg.includes('OUTCOME_UNCERTAIN') ||
        msg.includes('EXECUTION_UNCERTAIN') ||
        msg.toLowerCase().includes('timeout') ||
        msg.toLowerCase().includes('gateway timeout') ||
        (err instanceof AiApiError && err.status === 504);

      setActionResults((prev) => ({
        ...prev,
        [variables.id]: {
          status: isUncertain ? 'uncertain' : 'failed',
          error: `[${code}] ${msg}`,
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      AiApi.rejectAction(id, reason),
    onSuccess: (_, variables) => {
      setActionResults((prev) => ({
        ...prev,
        [variables.id]: {
          status: 'rejected',
        },
      }));
      setRejectingId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['pendingActions'] });
    },
    onError: (err: any, variables) => {
      const code = err instanceof AiApiError ? err.code : 'FAILED';
      const msg = err?.message || 'Failed to reject action';
      setActionResults((prev) => ({
        ...prev,
        [variables.id]: {
          status: 'failed',
          error: `[${code}] ${msg}`,
        },
      }));
    },
  });

  const actions = (Array.isArray(data) ? data : data?.actions) || [];

  if (isLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-center">
        <Loader2Icon size={24} className="animate-spin text-rose-600 mb-2" />
        <p className="text-xs text-slate-500 font-medium">
          Loading pending studio approvals...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 m-4 rounded-xl border border-rose-200 bg-rose-50 text-rose-900 text-xs">
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangleIcon size={16} className="text-rose-600" />
          <span>Failed to load pending actions</span>
        </div>
        <p className="text-rose-700">
          {(error as Error)?.message || 'Unable to connect to gateway.'}
        </p>
        <button
          onClick={() => refetch()}
          className="mt-3 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3 border border-slate-200 shadow-xs">
          <CheckIcon size={24} className="text-emerald-600" />
        </div>
        <p className="text-sm font-semibold text-slate-900">
          All pending actions cleared
        </p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
          No proposals are currently waiting for staff confirmation. When the AI
          proposes schedule changes, cancellations, or discounts, they will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Pending Studio Approvals ({actions.length})
          </h2>
          <p className="text-[11px] text-slate-500">
            Staff authorization required before durable ERP execution.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {actions.map((action: PendingActionItem) => {
          const outcome = actionResults[action.id];
          const isConfirming =
            confirmMutation.isPending &&
            confirmMutation.variables?.id === action.id;
          const isRejecting =
            rejectMutation.isPending &&
            rejectMutation.variables?.id === action.id;
          const isProcessing = isConfirming || isRejecting;

          const serverIsUncertain =
            action.status === ('uncertain' as any) ||
            action.status === 'executing' ||
            Boolean(action.error?.includes('OUTCOME_UNCERTAIN')) ||
            Boolean(action.error?.includes('EXECUTION_UNCERTAIN')) ||
            Boolean((action.result as any)?.outcome === 'uncertain') ||
            Boolean((action.result as any)?.unresolved);

          const isDecided =
            Boolean(outcome) ||
            serverIsUncertain ||
            action.status === 'executed' ||
            action.status === 'rejected' ||
            action.status === 'cancelled' ||
            action.status === 'expired' ||
            (action.status === 'failed' && Boolean(action.error));

          return (
            <div
              key={action.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-subtle transition-all"
            >
              {/* Header */}
              <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg">
                    <ShieldAlertIcon size={14} />
                  </span>
                  <div>
                    <span className="text-xs font-bold text-slate-900 font-mono">
                      {action.actionType}
                    </span>
                    {action.proposedBy && (
                      <p className="text-[10px] text-slate-500">
                        Proposed by: {action.proposedBy}
                      </p>
                    )}
                  </div>
                </div>
                {action.expiresAt && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    <ClockIcon size={10} />
                    Expires: {new Date(action.expiresAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-4 space-y-3">
                {action.summary && (
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {action.summary}
                  </p>
                )}

                <div className="text-[11px] bg-slate-900 text-slate-200 p-3 rounded-lg border border-slate-800 overflow-x-auto font-mono shadow-inner">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                    Action Payload Preview
                  </div>
                  <pre>{JSON.stringify(action.payload, null, 2)}</pre>
                </div>

                {/* Outcome notification if decided */}
                {outcome?.status === 'succeeded' && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 text-xs">
                    <CheckCircle2Icon size={16} className="text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-bold">Executed Successfully.</span>
                      {outcome.recordId && (
                        <span className="ml-1 font-mono text-[11px]">
                          Record ID: {outcome.recordId}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {outcome?.status === 'rejected' && (
                  <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 text-slate-700 flex items-center gap-2 text-xs">
                    <XCircleIcon size={16} className="text-slate-500 shrink-0" />
                    <span className="font-medium">Action was rejected.</span>
                  </div>
                )}

                {(outcome?.status === 'uncertain' || (!outcome && serverIsUncertain)) && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-2 text-xs">
                    <AlertTriangleIcon size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Execution Outcome Uncertain:</span>{' '}
                      {outcome?.error ||
                        action.error ||
                        'The operation was dispatched to ERPNext, but its final outcome could not be reliably confirmed. Retry has been disabled to prevent duplicate booking. Please verify studio records manually.'}
                    </div>
                  </div>
                )}

                {outcome?.status === 'failed' && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2 text-xs">
                    <AlertTriangleIcon size={16} className="text-rose-600 shrink-0" />
                    <div>
                      <span className="font-bold">Failed:</span> {outcome.error}
                    </div>
                  </div>
                )}

                {/* Action buttons (only if not already decided in UI or on server) */}
                {!isDecided && (
                  <div className="pt-2 space-y-2">
                    {rejectingId === action.id && (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          placeholder="Optional rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          disabled={isProcessing}
                          className="w-full h-8 px-2.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-rose-500 text-slate-800"
                        />
                      </div>
                    )}

                    <div className="flex gap-2.5">
                      <button
                        onClick={() =>
                          confirmMutation.mutate({
                            id: action.id,
                            confirmToken: action.confirmToken || action.confirm_token,
                          })
                        }
                        disabled={isProcessing}
                        className="flex-1 min-h-9 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {isConfirming ? (
                          <>
                            <Loader2Icon size={13} className="animate-spin" />
                            Executing...
                          </>
                        ) : (
                          'Confirm & Execute'
                        )}
                      </button>

                      {rejectingId === action.id ? (
                        <button
                          onClick={() =>
                            rejectMutation.mutate({
                              id: action.id,
                              reason: rejectReason.trim() || undefined,
                            })
                          }
                          disabled={isProcessing}
                          className="flex-1 min-h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {isRejecting ? (
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
                          onClick={() => {
                            setRejectingId(action.id);
                            setRejectReason('');
                          }}
                          disabled={isProcessing}
                          className="flex-1 min-h-9 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}