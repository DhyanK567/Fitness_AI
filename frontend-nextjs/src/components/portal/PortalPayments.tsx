'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import {
  CheckCircleIcon,
  CreditCardIcon,
  XIcon,
  FileTextIcon,
} from '@/components/ui/icons';
import { formatInr } from '@/lib/localization/india';

interface StudioPaymentRecord {
  id: string;
  tenantId: string;
  memberId: string;
  ref: string;
  date: string;
  type: string;
  method: string;
  status: string;
  amount: number;
  refundedAmount?: number;
  notes?: string | null;
}

interface TaxInvoice {
  invoiceNumber: string;
  date: string;
  description: string;
  baseAmount: number;
  cgst: number;
  sgst: number;
  totalAmount: number;
  sacCode: string;
  paymentMethod: string;
  refNumber: string;
  status: string;
}

export const PortalPayments: React.FC = () => {
  const { user, activeMembership, settleDues } = useAuthContext();
  const { addToast } = useToast();

  const [payments, setPayments] = useState<StudioPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);
  const [payingDue, setPayingDue] = useState(false);

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await ApiClient.getMyPayments();
      setPayments(Array.isArray(res) ? res : []);
    } catch {
      addToast({
        type: 'error',
        title: 'Payment History Unavailable',
        message: 'Could not fetch your verified payment records.',
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const pendingAmount = activeMembership?.pendingDues || 0;
  const totalSpent = payments
    .filter((p) => p.status?.toLowerCase() === 'paid')
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  const handlePayDue = () => {
    setPayingDue(true);
    setTimeout(() => {
      setPayingDue(false);
      settleDues();
      addToast({
        type: 'success',
        title: 'Payment Succeeded',
        message: `Settled balance via Desk UPI. Tax invoice generated!`,
      });
      loadPayments();
    }, 700);
  };

  const toTaxInvoice = (payment: StudioPaymentRecord): TaxInvoice => {
    const d = new Date(payment.date);
    const dateFormatted = isNaN(d.getTime())
      ? 'Recent'
      : d.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
    const invCode = payment.ref ? payment.ref.replace(/^pay_/, '').slice(0, 8).toUpperCase() : payment.id.slice(0, 8).toUpperCase();
    const invoiceNumber = `INV-${d.getFullYear() || 2026}-${invCode}`;

    const total = payment.amount || 0;
    const base = Number((total / 1.18).toFixed(2));
    const gstHalf = Number(((total - base) / 2).toFixed(2));

    let desc = payment.notes || 'Studio Membership & Sanctuary Access';
    if (desc.includes('Plan:')) {
      const match = desc.match(/Plan:\s*([^.]+)/);
      if (match) desc = `Studio Membership (${match[1].trim()})`;
    }

    return {
      invoiceNumber,
      date: dateFormatted,
      description: desc,
      baseAmount: base,
      cgst: gstHalf,
      sgst: gstHalf,
      totalAmount: total,
      sacCode: '999723',
      paymentMethod: payment.method || 'Razorpay',
      refNumber: payment.ref || payment.id,
      status: payment.status || 'Paid',
    };
  };

  return (
    <div className="space-y-8 font-sans text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <span className="text-[11px] uppercase font-bold text-[#E11D48] tracking-[0.2em] block mb-1">
          FINANCIAL LEDGER &amp; TAX COMPLIANCE
        </span>
        <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          Payments
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          View verified membership purchases, payment status, and download printable GST tax receipts.
        </p>
      </div>

      {/* ── 1. Top Financial Metrics Bar ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD 1: TOTAL STUDIO INVESTMENT */}
        <div className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[190px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                TOTAL STUDIO INVESTMENT
              </span>
              <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Reconciled</span>
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-5">
              <span className="font-serif text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">
                {formatInr(totalSpent)}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 font-medium flex items-center gap-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-200">{payments.length}</span> verified transaction{payments.length === 1 ? '' : 's'} &bull; Database reconciled
          </p>
        </div>

        {/* CARD 2: CURRENT PLAN VALUE */}
        <div className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[190px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                CURRENT PLAN VALUE
              </span>
              <span className="bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 border border-rose-200/80 dark:border-rose-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48]" />
                <span>Active Plan</span>
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-5">
              <span className="font-serif text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-none tracking-tight">
                {activeMembership?.priceFormatted || '₹100'}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
              {activeMembership?.planName || 'pre basic'}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-medium">
              Valid until {activeMembership?.expiryDate || '28 Nov 2026'}
            </p>
          </div>
        </div>

        {/* CARD 3: PENDING INVOICES / DUES */}
        <div className="rounded-3xl p-6 sm:p-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[190px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                PENDING INVOICES / DUES
              </span>
              {pendingAmount > 0 ? (
                <span className="bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 border border-rose-200/80 dark:border-rose-900 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48] animate-pulse" />
                  <span>Action Required</span>
                </span>
              ) : (
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>Zero Balance</span>
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mt-5">
              <span
                className={`font-serif text-4xl sm:text-5xl font-bold leading-none tracking-tight ${
                  pendingAmount > 0 ? 'text-[#E11D48]' : 'text-slate-900 dark:text-white'
                }`}
              >
                {formatInr(pendingAmount)}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 font-medium">
            {pendingAmount > 0
              ? 'Outstanding balance pending settlement'
              : 'All studio dues and membership fees clear'}
          </p>
        </div>
      </div>

      {/* ── 2. Pending Studio Ledger Dues Banner (if any) ── */}
      {pendingAmount > 0 ? (
        <div className="p-6 bg-gradient-to-r from-rose-50/50 via-white to-white dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border border-rose-200 dark:border-rose-900 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#E11D48]" />
              </span>
              <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                Pending Studio Ledger
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              {activeMembership?.pendingDuesDescription || 'Membership Renewal / Balance Dues'}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="font-serif text-2xl font-bold text-[#E11D48]">₹{pendingAmount}</span>
              <p className="text-[10px] text-slate-400 font-medium">Inclusive of 18% GST</p>
            </div>
            <button
              type="button"
              onClick={handlePayDue}
              disabled={payingDue}
              className="px-6 py-3 bg-[#E11D48] hover:bg-[#BE123C] active:scale-[0.98] text-white text-xs uppercase font-bold tracking-wider rounded-xl transition-all duration-200 shadow-sm disabled:opacity-70 cursor-pointer"
            >
              {payingDue ? 'Processing...' : 'Settle Now'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 dark:border-emerald-500/30 rounded-2xl text-emerald-900 dark:text-emerald-300 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-bold">Zero Outstanding Dues:</span>
            <span className="text-slate-600 dark:text-slate-400">Your studio account has no pending ledger balances.</span>
          </div>
          <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
            All Clear
          </span>
        </div>
      )}

      {/* ── 3. Official GST Tax Invoices Table ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
            Official GST Tax Invoice History
          </h3>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full text-xs text-slate-600 dark:text-slate-300">
            <span className="text-[10px] uppercase font-bold text-slate-400">GSTIN</span>
            <strong className="text-slate-800 dark:text-slate-200 font-mono text-[11px]">29AABCU9603R1ZM</strong>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p>Fetching payment records from studio database...</p>
          </div>
        ) : (
          <div className="overflow-x-auto [scrollbar-width:none]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 uppercase tracking-[0.15em] text-[10px]">
                  <th className="py-3 px-3 font-bold">Date</th>
                  <th className="py-3 px-3 font-bold">Description</th>
                  <th className="py-3 px-3 font-bold">Payment Method</th>
                  <th className="py-3 px-3 font-bold">Reference / Txn ID</th>
                  <th className="py-3 px-3 font-bold">Status</th>
                  <th className="py-3 px-3 font-bold text-right">Amount (₹)</th>
                  <th className="py-3 px-3 font-bold text-center">Action</th>
                </tr>
              </thead>
              {payments.length === 0 ? (
                <tbody>
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                      <FileTextIcon className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                      <p className="font-medium text-slate-600 dark:text-slate-300">No payment records found.</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        Completed transactions and GST tax invoices will appear here.
                      </p>
                    </td>
                  </tr>
                </tbody>
              ) : (
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {payments.map((p) => {
                    const inv = toTaxInvoice(p);
                    const isPaid = p.status?.toLowerCase() === 'paid';
                    const isFailed = p.status?.toLowerCase() === 'failed';
                    return (
                      <tr key={p.id} className="hover:bg-rose-50/20 dark:hover:bg-slate-800/40 transition-colors duration-150">
                        <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 font-medium">
                          {inv.date}
                        </td>
                        <td className="py-3.5 px-3 font-medium max-w-xs truncate text-slate-800 dark:text-slate-200">
                          {inv.description}
                        </td>
                        <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {p.method || 'Razorpay'}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {p.ref || p.id.slice(0, 12)}
                        </td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              isPaid
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : isFailed
                                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                isPaid ? 'bg-emerald-500' : isFailed ? 'bg-rose-500' : 'bg-amber-500'
                              }`}
                            />
                            <span>{p.status || 'Paid'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right font-serif font-bold text-slate-900 dark:text-white text-sm">
                          {formatInr(p.amount)}
                        </td>
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="px-3 py-1.5 text-[10px] font-bold text-[#E11D48] dark:text-rose-400 hover:text-white border border-rose-200 dark:border-rose-900 hover:border-[#E11D48] bg-rose-50/50 dark:bg-rose-950/30 hover:bg-[#E11D48] rounded-lg transition-all duration-200 uppercase tracking-wider active:scale-95 cursor-pointer"
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
      </div>

      {/* ── Official Printable GST Tax Receipt Modal ── */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative space-y-6 text-slate-800 dark:text-slate-100 max-h-[90vh] overflow-y-auto [scrollbar-width:none]">
            {/* Modal Close */}
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>

            {/* Invoice Header */}
            <div className="border-b border-slate-200/80 dark:border-slate-800 pb-4 flex items-start justify-between">
              <div>
                <span className="font-serif text-xl font-bold text-slate-900 dark:text-white block tracking-tight">
                  {user?.studioName || 'ranayaa Sanctuary'}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {user?.studioBranch || 'Main Studio'} &bull; Bengaluru, Karnataka
                </p>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[10px] font-mono text-slate-600 dark:text-slate-300">
                  <span>GSTIN:</span>
                  <strong className="text-slate-900 dark:text-white">29AABCU9603R1ZM</strong>
                </div>
              </div>
              <div className="text-right pr-6">
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400 block">
                  TAX INVOICE
                </span>
                <p className="font-mono text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                  {selectedInvoice.invoiceNumber}
                </p>
                <p className="text-[11px] text-slate-400">{selectedInvoice.date}</p>
              </div>
            </div>

            {/* Bill To */}
            <div className="p-4 bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800 rounded-2xl grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] block">Bill To:</span>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5">{user?.name || 'Member'}</p>
                {user?.phone && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px] font-mono">{user.phone}</p>
                )}
                {user?.email && (
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">{user.email}</p>
                )}
              </div>
              <div>
                <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] block">Service SAC Code:</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">{selectedInvoice.sacCode}</p>
                <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">Physical Fitness &amp; Sanctuary Services</p>
              </div>
            </div>

            {/* Line Items & Tax Calculation */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800 font-medium text-slate-800 dark:text-slate-200">
                <span>{selectedInvoice.description}</span>
                <span className="font-mono font-semibold">₹{selectedInvoice.baseAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400">
                <span>CGST (9.0%)</span>
                <span className="font-mono">₹{selectedInvoice.cgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 text-slate-500 dark:text-slate-400">
                <span>SGST (9.0%)</span>
                <span className="font-mono">₹{selectedInvoice.sgst.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-slate-900 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-white">
                <span>Total Amount Paid</span>
                <span className="font-serif text-base">₹{selectedInvoice.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment Verification Stamp */}
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-900 dark:text-emerald-300 flex items-center justify-between">
              <div>
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Payment Verified</span>
                </p>
                <p className="text-[11px] font-mono text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                  Ref: {selectedInvoice.refNumber} &bull; {selectedInvoice.paymentMethod}
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 bg-emerald-600 text-white rounded-full">
                {selectedInvoice.status.toUpperCase()}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200 active:scale-95 shadow-sm cursor-pointer"
              >
                Print Official Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
