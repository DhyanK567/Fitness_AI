'use client';

import React from 'react';
import Link from 'next/link';

export interface StudioTierItem {
  name: string;
  code: string;
  priceInr: number;
  period: string;
  badge?: string;
  description: string;
  features?: string[];
}

export const STUDIO_TIERS: StudioTierItem[] = [
  {
    name: 'Basic',
    code: 'Basic',
    priceInr: 1000,
    period: 'per month',
    description: 'Essential operating tools for emerging boutiques, independent instructors, and single-room studios.',
    features: ['Members & membership records', 'Class schedule & attendance roster', 'Standard front-desk booking'],
  },
  {
    name: 'Premium',
    code: 'Premium',
    priceInr: 2000,
    period: 'per month',
    badge: 'Most Popular',
    description: 'Complete studio management with member portal access, automated reminders, and capacity operations.',
    features: ['All Basic capabilities', 'Member self-service booking portal', 'Automated reminders & waitlist manager', 'Staff & trainer coordination'],
  },
  {
    name: 'Ultra Premium',
    code: 'Ultra Premium',
    priceInr: 3000,
    period: 'per month',
    badge: 'Comprehensive Suite',
    description: 'Full-scale multi-room scheduling, comprehensive analytics, VIP retention workflows, and governed AI assistance.',
    features: ['All Premium capabilities', 'Multi-room & multi-trainer rosters', 'Detailed financial & attendance reports', 'Governed AI operations assistance'],
  },
];

export const PLATFORM_SCOPE = [
  'Members and memberships',
  'Classes, bookings and attendance',
  'Events, payments and reporting',
  'Governed AI assistance',
];

export interface StudioPricingSectionProps {
  id?: string;
  actionType?: 'link' | 'select';
  selectedPlan?: string;
  onSelectPlan?: (planName: string) => void;
  title?: string;
  eyebrow?: string;
  description?: string;
  compact?: boolean;
}

export function StudioPricingSection({
  id = 'membership',
  actionType = 'link',
  selectedPlan = 'Premium',
  onSelectPlan,
  title = 'Plans for studio businesses.',
  eyebrow = 'Studio subscriptions',
  description = 'Platform tiers for studios, separate from the member plans each studio configures for its community.',
  compact = false,
}: StudioPricingSectionProps) {
  const formatInr = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <section
      id={id}
      aria-label="Studio pricing and subscription plans"
      className={`relative isolate overflow-hidden bg-[#f1efeb] px-4 text-slate-900 sm:px-6 lg:px-8 ${
        compact ? 'py-10 sm:py-12' : 'py-16 sm:py-20 lg:py-24'
      }`}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,_rgba(159,18,57,0.08),_transparent_60%)]"
      />
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
            {eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
            {description}
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3 lg:gap-6">
          {STUDIO_TIERS.map((tier, index) => {
            const isSelected =
              selectedPlan === tier.name ||
              (tier.name === 'Ultra Premium' && selectedPlan === 'Ultra');
            const isPopular = index === 1;

            return (
              <article
                key={tier.name}
                className={`relative flex flex-col justify-between overflow-hidden rounded-[1.5rem] border bg-white p-6 text-slate-950 shadow-sm transition-all sm:p-8 ${
                  isSelected
                    ? 'border-rose-700 ring-2 ring-rose-700 shadow-[0_20px_50px_rgba(190,18,60,0.16)]'
                    : isPopular
                    ? 'border-rose-800 shadow-[0_18px_55px_rgba(136,19,55,0.12)]'
                    : 'border-slate-200 hover:-translate-y-1'
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-1.5 ${
                    isSelected
                      ? 'bg-rose-700'
                      : isPopular
                      ? 'bg-rose-800'
                      : index === 2
                      ? 'bg-slate-400'
                      : 'bg-slate-200'
                  }`}
                />

                <div className="relative">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-800">
                      Studio platform tier · 0{index + 1}
                    </p>
                    {tier.badge && (
                      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800 border border-rose-200">
                        {tier.badge}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-4 font-serif text-3xl font-semibold tracking-tight sm:text-4xl text-slate-950">
                    {tier.name}
                  </h3>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl text-slate-950">
                      {formatInr(tier.priceInr)}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">/ month</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">per studio account · preview pricing</p>

                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <p className="text-xs leading-6 text-slate-600">
                      {tier.description}
                    </p>
                  </div>

                  {tier.features && (
                    <ul className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-700">
                      {tier.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2">
                          <span className="text-rose-700 font-bold" aria-hidden="true">✓</span>
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-8 pt-4">
                  {actionType === 'link' ? (
                    <Link
                      href={`/staff-login?mode=register&plan=${encodeURIComponent(tier.name)}`}
                      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-bold transition-all shadow-sm ${
                        isPopular
                          ? 'bg-rose-800 text-white hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800'
                          : 'border border-slate-300 bg-white text-slate-800 hover:border-rose-700 hover:text-rose-800'
                      }`}
                    >
                      Choose {tier.name} →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectPlan?.(tier.name)}
                      aria-pressed={isSelected}
                      className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-xs font-bold transition-all shadow-sm cursor-pointer ${
                        isSelected
                          ? 'bg-rose-700 text-white shadow-rose-900/20 ring-2 ring-rose-700'
                          : isPopular
                          ? 'bg-rose-800 text-white hover:bg-rose-900'
                          : 'border border-slate-300 bg-white text-slate-800 hover:border-rose-700 hover:text-rose-800'
                      }`}
                    >
                      {isSelected ? '✓ Selected Plan' : `Select ${tier.name}`}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white/80 p-5 sm:p-7">
          <div className="grid gap-5 md:grid-cols-[0.8fr_1.2fr] md:items-start">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-800">
                Platform scope
              </p>
              <h3 className="mt-2 font-serif text-xl font-semibold text-slate-950">
                One connected studio foundation.
              </h3>
              <p className="mt-2 text-xs leading-6 text-slate-600">
                These core modules are available across the studio platform.
              </p>
            </div>
            <ul className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              {PLATFORM_SCOPE.map((capability) => (
                <li key={capability} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-0.5 text-rose-800">
                    ✳
                  </span>
                  {capability}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mx-auto mt-5 max-w-2xl text-center text-xs leading-6 text-slate-500">
          Monthly prices are temporary Indian-rupee placeholders for this prototype. Subscription checkout and tier entitlements are connected to the workspace software license.
        </p>
      </div>
    </section>
  );
}
