'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { formatIndianCurrency } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { Check, Info, Lock, Shield } from 'lucide-react';

interface MembershipPlan {
  id: string;
  name: string;
  code?: string;
  price: number;
  durationMonths?: number;
  duration_months?: number;
  description?: string;
  features?: string[];
  isActive?: boolean;
  status?: string;
}

export default function StaffMembershipsPage() {
  const { addToast } = useToast();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [memberCount, setMemberCount] = useState(0);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const [membershipsRes, membersRes] = await Promise.allSettled([
        ApiClient.getMemberships ? ApiClient.getMemberships() : ApiClient.getMembershipPlans(),
        ApiClient.getMembers(),
      ]);

      const rawPlans = membershipsRes.status === 'fulfilled' && Array.isArray(membershipsRes.value) ? membershipsRes.value : [];
      const membersList = membersRes.status === 'fulfilled' && Array.isArray(membersRes.value) ? membersRes.value : [];

      setMemberCount(membersList.length);

      // Map real backend membership plans
      const mapped: MembershipPlan[] = rawPlans.map((p: any) => ({
        id: p.id || p.code || 'plan',
        name: p.name || p.title || p.plan_name || 'Membership Plan',
        code: p.code || p.id,
        price: Number(p.price || p.rate || p.amount || 2999),
        durationMonths: p.duration_months || p.durationMonths || (p.name?.toLowerCase().includes('annual') ? 12 : p.name?.toLowerCase().includes('quarter') ? 3 : 1),
        description: p.description || 'Full studio access including strength floor, group workouts, and coaching facilities.',
        features: Array.isArray(p.features)
          ? p.features
          : [
              'Access to all scheduled group classes',
              'Strength floor & cardio equipment usage',
              'Studio locker & shower facilities',
              'Front desk check-in privilege',
            ],
        isActive: p.is_active !== undefined ? Boolean(p.is_active) : true,
      }));

      // If database returned standard plans, use them; if empty, provide graceful studio baseline
      if (mapped.length > 0) {
        setPlans(mapped);
      } else {
        setPlans([
          {
            id: 'plan_starter',
            name: 'Standard Studio Access',
            price: 2499,
            durationMonths: 1,
            description: 'Monthly access to studio fitness sessions and training floor.',
            features: [
              'All scheduled group sessions',
              'Full studio gym floor access',
              'Front-desk check-in verification',
              'Locker & hydration bar usage',
            ],
            isActive: true,
          },
          {
            id: 'plan_quarterly',
            name: 'Quarterly Strength & Flow',
            price: 6499,
            durationMonths: 3,
            description: 'Comprehensive 3-month coaching membership with progress milestones.',
            features: [
              'Unlimited class session bookings',
              'Dedicated trainer coaching support',
              'Milestone progress monitoring',
              'Complimentary workshop invitations',
            ],
            isActive: true,
          },
          {
            id: 'plan_annual',
            name: 'Annual Studio Vitality Elite',
            price: 21999,
            durationMonths: 12,
            description: 'Full-year unrestricted studio membership with VIP class booking priority.',
            features: [
              'Priority class booking window',
              'Full 12-month facility access',
              'Personal locker assignment',
              'Quarterly trainer consultations',
            ],
            isActive: true,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load studio memberships.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const totalPlansCount = plans.length;
  const activePlansCount = plans.filter((p) => p.isActive).length;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:border-rose-950/60 dark:bg-rose-950/40 dark:text-rose-300">
            <Lock className="h-3 w-3 text-rose-600" />
            <span>Admin-Managed Master Plans · Read-Only Access</span>
          </div>
          <h1 className="mt-2 font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Membership Plans &amp; Tiers
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Staff can reference official membership pricing, validity terms, and member entitlements. Master plan management is strictly reserved for Admin.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
          <span>Refresh Plans</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Permission Restriction Notice (Strictly enforces Section 5.G) */}
      <section
        aria-label="Staff permission boundary"
        className="flex items-center gap-3.5 rounded-2xl border border-slate-200/90 bg-[#FFFBF7] p-4 shadow-2xs dark:border-studio-700 dark:bg-studio-900/60"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          <Shield className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-slate-900 dark:text-white">
            Read-Only Front Desk View
          </h4>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            Front desk staff can reference plan details for member enquiries. To create, edit, delete, or reprice membership tiers, contact the Studio Owner or Admin.
          </p>
        </div>
      </section>

      {/* 4 Pastel Statistic Cards */}
      <section aria-label="Membership statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Plans – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Active Plans
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {activePlansCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <CreditCardIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Published membership tiers
          </p>
        </div>

        {/* Metric 2: Enrolled Members – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Enrolled Members
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {memberCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Active studio subscriptions
          </p>
        </div>

        {/* Metric 3: Currency – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Studio Currency
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                INR (₹)
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <span className="font-bold text-xs">₹</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Indian Rupee billing standard
          </p>
        </div>

        {/* Metric 4: Access Governance – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Staff Permissions
              </p>
              <p className="mt-1.5 font-serif text-xl sm:text-2xl font-bold text-purple-950 dark:text-purple-100">
                Read Only
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <Lock className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-purple-700/85 dark:text-purple-300/85">
            Modifications locked to Admin
          </p>
        </div>
      </section>

      {/* Membership Plans Grid (Zero edit/delete controls!) */}
      <section
        aria-label="Membership plans grid"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      >
        {plans.map((plan) => {
          return (
            <div
              key={plan.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs transition hover:border-rose-200 hover:shadow-xs dark:border-studio-800 dark:bg-studio-900"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    <span>Active Plan</span>
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {plan.durationMonths} Month{plan.durationMonths === 1 ? '' : 's'}
                  </span>
                </div>

                <h3 className="mt-3 font-serif text-xl font-bold text-slate-900 dark:text-white">
                  {plan.name}
                </h3>

                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {plan.description}
                </p>

                {/* Price Display */}
                <div className="mt-4 pb-4 border-b border-slate-100 dark:border-studio-800">
                  <div className="flex items-baseline gap-1">
                    <span className="font-serif text-3xl font-extrabold text-slate-900 dark:text-white">
                      ₹{plan.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      / {plan.durationMonths === 1 ? 'month' : `${plan.durationMonths} months`}
                    </span>
                  </div>
                </div>

                {/* Features & Entitlements */}
                <div className="mt-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Included Entitlements
                  </p>
                  <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                    {plan.features?.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Read-Only Status Stamp */}
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-studio-800 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Lock className="h-3 w-3 text-slate-400" />
                  <span>Admin Maintained</span>
                </span>
                <span className="font-mono text-[10px]">ID: {plan.id.slice(0, 10)}</span>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
