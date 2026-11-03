'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AiApi, AiApiError } from '../api/ai-api';
import { AiAuditLogItem, AiAuditQueryParams } from '../types';
import {
  ShieldAlertIcon,
  ShieldCheckIcon,
  FilterIcon,
  CalendarIcon,
  SearchIcon,
  RefreshCwIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  XCircleIcon,
  DownloadIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  UserIcon,
  WrenchIcon,
  LockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RotateCcwIcon,
} from 'lucide-react';

const COMMON_AI_TOOLS = [
  { value: '', label: 'All Tools & Actions' },
  { value: 'createMember', label: 'createMember' },
  { value: 'getExpiringMemberships', label: 'getExpiringMemberships' },
  { value: 'getLowAttendanceClasses', label: 'getLowAttendanceClasses' },
  { value: 'getMemberCount', label: 'getMemberCount' },
  { value: 'getDashboardSummary', label: 'getDashboardSummary' },
  { value: 'getRevenueSummary', label: 'getRevenueSummary' },
  { value: 'getRevenueTrends', label: 'getRevenueTrends' },
  { value: 'captureLead', label: 'captureLead' },
  { value: 'classifyFeedback', label: 'classifyFeedback' },
  { value: 'scoreLead', label: 'scoreLead' },
  { value: 'calculateChurnRisk', label: 'calculateChurnRisk' },
  { value: 'getClassCapacityUtilization', label: 'getClassCapacityUtilization' },
];

function getUserSessionRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const rawStaff = localStorage.getItem('ws_staff_user');
    if (rawStaff) {
      const parsed = JSON.parse(rawStaff);
      if (parsed.role) return parsed.role;
    }
    const rawDemo = localStorage.getItem('fitness-studio-demo-session');
    if (rawDemo) {
      const parsed = JSON.parse(rawDemo);
      if (parsed.role) return parsed.role;
    }
  } catch {
    // Ignore storage parse issues
  }
  return null;
}

export function AiAuditLogsPanel() {
  const [selectedTool, setSelectedTool] = useState<string>('');
  const [actorFilter, setActorFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const role = useMemo(() => getUserSessionRole(), []);
  const isUnauthorizedRole = role !== null && role !== 'owner' && role !== 'admin';

  // Construct validated query params
  const queryParams: AiAuditQueryParams = useMemo(() => {
    const p: AiAuditQueryParams = {
      page,
      limit,
    };
    if (selectedTool) p.tool = selectedTool;
    if (actorFilter.trim()) p.user_id = actorFilter.trim();
    if (fromDate) p.from = new Date(fromDate).toISOString();
    if (toDate) {
      // Set to end of day if only YYYY-MM-DD
      const end = new Date(toDate);
      if (!toDate.includes('T')) {
        end.setHours(23, 59, 59, 999);
      }
      p.to = end.toISOString();
    }
    return p;
  }, [selectedTool, actorFilter, fromDate, toDate, page, limit]);

  const { data, isLoading, isFetching, error, refetch } = useQuery<AiAuditLogItem[], Error>({
    queryKey: ['aiAuditLogs', queryParams],
    queryFn: () => AiApi.getAuditLogs(queryParams),
    enabled: !isUnauthorizedRole,
    staleTime: 10000,
    retry: 1,
  });

  const logs = data || [];

  const handleResetFilters = () => {
    setSelectedTool('');
    setActorFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleExportJson = () => {
    if (!logs.length) return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-audit-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!logs.length) return;
    const headers = ['id', 'at', 'actor', 'tool', 'decision', 'approval', 'result', 'arguments_redacted'];
    const rows = logs.map((log) => [
      `"${log.id}"`,
      `"${log.at}"`,
      `"${log.actor}"`,
      `"${log.tool}"`,
      `"${log.decision || ''}"`,
      `"${log.approval?.approved_by || ''}"`,
      `"${typeof log.result === 'object' ? JSON.stringify(log.result).replace(/"/g, '""') : log.result}"`,
      `"${JSON.stringify(log.arguments_redacted).replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check for 403 Forbidden or unauthorized client role
  const isForbidden =
    isUnauthorizedRole ||
    (error instanceof AiApiError && (error.status === 403 || error.code === 'PERMISSION_DENIED'));

  if (isForbidden) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-8 text-center max-w-xl mx-auto my-12 shadow-xs">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 mb-4 border border-amber-200">
          <LockIcon size={22} />
        </div>
        <h2 className="text-base font-bold text-amber-950 mb-1">
          Audit Trail Restricted
        </h2>
        <p className="text-xs text-amber-800 mb-4 leading-relaxed">
          AI audit log retrieval requires the <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold">audit:read</code> permission.
          This view is restricted to Studio Owners and Administrators to preserve member confidentiality and operational privacy.
        </p>
        <span className="inline-block text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-3 py-1 rounded-full border border-amber-200">
          Role: {role || 'unprivileged staff'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600 border border-indigo-200 shadow-xs">
              <ShieldCheckIcon size={20} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  AI Audit Trail & Governance Ledger
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Tenant-Scoped
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Immutable record of model-initiated tool executions, confirmations, rejections, and security checks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50"
              title="Refresh ledger"
            >
              <RefreshCwIcon size={13} className={isFetching ? 'animate-spin text-indigo-600' : ''} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!logs.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-40"
              title="Export as CSV"
            >
              <DownloadIcon size={13} />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              disabled={!logs.length}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-40"
              title="Export as JSON"
            >
              <DownloadIcon size={13} />
              <span>JSON</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4">
          {/* Tool selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Tool / Action
            </label>
            <div className="relative">
              <select
                value={selectedTool}
                onChange={(e) => {
                  setSelectedTool(e.target.value);
                  setPage(1);
                }}
                className="w-full h-8 pl-2.5 pr-8 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
              >
                {COMMON_AI_TOOLS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Actor / User filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Actor / User ID
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. usr_123 or staff"
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Date range from */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              From Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
              />
            </div>
          </div>

          {/* Date range to */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              To Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="w-full h-8 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 font-medium"
              />
              {(selectedTool || actorFilter || fromDate || toDate) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 h-8 border border-slate-200 bg-white text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors shrink-0 flex items-center justify-center"
                  title="Reset filters"
                >
                  <RotateCcwIcon size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircleIcon size={16} className="text-rose-600 shrink-0" />
            <div className="min-w-0">
              <strong className="block font-bold">Failed to retrieve audit trail</strong>
              <p className="text-rose-700 truncate">{error.message || 'Unable to communicate with gateway audit service.'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <RefreshCwIcon size={24} className="animate-spin text-indigo-600 mx-auto mb-2" />
          <p className="text-xs text-slate-600 font-medium">Loading verified audit trail from gateway...</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && logs.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3 border border-slate-200">
            <FilterIcon size={20} className="text-slate-500" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            No audit records found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
            No AI tool calls, approvals, or execution events match the current filter criteria for this studio tenant.
          </p>
          {(selectedTool || actorFilter || fromDate || toDate) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
            >
              <RotateCcwIcon size={12} />
              <span>Clear all filters</span>
            </button>
          )}
        </div>
      )}

      {/* Audit Log Entries List */}
      {!isLoading && !error && logs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Tool / Action</th>
                  <th className="py-3 px-4">Decision</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Arguments & Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const dateStr = new Date(log.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <React.Fragment key={log.id}>
                      <tr className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                          <span title={log.at}>{dateStr}</span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                          <span className="inline-flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-mono text-slate-700 border border-slate-200/60">
                            <UserIcon size={10} className="text-slate-400" />
                            {log.actor.length > 16 ? `${log.actor.slice(0, 14)}…` : log.actor}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-semibold">
                          <span className="inline-flex items-center gap-1 text-slate-900 font-mono text-[11px]">
                            <WrenchIcon size={11} className="text-indigo-500" />
                            {log.tool}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {log.decision === 'approved' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2Icon size={11} /> Approved
                            </span>
                          ) : log.decision === 'rejected' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircleIcon size={11} /> Rejected
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {log.result === 'succeeded' || (typeof log.result === 'object' && log.result !== null && !('error' in log.result)) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Succeeded
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors border border-indigo-200/60"
                          >
                            <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                            {isExpanded ? <ChevronUpIcon size={12} /> : <ChevronDownIcon size={12} />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90">
                          <td colSpan={6} className="p-4 border-t border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              {/* Sanitized Arguments */}
                              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                                    <LockIcon size={12} className="text-emerald-600" />
                                    Redacted Arguments (PII-Safe)
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Document 5 §6.2
                                  </span>
                                </div>
                                <pre className="bg-slate-900 text-slate-100 p-2.5 rounded-lg font-mono text-[11px] overflow-x-auto max-h-48 leading-relaxed">
                                  {JSON.stringify(log.arguments_redacted, null, 2)}
                                </pre>
                              </div>

                              {/* Execution Outcome & Metadata */}
                              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                                    <ClockIcon size={12} className="text-indigo-600" />
                                    Execution Outcome & Authorization
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    ID: {log.id.slice(0, 8)}…
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-[11px] text-slate-600">
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400">Exact ISO Time:</span>
                                    <span className="font-mono text-slate-800">{log.at}</span>
                                  </div>
                                  <div className="flex justify-between border-b border-slate-100 pb-1">
                                    <span className="text-slate-400">Actor Identity:</span>
                                    <span className="font-mono text-slate-800">{log.actor}</span>
                                  </div>
                                  {log.approval && (
                                    <div className="flex justify-between border-b border-slate-100 pb-1">
                                      <span className="text-slate-400">Approved By:</span>
                                      <span className="font-mono text-slate-800">{log.approval.approved_by}</span>
                                    </div>
                                  )}
                                  <div className="pt-1">
                                    <span className="text-slate-400 block mb-1">Result Payload:</span>
                                    <pre className="bg-slate-100 text-slate-800 p-2 rounded-lg font-mono text-[10px] overflow-x-auto max-h-32">
                                      {typeof log.result === 'object' && log.result !== null
                                        ? JSON.stringify(log.result, null, 2)
                                        : String(log.result)}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="h-7 px-2 bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 focus:outline-hidden"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400">|</span>
              <span>Showing {logs.length} records</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={page <= 1 || isFetching}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-2xs"
              >
                <ChevronLeftIcon size={14} />
                <span>Previous</span>
              </button>
              <span className="px-2 py-1 font-bold text-slate-800 bg-white border border-slate-200 rounded">
                Page {page}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={logs.length < limit || isFetching}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors shadow-2xs"
              >
                <span>Next</span>
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
