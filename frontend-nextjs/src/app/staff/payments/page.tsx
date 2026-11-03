'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { formatIndianCurrency, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CreditCard,
  Search,
  Plus,
  RefreshCw,
  X,
  CheckCircle2,
  Banknote,
  Smartphone,
  Building,
  Receipt,
  ArrowDownLeft,
} from 'lucide-react';

interface PaymentItem {
  id?: string;
  ref: string;
  date: string;
  memberId: string;
  type: string;
  method: string;
  status: string;
  amount: number;
  currency?: string;
  notes?: string;
}

interface MemberItem {
  id: string;
  fullName: string;
  phone: string;
}

export default function StaffPaymentsPage() {
  const { addToast } = useToast();
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('All');
  const [displayCount, setDisplayCount] = useState(8);

  // New Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalMemberSearch, setModalMemberSearch] = useState('');
  const [formData, setFormData] = useState({
    memberId: '',
    amount: '',
    method: 'Cash' as 'Cash' | 'UPI' | 'Card' | 'Bank Transfer',
    type: 'Membership Fee',
    reference: '',
    notes: '',
  });

  async function loadData() {
    setLoading(true);
    try {
      const [paymentsRes, membersRes] = await Promise.allSettled([
        ApiClient.getPayments(),
        ApiClient.getMembers(),
      ]);

      if (paymentsRes.status === 'fulfilled' && Array.isArray(paymentsRes.value)) {
        setPayments(paymentsRes.value);
      }
      if (membersRes.status === 'fulfilled' && Array.isArray(membersRes.value)) {
        const mappedMembers = (membersRes.value as any[]).map((m) => ({
          id: m.id,
          fullName: m.full_name || m.fullName || 'Member',
          phone: m.phone || '',
        }));
        setMembers(mappedMembers);
        if (mappedMembers.length > 0 && !formData.memberId) {
          setFormData((prev) => ({ ...prev, memberId: mappedMembers[0].id }));
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    const amountVal = parseFloat(formData.amount);
    if (!formData.memberId || isNaN(amountVal) || amountVal <= 0) {
      addToast({ type: 'error', title: 'Invalid Payment', message: 'Select member and enter a valid positive amount.' });
      return;
    }

    setSubmitting(true);
    try {
      const referenceCode = formData.reference.trim() || `MAN-${Date.now().toString().slice(-6)}`;
      await ApiClient.recordLedgerPayment({
        member_id: formData.memberId,
        type: formData.type,
        amount: amountVal,
        method: formData.method,
        status: 'Paid',
        notes: `Ref: ${referenceCode}. ${formData.notes}`.trim(),
      });

      addToast({
        type: 'success',
        title: 'Payment Recorded',
        message: `₹${amountVal.toLocaleString('en-IN')} via ${formData.method} registered in ledger.`,
      });

      setIsModalOpen(false);
      setFormData({
        memberId: members[0]?.id || '',
        amount: '',
        method: 'Cash',
        type: 'Membership Fee',
        reference: '',
        notes: '',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Payment Failed',
        message: err.message || 'Unable to record payment.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      const member = memberMap.get(p.memberId);
      const memberName = member?.fullName || '';
      const ref = p.ref || '';

      const matchesSearch =
        memberName.toLowerCase().includes(search.toLowerCase()) ||
        ref.toLowerCase().includes(search.toLowerCase()) ||
        p.type?.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (methodFilter === 'All') return true;
      return p.method?.toLowerCase() === methodFilter.toLowerCase();
    });
  }, [payments, memberMap, search, methodFilter]);

  const pagedPayments = useMemo(() => {
    return filteredPayments.slice(0, displayCount);
  }, [filteredPayments, displayCount]);

  // Daily totals
  const totalCollected = useMemo(() => payments.reduce((acc, p) => acc + (p.amount || 0), 0), [payments]);
  const cashTotal = useMemo(
    () => payments.filter((p) => p.method?.toLowerCase() === 'cash').reduce((acc, p) => acc + (p.amount || 0), 0),
    [payments]
  );
  const upiTotal = useMemo(
    () => payments.filter((p) => p.method?.toLowerCase() === 'upi').reduce((acc, p) => acc + (p.amount || 0), 0),
    [payments]
  );
  const cardTotal = useMemo(
    () => payments.filter((p) => p.method?.toLowerCase() === 'card').reduce((acc, p) => acc + (p.amount || 0), 0),
    [payments]
  );

  const filteredModalMembers = useMemo(() => {
    if (!modalMemberSearch.trim()) return members.slice(0, 6);
    return members
      .filter(
        (m) =>
          m.fullName.toLowerCase().includes(modalMemberSearch.toLowerCase()) ||
          m.phone.includes(modalMemberSearch)
      )
      .slice(0, 6);
  }, [members, modalMemberSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Front Desk Payments &amp; POS
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Accept Cash, UPI, and Card transactions, issue receipts, and reconcile cash drawer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:from-rose-700"
          >
            <Plus className="size-4" />
            Record Payment (Cash / POS)
          </button>
        </div>
      </div>

      {/* Cash Drawer & Collection Breakdown */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Collected</p>
            <Receipt className="size-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-white">
            {formatIndianCurrency(totalCollected)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Cumulative receipts recorded</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Cash in Drawer</p>
            <Banknote className="size-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600">
            {formatIndianCurrency(cashTotal)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Physical cash on front desk</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">UPI / QR</p>
            <Smartphone className="size-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-blue-600">
            {formatIndianCurrency(upiTotal)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Google Pay &bull; PhonePe &bull; Paytm</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Card / POS</p>
            <CreditCard className="size-4 text-purple-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-purple-600">
            {formatIndianCurrency(cardTotal)}
          </div>
          <p className="mt-1 text-xs text-slate-500">Swipe &amp; contactless terminal</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-studio-800 dark:bg-studio-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search payments by member name, receipt reference, or fee type..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDisplayCount(8);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2 pl-10 pr-4 text-xs font-medium text-slate-900 outline-none transition focus:border-rose-500 focus:bg-white focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['All', 'Cash', 'UPI', 'Card', 'Bank Transfer'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethodFilter(m);
                setDisplayCount(8);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                methodFilter === m
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-studio-800 dark:text-slate-300 dark:hover:bg-studio-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Payment Transactions Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-studio-800 dark:bg-studio-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
            <thead className="border-b border-slate-200 bg-slate-50/75 text-xs font-semibold text-slate-600 dark:border-studio-800 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-6 py-3">Receipt / Ref</th>
                <th className="px-6 py-3">Member</th>
                <th className="px-6 py-3">Amount (INR)</th>
                <th className="px-6 py-3">Method</th>
                <th className="px-6 py-3">Fee Type</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {pagedPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-xs text-slate-400">
                    No payment transactions found matching criteria.
                  </td>
                </tr>
              ) : (
                pagedPayments.map((p, idx) => {
                  const member = memberMap.get(p.memberId);
                  const isCash = p.method?.toLowerCase() === 'cash';

                  return (
                    <tr key={p.id || p.ref || idx} className="hover:bg-slate-50/50 dark:hover:bg-studio-800/40">
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {p.ref || `REC-${idx + 1}`}
                      </td>
                      <td className="px-6 py-3.5 text-xs">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {member?.fullName || `Member (${p.memberId?.slice(0, 8)})`}
                        </p>
                        <p className="text-[11px] text-slate-400">{member?.phone || ''}</p>
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatIndianCurrency(p.amount)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            isCash
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-300'
                          }`}
                        >
                          {isCash && <Banknote className="size-3" />}
                          {p.method}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {p.type || 'Membership Fee'}
                      </td>
                      <td className="px-6 py-3.5 font-mono text-xs text-slate-400">
                        {p.date?.slice(0, 10)}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            p.status?.toLowerCase() === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Lazy Loading 8 + See More */}
        {filteredPayments.length > displayCount && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-6 py-3.5 dark:border-studio-800 dark:bg-studio-950">
            <span className="text-xs text-slate-500">
              Showing {pagedPayments.length} of {filteredPayments.length} transactions
            </span>
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + 8)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
            >
              See More (+8)
            </button>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-studio-800 dark:bg-studio-900 sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-studio-800">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Banknote className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Record Front-Desk Payment</h3>
                  <p className="text-xs text-slate-400">Register manual Cash, UPI, or POS receipt</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-studio-800"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="mt-5 space-y-4">
              {/* Member Search & Select */}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Select Member *
                </label>
                <input
                  type="text"
                  placeholder="Type name or phone to filter members..."
                  value={modalMemberSearch}
                  onChange={(e) => setModalMemberSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:bg-white dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                />
                <div className="mt-2 max-h-32 overflow-y-auto rounded-xl border border-slate-200 p-1 dark:border-studio-800">
                  {filteredModalMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setFormData({ ...formData, memberId: m.id })}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs transition ${
                        formData.memberId === m.id
                          ? 'bg-rose-50 text-rose-700 font-bold dark:bg-rose-950/50 dark:text-rose-300'
                          : 'hover:bg-slate-50 text-slate-700 dark:text-slate-300 dark:hover:bg-studio-800'
                      }`}
                    >
                      <span>{m.fullName}</span>
                      <span className="font-mono text-[11px] text-slate-400">{m.phone}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Amount (INR ₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 2500"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Payment Method *
                  </label>
                  <select
                    value={formData.method}
                    onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  >
                    <option value="Cash">Cash (In-Hand)</option>
                    <option value="UPI">UPI (Google Pay / PhonePe)</option>
                    <option value="Card">Card (POS Terminal)</option>
                    <option value="Bank Transfer">Bank Transfer (NEFT/IMPS)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Fee / Item Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  >
                    <option value="Membership Fee">Membership Subscription</option>
                    <option value="Personal Training">Personal Training (PT)</option>
                    <option value="Day Pass">Guest Day Pass</option>
                    <option value="Locker Rental">Locker Rental</option>
                    <option value="Merchandise / Supplements">Merchandise / Cafe</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Reference / Receipt # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Auto-generated if blank"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="Optional billing or receipt remark"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.amount}
                  className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 hover:from-emerald-700 disabled:opacity-50"
                >
                  {submitting ? 'Recording...' : 'Record Payment & Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
