'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthContext, extractErrorMessage } from '@/lib/auth/AuthContext';
import { useTenantBranding } from '@/features/settings';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import { formatInr } from '@/lib/localization/india';
import {
  SparklesIcon,
  CheckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  UsersIcon,
  LockIcon,
} from '@/components/ui/icons';

interface MembershipPlan {
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

function MembershipPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useTenantBranding();
  const { user, isAuthenticated, registerMember, logout } = useAuthContext();

  const planId = searchParams?.get('planId') || '';
  const tenant = searchParams?.get('tenant') || '';

  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dedicated customer registration form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(
    () => (searchParams?.get('ref') || searchParams?.get('referral') || '').toUpperCase()
  );
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Fetch verified plan details strictly from backend API
  const fetchPlanDetails = useCallback(async () => {
    if (!planId) {
      setLoading(false);
      setError('No membership plan specified. Please select a pass from the explore page.');
      return;
    }

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
        throw new Error(`Studio API returned status ${res.status}`);
      }

      const payload = await res.json();
      let rawList: unknown[] = [];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
        rawList = (payload as any).data;
      }

      const matched = rawList.find((item: any) => String(item?.id) === planId);
      if (!matched) {
        throw new Error('Selected membership plan was not found or is currently inactive.');
      }

      setPlan({
        id: String((matched as any).id),
        name: String((matched as any).name || 'Studio Membership'),
        planType: String((matched as any).planType || (matched as any).billingCycle || 'Monthly'),
        priceINR: Number((matched as any).priceINR || (matched as any).price || 0),
        sessionLimit: typeof (matched as any).sessionLimit === 'number' ? (matched as any).sessionLimit : null,
        benefits: (matched as any).benefits,
        description: (matched as any).description,
        active: true,
        featured: Boolean((matched as any).featured),
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve plan details from studio backend.');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchPlanDetails();
  }, [fetchPlanDetails]);

  // Derived benefits list
  const getPlanBenefits = (item: MembershipPlan): string[] => {
    if (item.benefits) {
      if (Array.isArray(item.benefits)) return item.benefits;
      if (typeof item.benefits === 'string') {
        try {
          const parsed = JSON.parse(item.benefits);
          if (Array.isArray(parsed)) return parsed;
        } catch {}
        return item.benefits.split(/[,;\n]+/).map((b) => b.trim()).filter(Boolean);
      }
    }
    const derived: string[] = [];
    if (typeof item.sessionLimit === 'number' && item.sessionLimit > 0) {
      derived.push(`${item.sessionLimit} studio classes included`);
    } else {
      derived.push('Unlimited studio classes access');
    }
    derived.push(`${item.planType} validity period`);
    derived.push('Locker & changing room privileges');
    derived.push('Priority booking for studio workshops');
    return derived;
  };

  // Handle member registration with password
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!fullName.trim()) {
      setAuthError('Please enter your full name for membership registration.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setAuthError('Please enter a valid email address for your member login.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!password || password.length < 8) {
      setAuthError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setAuthError('Passwords do not match. Please re-enter.');
      return;
    }

    setAuthBusy(true);
    const res = await registerMember({
      fullName: fullName.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password,
      confirmPassword,
    });
    setAuthBusy(false);

    if (res.success) {
      const tenantParam = tenant ? `&tenant=${encodeURIComponent(tenant)}` : '';
      const refParam = referralCode.trim() ? `&ref=${encodeURIComponent(referralCode.trim().toUpperCase())}` : '';
      router.push(`/checkout?planId=${encodeURIComponent(planId)}${tenantParam}${refParam}`);
    } else {
      const msg = typeof res.message === 'string' ? res.message : extractErrorMessage(res.message, 'Registration failed. Please try again.');
      setAuthError(msg);
    }
  };

  const backUrl = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';
  const checkoutUrl = `/checkout?planId=${encodeURIComponent(planId)}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ''}`;
  const memberLoginUrl = `/member-login?planId=${encodeURIComponent(planId)}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ''}`;

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans">
      {/* Top Header with Original Fitness AI Logo & Back to Member Explore */}
      <header className="border-b border-slate-200/80 bg-white/95 px-4 py-4 sm:px-8 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-950 transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Back to Member Explore</span>
          </Link>

          {/* Original Fitness AI Logo and Brand Name Navigating to /member-explore */}
          <Link
            href={backUrl}
            className="group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800"
            aria-label="Fitness AI Member Explore"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-800 border border-rose-200/60 shadow-2xs transition-transform duration-200 group-hover:scale-105"
              aria-hidden="true"
            >
              <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight text-left">
              <span className="font-serif text-lg font-bold tracking-tight text-slate-950 group-hover:text-rose-950 transition-colors">
                Fitness AI
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-rose-800">
                {branding.studioName || 'Member Sanctuary'}
              </span>
            </span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        {loading ? (
          <div className="flex min-h-[400px] items-center justify-center rounded-[2.5rem] border border-slate-200/80 bg-white p-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Loading membership pass details...
              </p>
            </div>
          </div>
        ) : error || !plan ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-rose-900">{error || 'Membership plan not found'}</p>
            <Link
              href={backUrl}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-900 transition-colors"
            >
              Return to Member Explore
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            {/* Left Column: Selected Membership Pass Details */}
            <div className="lg:col-span-6 rounded-[2.25rem] border border-slate-200/90 bg-white p-7 sm:p-9 shadow-[0_10px_35px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-block rounded-full bg-rose-50 border border-rose-200/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-900">
                  {plan.planType} Pass
                </span>
                {typeof plan.sessionLimit === 'number' && (
                  <span className="text-xs font-bold text-rose-800">
                    {plan.sessionLimit > 0 ? `${plan.sessionLimit} sessions` : 'Unlimited sessions'}
                  </span>
                )}
              </div>

              <h1 className="mt-4 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
                {plan.name}
              </h1>

              <div className="mt-4 flex items-baseline gap-2 border-b border-slate-100 pb-6">
                <span className="font-serif text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-950">
                  {formatInr(plan.priceINR)}
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  / {plan.planType.toLowerCase()}
                </span>
              </div>

              {plan.description && (
                <p className="mt-5 text-sm leading-6 text-slate-600">
                  {plan.description}
                </p>
              )}

              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                  Pass Privileges &amp; Benefits
                </p>
                <ul className="space-y-3.5 text-[15px] leading-relaxed text-slate-800">
                  {getPlanBenefits(plan).map((feat, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-800 mt-0.5 border border-rose-100">
                        <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                      </span>
                      <span className="leading-snug font-medium text-slate-800">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8 rounded-2xl bg-[#FAF8F5] border border-slate-200/80 p-4.5 flex items-center gap-3">
                <ShieldCheckIcon className="h-5 w-5 text-emerald-700 shrink-0" />
                <p className="text-xs text-slate-600">
                  <strong className="text-slate-900 font-semibold">Verified Studio Rate:</strong> Synchronized with the active studio database. No hidden convenience fees.
                </p>
              </div>
            </div>

            {/* Right Column: Customer Registration & Existing Member Sign-in Link */}
            <div className="lg:col-span-6 rounded-[2.25rem] border border-slate-200/90 bg-white p-7 sm:p-9 shadow-[0_10px_35px_rgba(15,23,42,0.06)]">
              {isAuthenticated && user ? (
                /* Authenticated State */
                <div className="space-y-6">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Signed In Member</p>
                    <h3 className="mt-1 font-serif text-2xl font-bold text-slate-950">{user.name}</h3>
                    <p className="mt-1 text-xs text-slate-600">{user.phone || user.email || 'Registered Member Account'}</p>
                    <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                      Member ID: {user.memberId} &bull; Ready for checkout
                    </p>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed">
                    You are signed in to your member sanctuary account. Proceed to review your pass order and billing terms for <strong>{plan.name}</strong>.
                  </p>

                  <div className="pt-2 space-y-3">
                    <Link
                      href={checkoutUrl}
                      className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-950/15 hover:bg-rose-900 transition-all active:scale-98"
                    >
                      <span>Continue to Checkout</span>
                      <ArrowRightIcon className="h-4 w-4" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => logout()}
                      className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-2"
                    >
                      Sign in with a different member account
                    </button>
                  </div>
                </div>
              ) : (
                /* Unauthenticated: New Customer Registration with Link to /member-login */
                <div>
                  {/* Clear link to existing member login with preserved planId & tenant */}
                  <div className="mb-6 rounded-2xl bg-[#FAF8F5] border border-slate-200/90 p-4.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-slate-900">Already a studio member?</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Sign in to bind this pass directly to your existing account.
                      </p>
                    </div>
                    <Link
                      href={memberLoginUrl}
                      className="inline-flex shrink-0 min-h-10 items-center justify-center rounded-full border border-rose-800/80 bg-white px-5 text-xs font-bold uppercase tracking-wider text-rose-800 hover:bg-rose-50 transition active:scale-95 shadow-xs"
                    >
                      <span>Sign In to Member Portal</span>
                    </Link>
                  </div>

                  <h2 className="font-serif text-2xl font-bold text-slate-950">
                    New Member Registration
                  </h2>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                    Create your member profile to purchase and bind your <strong>{plan.name}</strong> pass.
                  </p>

                  {authError && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-4 text-xs text-rose-950 leading-relaxed space-y-2">
                      <p className="font-semibold text-rose-900">Registration Notice</p>
                      <p>{typeof authError === 'string' ? authError : String((authError as any)?.message || 'Registration notice')}</p>
                      {typeof authError === 'string' && (authError.toLowerCase().includes('already exists') || authError.toLowerCase().includes('sign in')) && (
                        <div className="pt-1">
                          <Link
                            href={memberLoginUrl}
                            className="inline-flex items-center gap-1.5 font-bold text-rose-800 hover:text-rose-950 underline underline-offset-2"
                          >
                            <span>Click here to sign in with your existing account &rarr;</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleRegister} className="mt-6 space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Full Name <span className="text-rose-800">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Priyanshu Sharma"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Email Address <span className="text-rose-800">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="member@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          Used for member login and booking confirmations.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Mobile Number <span className="text-rose-800">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                            +91
                          </span>
                          <input
                            type="tel"
                            required
                            maxLength={10}
                            placeholder="9876543210"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-12 pr-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Used for studio WhatsApp updates and access verification.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                            Password <span className="text-rose-800">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              required
                              minLength={8}
                              placeholder="Min 8 characters"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800 pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-700"
                            >
                              {showPassword ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                            Confirm Password <span className="text-rose-800">*</span>
                          </label>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            placeholder="Re-enter password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                          />
                        </div>
                      </div>

                      {/* Optional Referral Code (Task 7) */}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center justify-between">
                          <span>Have a Referral Code?</span>
                          <span className="text-[10px] font-semibold text-slate-400 lowercase">(optional &bull; 5% off)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. PRIYA-8X4K"
                          value={referralCode}
                          onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-mono uppercase tracking-wider text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:tracking-normal focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                        />
                        <p className="mt-1 text-[11px] text-slate-500">
                          If a friend referred you, enter their code to receive 5% off your membership pass.
                        </p>
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={authBusy}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-rose-950/15 hover:bg-rose-900 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {authBusy ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <span>Create Account &amp; Continue to Checkout</span>
                          )}
                        </button>
                      </div>
                    </form>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function MembershipPlanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        </div>
      }
    >
      <MembershipPlanContent />
    </Suspense>
  );
}
