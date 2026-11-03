'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { CreditCardIcon, CheckCircleIcon, IndianRupeeIcon, ExternalLinkIcon, ShieldCheckIcon } from '@/components/ui/icons';
import { formatIndianMobile, formatInr, formatIstDateTime } from '@/lib/localization/india';

const paymentAmount = (value: unknown) => {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function MemberPaymentsPage() {
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const [payments, setPayments] = useState<any[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<any | null>(null);

  const handleDownloadInvoice = (pay: any) => {
    if (!pay?.invoiceUrl || pay.invoiceUrl === '#') {
      addToast({
        type: 'info',
        title: 'Invoice Unavailable',
        message: `Official tax invoice PDF is being prepared by the studio billing system for ref ${pay?.id || 'this transaction'}. Please contact your studio concierge.`,
      });
      return;
    }
    window.open(pay.invoiceUrl, '_blank');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
            FINANCIAL RECORDS &amp; RECEIPTS
          </span>
          <h1 className="font-serif text-3xl font-bold text-slate-900">Payments &amp; Transactions</h1>
          <p className="text-xs text-slate-500 mt-1">
            Razorpay merchant integration &bull; GST tax receipts available for download.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-4 py-2 rounded-2xl bg-teal-50 border border-teal-100 text-teal-800 text-xs font-semibold flex items-center gap-2">
            <ShieldCheckIcon className="w-4 h-4 text-teal-700" />
            <span>256-Bit SSL Encrypted Payments</span>
          </div>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="font-serif text-xl font-bold text-slate-900">Payment History</h2>
        </div>

        {payments.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <CreditCardIcon className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="font-serif text-base font-bold text-slate-800">No payment transactions found</p>
            <p className="mt-1 text-slate-400 max-w-md mx-auto">
              Any membership fees, class packages, or drop-in payments processed through Razorpay will be listed here with verified tax receipts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-[#FCFAF8] text-slate-700 uppercase tracking-wider text-[10px] font-bold border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Transaction ID</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4">Method</th>
                  <th className="px-6 py-4">Amount</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-mono text-slate-900 font-semibold">{pay.id}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{pay.description}</td>
                    <td className="px-6 py-4 text-slate-500">{formatIstDateTime(pay.date)}</td>
                    <td className="px-6 py-4 text-slate-500">{pay.method}</td>
                    <td className="px-6 py-4 font-serif text-sm font-bold text-slate-900">{formatInr(paymentAmount(pay.amount))}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                        {pay.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedReceipt(pay)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Receipt View Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in duration-200">
            <div className="text-center border-b border-slate-100 pb-4">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-teal-800">
                TAX INVOICE RECEIPT
              </span>
              <h3 className="font-serif text-2xl font-bold text-slate-900 mt-1">Fitness Studio OS</h3>
              <p className="text-[11px] text-slate-400">GSTIN: 29AAAAA0000A1Z5 &bull; Bengaluru Sanctuary</p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Transaction Ref:</span>
                <span className="font-mono text-slate-900 font-bold">{selectedReceipt.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Razorpay ID:</span>
                <span className="font-mono text-slate-800">{selectedReceipt.razorpayPaymentId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Billed To:</span>
                <span className="font-medium text-slate-900">{user?.name} ({user?.phone ? formatIndianMobile(user.phone) : 'Phone unavailable'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Item Description:</span>
                <span className="font-medium text-slate-900 text-right max-w-[200px]">{selectedReceipt.description}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3">
                <span className="text-slate-500">Base amount:</span>
                <span className="font-medium text-slate-900">{formatInr(paymentAmount(selectedReceipt.amount) / 1.18)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">GST (18%):</span>
                <span className="font-medium text-slate-900">{formatInr(paymentAmount(selectedReceipt.amount) - paymentAmount(selectedReceipt.amount) / 1.18)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-3 text-sm font-bold">
                <span className="text-slate-900">Total Paid (incl. 18% GST):</span>
                <span className="font-serif text-lg text-[#E11D48]">{formatInr(paymentAmount(selectedReceipt.amount))}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="w-1/2 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadInvoice(selectedReceipt.id);
                  setSelectedReceipt(null);
                }}
                className="w-1/2 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs uppercase tracking-wider transition"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
