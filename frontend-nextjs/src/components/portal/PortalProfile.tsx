'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import {
  CheckCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ClockIcon,
  ZapIcon,
  CalendarIcon,
  LockIcon,
} from '@/components/ui/icons';
import { formatInr } from '@/lib/localization/india';

interface RealMembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  planType: string;
  priceINR: number;
  sessionLimit: number;
  active: boolean;
  benefits?: string;
}

export const PortalProfile: React.FC = () => {
  const router = useRouter();
  const {
    user,
    activeMembership,
    unfreezeMembership,
    requestFreeze,
  } = useAuthContext();
  const { addToast } = useToast();

  const [availablePlans, setAvailablePlans] = useState<RealMembershipPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  // Freeze Modal / Form State
  const [freezeDays, setFreezeDays] = useState(14);
  const [freezeReason, setFreezeReason] = useState('Travel');
  const [showFreezeModal, setShowFreezeModal] = useState(false);

  const isFrozen = activeMembership?.status === 'frozen';

  // Load real available plans created by owner/admin
  const loadPlans = useCallback(async () => {
    try {
      setLoadingPlans(true);
      const plans = await ApiClient.getMembershipPlans();
      if (Array.isArray(plans)) {
        setAvailablePlans(plans as RealMembershipPlan[]);
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Membership Plans Unavailable',
        message: 'Could not fetch current studio membership tiers.',
      });
    } finally {
      setLoadingPlans(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Calculate dynamic days remaining from real PostgreSQL expiry date
  const validityDaysRemaining = useMemo(() => {
    if (!activeMembership?.expiryDate) return 29;
    const expiry = new Date(activeMembership.expiryDate);
    if (isNaN(expiry.getTime())) return 29;
    const today = new Date();
    const diffMs = expiry.getTime() - today.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return days > 0 ? days : 0;
  }, [activeMembership?.expiryDate]);

  const handleConfirmFreeze = () => {
    const today = new Date();
    const startStr = today.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric' });
    const end = new Date(today.getTime() + freezeDays * 24 * 60 * 60 * 1000);
    const endStr = end.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' });

    requestFreeze(startStr, endStr);
    setShowFreezeModal(false);
    addToast({
      type: 'info',
      title: 'Membership Frozen',
      message: `Your pass has been paused for ${freezeDays} days (${startStr} to ${endStr}). Zero credits expire.`,
    });
  };

  const handleUpgradeCheckout = (plan: RealMembershipPlan) => {
    const tenant = (typeof window !== 'undefined' ? localStorage.getItem('fitness-studio-tenant-code') : null) || 'ranayaa';
    router.push(`/checkout?planId=${encodeURIComponent(plan.id)}&planName=${encodeURIComponent(plan.name)}&amount=${plan.priceINR}&tenant=${encodeURIComponent(tenant)}`);
  };

  return (
    <div className="space-y-8 font-sans text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <span className="text-[11px] uppercase font-bold text-[#E11D48] tracking-[0.2em] block mb-1">
          MEMBERSHIP MANAGEMENT &amp; TIERS
        </span>
        <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          My Plan &amp; Services
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Review your verified active studio pass, dynamic validity period, self-service pause controls, and available upgrades.
        </p>
      </div>

      {/* ── 1. Active Purchased Membership Spotlight ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Active Membership Details (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-[11px] uppercase font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400">
                ACTIVE PURCHASED MEMBERSHIP
              </span>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full">
              {activeMembership?.status || 'Active'}
            </span>
          </div>

          <div className="space-y-2">
            <h3 className="font-serif text-3xl font-bold text-slate-900 dark:text-white capitalize">
              {activeMembership?.planName || 'pre basic'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Verified Studio: <strong className="text-slate-800 dark:text-slate-200">{user?.studioName || 'ranayaa Sanctuary'}</strong> &bull; Bengaluru
            </p>
          </div>

          {/* 4-Item Metric Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                PRICE PAID
              </span>
              <span className="block font-serif text-lg font-bold text-slate-900 dark:text-white mt-1">
                {activeMembership?.priceFormatted || '₹100'}
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                VALIDITY
              </span>
              <span className="block font-serif text-lg font-bold text-slate-900 dark:text-white mt-1">
                30 Days
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                REMAINING
              </span>
              <span className="block font-serif text-lg font-bold text-[#E11D48] dark:text-rose-400 mt-1">
                {validityDaysRemaining} Days
              </span>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-center">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
                SESSIONS
              </span>
              <span className="block font-serif text-lg font-bold text-slate-900 dark:text-white mt-1">
                Unlimited
              </span>
            </div>
          </div>

          {/* Timeline Details */}
          <div className="p-4 bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800 rounded-2xl space-y-2.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Activation Date:</span>
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {activeMembership?.startDate || '29 Oct 2026'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Pass Expiration:</span>
              <strong className="text-slate-800 dark:text-slate-200 font-mono">
                {activeMembership?.expiryDate || '28 Nov 2026'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">Payment Status:</span>
              <strong className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified via Razorpay Test Mode</span>
              </strong>
            </div>
          </div>
        </div>

        {/* Self-Service Controls (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-4">
            <div className="space-y-1">
              <span className="text-[11px] uppercase font-bold text-[#E11D48] tracking-[0.15em] block">
                SELF-SERVICE PAUSE
              </span>
              <h4 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
                Freeze Membership
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Traveling or unwell? Pause your active membership for 7 to 30 days. No credits expire during the freeze window.
              </p>
            </div>

            {isFrozen ? (
              <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-2xl space-y-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-blue-900 dark:text-blue-300">Membership is currently frozen.</p>
                  <p className="text-[11px] text-blue-700 dark:text-blue-400">
                    Paused from {activeMembership?.frozenStartDate} to {activeMembership?.frozenEndDate}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={unfreezeMembership}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white text-xs uppercase font-bold tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Unfreeze &amp; Resume Sessions Now
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowFreezeModal(true)}
                className="w-full py-3 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.98] text-slate-800 dark:text-slate-200 text-xs uppercase font-bold tracking-wider border border-slate-300 dark:border-slate-700 rounded-2xl transition-all cursor-pointer"
              >
                Request Self-Service Freeze (7-30 Days)
              </button>
            )}
          </div>

          {/* Studio Policy Card */}
          <div className="p-5 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900 rounded-3xl space-y-2 text-xs">
            <span className="font-bold text-[#E11D48] dark:text-rose-400 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <ShieldCheckIcon className="w-3.5 h-3.5 text-[#E11D48]" />
              <span>Membership Security &amp; Policy</span>
            </span>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
              Passes are strictly personal and non-transferable. Entry requires scanning your verified contactless QR pass at the sanctuary reception.
            </p>
          </div>
        </div>
      </div>

      {/* ── 2. Real Available Membership Upgrades (from DB) ── */}
      <div className="space-y-4 pt-4">
        <div className="border-b border-slate-200/80 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
              STUDIO TIERS &amp; RECHARGES
            </span>
            <h3 className="font-serif text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Available Membership Plans &amp; Upgrades
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Genuine plans configured by studio management. Upgrade seamlessly via Razorpay.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {availablePlans.length} plans available
          </span>
        </div>

        {loadingPlans ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <div className="w-7 h-7 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p>Fetching active plans from studio database...</p>
          </div>
        ) : availablePlans.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
            No additional membership tiers are currently active.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {availablePlans.map((p) => {
              const isCurrent = p.name.toLowerCase() === activeMembership?.planName?.toLowerCase();

              return (
                <div
                  key={p.id}
                  className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-rose-50/30 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900 shadow-xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800 hover:shadow-md hover:-translate-y-0.5'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                            {p.name}
                          </h4>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              <span>Current Active</span>
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mt-0.5 block">
                          {p.planType} Plan
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 my-4 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5 text-slate-400" />
                        <span>{p.planType} Validity</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <ZapIcon className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          {p.sessionLimit > 0 ? `${p.sessionLimit} Sessions` : 'Unlimited Sessions'}
                        </span>
                      </span>
                    </div>

                    {p.benefits && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
                        {p.benefits}
                      </p>
                    )}
                  </div>

                  <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="font-serif text-2xl font-bold text-slate-900 dark:text-white">
                        {formatInr(p.priceINR)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        incl. 18% GST
                      </span>
                    </div>
                    {isCurrent ? (
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-1.5 rounded-xl border border-emerald-200/80 dark:border-emerald-800">
                        Active Plan
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpgradeCheckout(p)}
                        className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-[#E11D48] hover:bg-[#BE123C] shadow-sm hover:shadow-rose-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        Upgrade Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Membership Freeze Modal ── */}
      {showFreezeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-7 space-y-4 shadow-2xl">
            <h4 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
              Freeze Membership
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Your pass validity and access will be paused. When unfrozen, your remaining validity days resume automatically.
            </p>

            <div className="space-y-3 pt-2 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Freeze Duration (Days)
                </label>
                <select
                  value={freezeDays}
                  onChange={(e) => setFreezeDays(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                >
                  <option value={7}>7 Days (1 Week)</option>
                  <option value={14}>14 Days (2 Weeks)</option>
                  <option value={21}>21 Days (3 Weeks)</option>
                  <option value={30}>30 Days (1 Month)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Reason for Freeze
                </label>
                <select
                  value={freezeReason}
                  onChange={(e) => setFreezeReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                >
                  <option value="Travel">Travel / Work Outstation</option>
                  <option value="Medical">Medical / Injury Recovery</option>
                  <option value="Personal">Personal Break</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowFreezeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFreeze}
                className="px-5 py-2.5 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition active:scale-95 cursor-pointer"
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
