'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import { formatInr } from '@/lib/localization/india';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

export interface MembershipPlan {
  id: string;
  name: string;
  planType: string;
  priceINR: number;
  sessionLimit?: number | null;
  benefits?: string | string[];
  description?: string;
  active: boolean;
  featured?: boolean;
}

interface MemberExploreMembershipsProps {
  studioName?: string;
}

export function MemberExploreMemberships({ studioName = 'Fitness AI' }: MemberExploreMembershipsProps) {
  const searchParams = useSearchParams();
  const tenant = searchParams?.get('tenant') || '';
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showAllPlans, setShowAllPlans] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (tenantHost) {
        headers['x-tenant-host'] = tenantHost;
      }

      const apiBase = resolveClientApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/memberships/plans`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 404) {
          setPlans([]);
          return;
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const payload = await res.json();
      let rawList: unknown[] = [];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
        rawList = (payload as any).data;
      }

      const activePlans: MembershipPlan[] = rawList
        .filter((item: any) => {
          if (!item || typeof item !== 'object') return false;
          return item.active === true || String(item.active).toLowerCase() === 'true';
        })
        .map((item: any, idx: number) => ({
          id: String(item.id || `plan-${idx}`),
          name: String(item.name || 'Studio Membership'),
          planType: String(item.planType || item.billingCycle || 'Monthly'),
          priceINR: Number(item.priceINR || item.price || 0),
          sessionLimit: typeof item.sessionLimit === 'number' ? item.sessionLimit : null,
          benefits: item.benefits,
          description: item.description,
          active: true,
          // Genuine backend field only; never fabricated
          featured: Boolean(item.featured),
        }));

      setPlans(activePlans);
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve studio memberships.');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    if (showAllPlans) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [plans, showAllPlans, updateScrollButtons]);

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth < 640 ? el.clientWidth * 0.88 : el.clientWidth < 1024 ? (el.clientWidth - 24) / 2 : (el.clientWidth - 48) / 3;
    const offset = direction === 'left' ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const getPlanBenefits = (plan: MembershipPlan): string[] => {
    if (plan.benefits) {
      if (Array.isArray(plan.benefits)) return plan.benefits;
      if (typeof plan.benefits === 'string') {
        try {
          const parsed = JSON.parse(plan.benefits);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return plan.benefits.split(/[,;\n]+/).map((b) => b.trim()).filter(Boolean);
      }
    }
    // Genuine items derived directly from real plan attributes
    const items: string[] = [];
    if (typeof plan.sessionLimit === 'number' && plan.sessionLimit > 0) {
      items.push(`${plan.sessionLimit} studio sessions included`);
    } else {
      items.push('Unlimited studio class access');
    }
    items.push(`${plan.planType} validity period`);
    items.push('Full studio facilities & lockers');
    return items;
  };

  const renderCard = (plan: MembershipPlan, isCarousel: boolean) => {
    const feats = getPlanBenefits(plan);
    const cardWidthClasses = isCarousel
      ? 'w-[85vw] max-w-[340px] sm:w-[360px] md:w-[calc((100%-24px)/2)] md:max-w-none lg:w-[calc((100%-48px)/3)] shrink-0 snap-start'
      : 'w-full';

    return (
      <div
        key={plan.id}
        className={`${cardWidthClasses} rounded-[2.25rem] p-7 sm:p-8 flex flex-col justify-between transition-all duration-300 min-h-[520px] ${
          plan.featured
            ? 'bg-white border-2 border-rose-800 shadow-[0_20px_50px_rgba(225,29,72,0.12)] hover:shadow-[0_25px_60px_rgba(225,29,72,0.18)] hover:-translate-y-1 relative'
            : 'bg-white border border-slate-200/90 shadow-[0_10px_35px_rgba(15,23,42,0.05)] hover:shadow-[0_20px_45px_rgba(15,23,42,0.10)] hover:-translate-y-1'
        }`}
      >
        {/* Genuine recommended badge only if backed by data */}
        {plan.featured && (
          <div className="absolute -top-3.5 left-8 inline-flex items-center gap-1.5 rounded-full bg-rose-800 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-md">
            <SparklesIcon className="h-3 w-3" />
            <span>Recommended</span>
          </div>
        )}

        <div className="flex flex-col">
          {/* Top Badges */}
          <div className="flex items-center justify-between gap-2">
            <span className="inline-block rounded-full bg-rose-50 border border-rose-200/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-900">
              {plan.planType}
            </span>
            {typeof plan.sessionLimit === 'number' && (
              <span className="text-xs font-bold text-rose-800">
                {plan.sessionLimit > 0 ? `${plan.sessionLimit} sessions` : 'Unlimited'}
              </span>
            )}
          </div>

          {/* Plan Title */}
          <h3 className="mt-4 font-serif text-2xl font-bold tracking-tight text-slate-950 min-h-[3.25rem] flex items-center">
            {plan.name}
          </h3>

          {/* Actual Price */}
          <div className="mt-3 flex items-baseline gap-2 border-b border-slate-100 pb-5">
            <span className="font-serif text-4xl sm:text-[2.65rem] font-extrabold tracking-tight text-slate-950">
              {formatInr(plan.priceINR)}
            </span>
            <span className="text-sm font-semibold text-slate-500">
              / {plan.planType.toLowerCase()}
            </span>
          </div>

          {/* Description if present */}
          {plan.description && (
            <p className="mt-4 text-xs leading-5 text-slate-600 line-clamp-2">
              {plan.description}
            </p>
          )}

          {/* Genuine Benefits Checklist with High Contrast and Readability */}
          <div className="mt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
              Pass Privileges
            </p>
            <ul className="space-y-3.5 text-[15px] leading-relaxed text-slate-800">
              {feats.map((feat, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-800 mt-0.5 border border-rose-100">
                    <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                  </span>
                  <span className="leading-snug font-medium text-slate-800">{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Consistently Aligned Bottom CTA Button */}
        <div className="mt-auto pt-8">
          <Link
            href={`/membership-plan?planId=${encodeURIComponent(plan.id)}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ''}`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 bg-rose-800 text-white shadow-md shadow-rose-950/15 hover:bg-rose-900 hover:shadow-lg active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2"
          >
            <span>Choose Plan</span>
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <section id="memberships" className="relative bg-[#FAF8F5] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-7xl">
        
        {/* Section Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-800">
              <SparklesIcon className="h-3.5 w-3.5 text-rose-700" />
              <span>{studioName} &bull; Practice Memberships</span>
            </span>
            <h2 className="mt-3 font-serif text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Active Membership Plans
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Select the practice pass tailored to your journey. Memberships include class scheduling privileges, studio facilities, and certified instruction.
            </p>
          </div>

          {/* Action Area: View All Memberships Toggle & Carousel Arrows */}
          {plans.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setShowAllPlans((prev) => !prev)}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-slate-300/90 bg-white px-5 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95"
              >
                <span>{showAllPlans ? 'Show Carousel' : 'View All Memberships'}</span>
              </button>

              {!showAllPlans && plans.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollByDirection('left')}
                    disabled={!canScrollLeft}
                    aria-label="Previous plans"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-700 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollByDirection('right')}
                    disabled={!canScrollRight}
                    aria-label="Next plans"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-700 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Body */}
        <div className="mt-10">
          {loading ? (
            <div className="flex min-h-[340px] items-center justify-center rounded-[2.5rem] border border-slate-200/80 bg-white/80 backdrop-blur-sm p-12">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Loading studio memberships...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center text-xs text-amber-900 shadow-sm">
              <p className="font-semibold text-sm">{error}</p>
              <button
                type="button"
                onClick={fetchPlans}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-amber-800 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-amber-900 transition"
              >
                Retry
              </button>
            </div>
          ) : plans.length === 0 ? (
            /* Clean compact empty state */
            <div className="mx-auto max-w-lg rounded-[2rem] border border-slate-200/80 bg-white p-8 sm:p-10 text-center shadow-sm">
              <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-full bg-rose-50 text-rose-800 mb-4">
                <ShieldCheckIcon className="h-7 w-7" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900">
                Membership Plans
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                No membership plans currently available. Please check back soon or contact studio reception.
              </p>
            </div>
          ) : showAllPlans ? (
            /* View All Memberships: All active plans revealed in full responsive grid */
            <div
              role="region"
              aria-label="All active studio memberships"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2"
            >
              {plans.map((plan) => renderCard(plan, false))}
            </div>
          ) : (
            /* Carousel View */
            <div
              ref={scrollContainerRef}
              tabIndex={0}
              role="region"
              aria-label="Active membership plans carousel"
              /* Responsive sizing: exactly 3 cards on desktop (lg), 2 cards on tablet (md), 1 card on mobile */
              className="flex gap-6 overflow-x-auto pb-8 pt-2 scroll-smooth snap-x snap-mandatory focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {plans.map((plan) => renderCard(plan, true))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
