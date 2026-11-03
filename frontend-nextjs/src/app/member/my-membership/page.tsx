'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { CheckCircleIcon, CheckIcon, ShieldCheckIcon, SparklesIcon, CreditCardIcon } from '@/components/ui/icons';
import { formatInr } from '@/lib/localization/india';

const STUDIO_PASSES = [
  {
    id: 'plan_starter',
    name: 'Starter Dancer',
    price: 5999,
    period: 'month',
    credits: '8 Sessions',
    features: [
      '8 studio classes per month',
      'Any dance or yoga discipline',
      'Digital student portal access',
      '7-day advance booking window',
    ],
  },
  {
    id: 'plan_unlimited',
    name: 'Unlimited Fitness Studio OS',
    price: 11999,
    period: 'month',
    featured: true,
    credits: 'Unlimited Sessions',
    features: [
      'Unlimited classes across all disciplines',
      'Full access to Reformer Pilates & Classical Ballet',
      '2 free guest passes monthly',
      'Priority workshop & recital registration',
      '14-day advance booking window',
    ],
  },
  {
    id: 'plan_pro_vip',
    name: 'Pro Academy VIP',
    price: 18999,
    period: 'month',
    credits: 'Unlimited + 1-on-1',
    features: [
      'All Unlimited Pass benefits',
      '2 monthly 1-on-1 master instructor sessions',
      'Complimentary studio locker & apparel service',
      'Unlimited sound bath & recovery lounge access',
    ],
  },
];

export default function MemberMembershipPage() {
  const { user, activeMembership } = useAuthContext();
  const { addToast } = useToast();
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  const handleUpgrade = (planName: string) => {
    addToast({
      type: 'info',
      title: 'Checkout Redirect',
      message: `Selected ${planName}. Connecting to studio payment provider...`,
    });
  };

  return (
    <div className="space-y-8">
      {/* Active Membership Status Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-sm space-y-6">
        {activeMembership ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
                  ACTIVE STUDIO MEMBERSHIP
                </span>
                <h1 className="font-serif text-3xl font-bold text-slate-900">{activeMembership.planName}</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Member ID: <strong className="font-mono text-slate-800">{user?.memberId || 'N/A'}</strong> &bull; Member since {user?.joinedDate || 'Recently joined'}
                </p>
              </div>
              <span className="px-4 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider self-start sm:self-center">
                {activeMembership.status}
              </span>
            </div>

            {/* Credit Meter */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-slate-200/80 space-y-2">
                <span className="text-xs text-slate-400 font-medium block">Monthly Credit Allowance</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-3xl font-bold text-slate-900">
                    {activeMembership.remainingCredits}
                  </span>
                  <span className="text-xs text-slate-500">/ {activeMembership.totalCredits} credits remaining</span>
                </div>
                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden mt-2">
                  <div
                    className="h-full bg-teal-700 rounded-full"
                    style={{ width: `${((activeMembership.remainingCredits || 0) / (activeMembership.totalCredits || 1)) * 100}%` }}
                  />
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-slate-200/80 space-y-1">
                <span className="text-xs text-slate-400 font-medium block">Pass Expiry Date</span>
                <span className="font-serif text-2xl font-bold text-slate-900 block">{activeMembership.expiryDate}</span>
                <span className="text-xs text-teal-700 font-medium">Auto-renews via Razorpay mandate</span>
              </div>

              <div className="p-5 rounded-2xl bg-[#FCFAF8] border border-slate-200/80 space-y-1">
                <span className="text-xs text-slate-400 font-medium block">Subscription Rate</span>
                <span className="font-serif text-2xl font-bold text-slate-900 block">{activeMembership.priceFormatted}</span>
                <span className="text-xs text-slate-500">Includes all studio taxes &amp; locker access</span>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-6">
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-1">
              STUDIO PASSES
            </span>
            <h1 className="font-serif text-2xl font-bold text-slate-900">No Active Membership Pass</h1>
            <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
              You do not currently have an active membership credit pass. Choose one of our studio passes below to book classes and practice at our Indiranagar and Bandra sanctuaries.
            </p>
          </div>
        )}
      </div>

      {/* Explore & Upgrade Passes Section */}
      <div className="space-y-6">
        <div>
          <span className="text-xs uppercase font-bold tracking-[0.2em] text-teal-800 block mb-1">
            STUDIO PASS CATALOG
          </span>
          <h2 className="font-serif text-2xl font-bold text-slate-900">Compare &amp; Upgrade Membership</h2>
          <p className="text-xs text-slate-500 mt-1">
            Switch plans at any time. Unused credits rollover to your new membership cycle.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {STUDIO_PASSES.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 ${
                plan.featured
                  ? 'bg-white border-2 border-[#E11D48] shadow-xl relative'
                  : 'bg-white border border-slate-200/80 shadow-sm hover:shadow-md'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#E11D48] text-white text-[10px] uppercase font-bold tracking-widest px-4 py-1 rounded-full shadow">
                  ACTIVE CURRENT PASS
                </div>
              )}

              <div>
                <span className="text-xs uppercase font-bold tracking-widest text-slate-400 block">{plan.credits}</span>
                <h3 className="font-serif text-2xl font-bold text-slate-900 mt-1">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-serif text-3xl font-bold text-slate-900">{formatInr(plan.price)}</span>
                  <span className="text-xs text-slate-500">/ {plan.period}</span>
                </div>

                <ul className="mt-6 space-y-3 text-xs text-slate-600">
                  {plan.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckIcon className="w-4 h-4 text-[#E11D48] flex-shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => handleUpgrade(plan.name)}
                className={`mt-8 w-full py-3 rounded-full text-xs uppercase font-bold tracking-wider transition ${
                  plan.featured
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-[#E11D48] text-white hover:bg-[#BE123C] shadow-sm'
                }`}
              >
                {plan.featured ? 'Current Active Pass' : `Upgrade to ${plan.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
