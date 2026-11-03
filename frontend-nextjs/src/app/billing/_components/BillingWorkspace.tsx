'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ApiClient, type BillingOverview } from '@/lib/api-client';
import { formatInr, formatIstDateTime } from '@/lib/localization/india';
import { EmployeeWorkspaceFrame, EmptyWorkspaceState, WorkspaceError, WorkspaceLoading } from '@/components/workspaces/EmployeeWorkspaceFrame';

const nav = [
  { href: '/billing/dashboard', label: 'Finance desk', description: 'Collection, pending, and refund position.' },
  { href: '/billing/ledger', label: 'Payment ledger', description: 'Tenant-scoped invoice and payment history.' },
  { href: '/billing/receipts', label: 'GST receipts', description: 'Inspect compliant 18% GST breakdowns.' },
];
type Receipt = { paymentId: string; reference: string; currency: string; gstRate: number; taxableValue: number; gst: number; total: number; generatedAt: string };

export function BillingWorkspace() {
  const pathname = usePathname();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { setError(''); try { setData(await ApiClient.getBillingOverview()); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load billing.'); } }, []);
  useEffect(() => { void load(); }, [load]);
  const members = useMemo(() => new Map(data?.members.map((row) => [row.id, row]) ?? []), [data]);
  const payments = useMemo(() => { const term = query.trim().toLowerCase(); return (data?.payments ?? []).filter((row) => !term || [row.ref, row.type, row.method, row.status, members.get(row.memberId)?.fullName].some((value) => value?.toLowerCase().includes(term))); }, [data, members, query]);
  async function showReceipt(id: string) { setBusy(id); setError(''); try { setReceipt(await ApiClient.getWorkspaceGstReceipt(id) as Receipt); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to generate receipt.'); } finally { setBusy(null); } }
  if (!data && !error) return <WorkspaceLoading label="billing" />;
  if (!data) return <WorkspaceError message={error} retry={() => void load()} />;
  const section = pathname.split('/')[2] ?? 'dashboard';
  return <EmployeeWorkspaceFrame accent="emerald" eyebrow="Billing & accounts · Restricted" employeeName={data.user.displayName} studioName={data.studio.name} tierName={data.studio.tierName} nav={nav}>
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-emerald-950 via-slate-950 to-slate-900 p-6 text-white shadow-xl sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Ultra finance controls</p><h1 className="mt-3 text-3xl font-black">A precise view of every rupee.</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Payment operations are isolated from reception and trainer workspaces and enforced by server-side tier and role policies.</p><div className="mt-6 grid gap-3 sm:grid-cols-3">{[['Collected', data.totals.collected], ['Pending', data.totals.pending], ['Refunded', data.totals.refunded]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-xs text-slate-300">{label}</p><p className="mt-1 text-2xl font-black">{formatInr(Number(value))}</p></div>)}</div></section>
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}
      {receipt && <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-800">GST receipt preview</p><h2 className="mt-1 text-xl font-black">{receipt.reference}</h2></div><button onClick={() => setReceipt(null)} className="text-sm font-bold text-slate-600">Close</button></div><div className="mt-5 grid gap-3 sm:grid-cols-3">{[['Taxable value', receipt.taxableValue], [`GST (${receipt.gstRate}%)`, receipt.gst], ['Total', receipt.total]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-black">{formatInr(Number(value))}</p></div>)}</div><p className="mt-4 text-xs text-emerald-900">Generated {formatIstDateTime(receipt.generatedAt)}</p></section>}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">{section === 'receipts' ? 'GST documents' : 'Live ledger'}</p><h2 className="mt-1 text-xl font-black">{section === 'receipts' ? 'Receipt generator' : 'Payments and invoices'}</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, member, method, status" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 sm:max-w-sm" /></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500"><th className="py-3">Reference</th><th>Member</th><th>Date</th><th>Status</th><th className="text-right">Amount</th><th className="text-right">Action</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-slate-100"><td className="py-4 font-bold">{payment.ref}<p className="text-xs font-normal text-slate-500">{payment.method} · {payment.type}</p></td><td>{members.get(payment.memberId)?.fullName ?? 'Member unavailable'}</td><td>{formatIstDateTime(payment.date)}</td><td><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold">{payment.status}</span></td><td className="text-right font-black">{formatInr(payment.amount)}</td><td className="text-right"><button onClick={() => void showReceipt(payment.id)} disabled={busy === payment.id} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300">{busy === payment.id ? 'Generating…' : 'GST receipt'}</button></td></tr>)}</tbody></table></div>{!payments.length && <EmptyWorkspaceState title="No payment records" detail="Payments recorded for this studio will appear in the finance ledger." />}</section>
    </div>
  </EmployeeWorkspaceFrame>;
}
