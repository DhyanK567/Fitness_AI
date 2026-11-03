'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthContext, extractErrorMessage } from '@/lib/auth/AuthContext';
import { useTenantBranding } from '@/features/settings';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import { formatInr } from '@/lib/localization/india';
import { ApiClient } from '@/lib/api-client';
import {
  ShieldCheckIcon,
  CheckIcon,
  SparklesIcon,
  ArrowRightIcon,
  UsersIcon,
  ChevronLeftIcon,
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
}

interface ConfirmedOrder {
  orderRef: string;
  planName: string;
  planType: string;
  amount: number;
  memberName: string;
  memberId: string;
  confirmedAt: string;
}

interface GatewayConfig {
  enabled: boolean;
  mode: string;
  keyId: string | null;
  currency?: string;
}

function CheckoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useTenantBranding();
  const { user, isAuthenticated } = useAuthContext();

  const planId = searchParams?.get('planId') || '';
  const tenant = searchParams?.get('tenant') || '';

  const [plan, setPlan] = useState<MembershipPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [orderRef, setOrderRef] = useState<string>('');
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayConfig | null>(null);

  // Referral & Reward States (Task 7)
  const initialRefCode = (searchParams?.get('ref') || searchParams?.get('referral') || '').toUpperCase();
  const [referralInput, setReferralInput] = useState(initialRefCode);
  const [referralApplied, setReferralApplied] = useState<{
    code: string;
    discountPercent: number;
    discountAmount: number;
    referrerName?: string;
  } | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [availableRewards, setAvailableRewards] = useState<number>(0);
  const [applyReward, setApplyReward] = useState<boolean>(false);

  // Validate Referral Code via Backend API
  const handleApplyReferral = useCallback(
    async (codeToApply?: string) => {
      const code = (codeToApply || referralInput).trim().toUpperCase();
      if (!code) {
        setReferralError('Please enter a referral code to apply.');
        return;
      }
      setReferralLoading(true);
      setReferralError(null);
      try {
        const res = await ApiClient.validateReferralCode(code, plan?.id);
        if (res && res.valid) {
          const discountPct = res.discount_percent || 5;
          const base = plan?.priceINR || 0;
          const discountAmt = Math.round(base * (discountPct / 100));
          setReferralApplied({
            code,
            discountPercent: discountPct,
            discountAmount: discountAmt,
            referrerName: res.referrer_name,
          });
          setReferralInput(code);
          setApplyReward(false);
          setReferralError(null);
        } else {
          setReferralApplied(null);
          setReferralError(res?.message || 'Invalid or expired referral code.');
        }
      } catch (err: any) {
        setReferralApplied(null);
        setReferralError(err?.message || 'Invalid or expired referral code.');
      } finally {
        setReferralLoading(false);
      }
    },
    [referralInput, plan?.id, plan?.priceINR]
  );

  const handleRemoveReferral = () => {
    setReferralApplied(null);
    setReferralInput('');
    setReferralError(null);
  };

  // Fetch available referral rewards if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let isSubscribed = true;
    ApiClient.getMyReferral()
      .then((data) => {
        if (isSubscribed && data && typeof data.availableRewards === 'number') {
          setAvailableRewards(data.availableRewards);
        }
      })
      .catch(() => {});
    return () => {
      isSubscribed = false;
    };
  }, [isAuthenticated]);

  // Auto-validate initial referral code once plan is loaded
  useEffect(() => {
    if (initialRefCode && plan && !referralApplied) {
      handleApplyReferral(initialRefCode);
    }
  }, [initialRefCode, plan, handleApplyReferral, referralApplied]);

  // Fetch gateway configuration on mount
  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        const apiBase = resolveClientApiBaseUrl();
        const tenantHost = resolveClientTenantHost();
        const headers: Record<string, string> = {};
        if (tenantHost) headers['x-tenant-host'] = tenantHost;

        const res = await fetch(`${apiBase}/api/v1/payments/config`, {
          headers,
          cache: 'no-store',
        });
        if (res.ok) {
          const raw = await res.json();
          const data = raw?.data || raw;
          if (isMounted) setGatewayConfig(data);
        }
      } catch {
        // Fallback to unconfigured if offline or error
      }
    };
    void fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

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
      });

      // Generate stable deterministic order reference safe for records
      const cleanPlanPart = String((matched as any).id).replace(/\D/g, '').slice(-4) || '8192';
      setOrderRef(`ORD-${cleanPlanPart}-${Date.now().toString().slice(-4)}`);
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve plan details from studio backend.');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => {
    fetchPlanDetails();
  }, [fetchPlanDetails]);

  // Derive benefits from verified backend payload
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
    return derived;
  };

  // Helper to load Razorpay Checkout script dynamically
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') return resolve(false);
      if ((window as any).Razorpay) return resolve(true);
      const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(true));
        existing.addEventListener('error', () => resolve(false));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  // Authentic Razorpay Payment Flow
  const handleRazorpayPayment = async () => {
    if (!isAuthenticated || !plan || plan.priceINR <= 0) return;
    setProcessing(true);
    setPaymentError(null);

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Could not load Razorpay payment SDK. Please check your internet connection.');
      }

      const storedToken = localStorage.getItem('ws_member_token');
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken && storedToken !== 'http-only-cookie') {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      if (tenantHost) {
        headers['x-tenant-host'] = tenantHost;
      }

      const apiBase = resolveClientApiBaseUrl();

      // Step A: Create order on backend (amount derived server-side from PostgreSQL)
      const orderRes = await fetch(`${apiBase}/api/v1/payments/membership-order`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_id: plan.id,
          referral_code: referralApplied ? referralApplied.code : undefined,
          redeem_reward: applyReward ? true : undefined,
        }),
      });

      if (!orderRes.ok) {
        const errPayload = await orderRes.json().catch(() => ({}));
        throw new Error(extractErrorMessage(errPayload, `Payment order creation failed (HTTP ${orderRes.status})`));
      }

      const orderRaw = await orderRes.json();
      const orderData = orderRaw?.data || orderRaw;
      const { order_id, amount, currency, key_id, plan_name, receipt } = orderData;
      setOrderRef(order_id || receipt || orderRef);

      const options = {
        key: key_id || gatewayConfig?.keyId,
        amount,
        currency: currency || 'INR',
        name: branding.studioName || 'Fitness AI',
        description: `${plan_name} Membership Pass`,
        order_id,
        prefill: {
          name: user?.name || '',
          email: user?.email || '',
          contact: user?.phone || '',
        },
        theme: {
          color: '#881337',
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
            setPaymentError('Payment window was closed before completion. Your plan selection is preserved.');
          },
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // Step B: Cryptographically verify payment on backend and activate membership
          try {
            setProcessing(true);
            const verifyRes = await fetch(`${apiBase}/api/v1/payments/verify`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                plan_id: plan.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                referral_code: referralApplied ? referralApplied.code : undefined,
                redeem_reward: applyReward ? true : undefined,
              }),
            });

            if (!verifyRes.ok) {
              const verifyErr = await verifyRes.json().catch(() => ({}));
              throw new Error(extractErrorMessage(verifyErr, 'Payment signature verification failed on server.'));
            }

            const verifyRaw = await verifyRes.json();
            const verifiedData = verifyRaw?.data || verifyRaw;
            setConfirmedOrder({
              orderRef: verifiedData.orderRef || response.razorpay_order_id,
              planName: verifiedData.planName || plan.name,
              planType: verifiedData.planType || plan.planType,
              amount: verifiedData.amount || plan.priceINR,
              memberName: verifiedData.memberName || user?.name || 'Registered Member',
              memberId: verifiedData.memberId || user?.memberId || 'MEM-ONLINE',
              confirmedAt: verifiedData.confirmedAt || new Date().toISOString(),
            });
          } catch (vErr: any) {
            setPaymentError(vErr?.message || 'Payment verification failed after capture. Please contact studio support.');
          } finally {
            setProcessing(false);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failResp: any) => {
        setProcessing(false);
        setPaymentError(failResp?.error?.description || 'Payment was declined or cancelled.');
      });
      rzp.open();
    } catch (err: any) {
      setProcessing(false);
      setPaymentError(err?.message || 'Unable to start payment checkout session.');
    }
  };

  // Free Membership Pass Flow
  const handleFreePassActivation = async () => {
    if (!isAuthenticated || !plan || plan.priceINR !== 0) return;

    setProcessing(true);
    setPaymentError(null);
    try {
      const storedToken = localStorage.getItem('ws_member_token');
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (storedToken && storedToken !== 'http-only-cookie') {
        headers['Authorization'] = `Bearer ${storedToken}`;
      }
      if (tenantHost) {
        headers['x-tenant-host'] = tenantHost;
      }

      const apiBase = resolveClientApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/memberships/me`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          plan_name: plan.name,
          plan_type: plan.planType.toLowerCase(),
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          price: 0,
          auto_renew: false,
        }),
      });

      if (res.ok) {
        setConfirmedOrder({
          orderRef,
          planName: plan.name,
          planType: plan.planType,
          amount: 0,
          memberName: user?.name || 'Registered Member',
          memberId: user?.memberId || 'MEM-ONLINE',
          confirmedAt: new Date().toISOString(),
        });
      } else {
        const data = await res.json().catch(() => ({}));
        setPaymentError(data.message || 'Pass activation error. Please contact studio support.');
      }
    } catch {
      setPaymentError('Network communication failure during pass activation.');
    } finally {
      setProcessing(false);
    }
  };

  const backUrl = `/membership-plan?planId=${encodeURIComponent(planId)}${tenant ? `&tenant=${encodeURIComponent(tenant)}` : ''}`;
  const exploreUrl = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';
  const memberLoginUrl = tenant ? `/member-login?tenant=${encodeURIComponent(tenant)}` : '/member-login';

  const basePrice = plan?.priceINR || 0;
  const referralDiscountAmount = basePrice > 0 && referralApplied ? referralApplied.discountAmount : 0;
  const rewardRedemptionAmount = basePrice > 0 && applyReward ? Math.min(availableRewards, Math.max(0, basePrice - 1)) : 0;
  const totalAmount = basePrice > 0 ? Math.max(1, basePrice - referralDiscountAmount - rewardRedemptionAmount) : 0;
  const isGatewayReady = Boolean(gatewayConfig?.enabled && gatewayConfig?.keyId);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/95 px-4 py-4 sm:px-8 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href={confirmedOrder ? exploreUrl : backUrl}
            className="text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-950 transition inline-flex items-center gap-1.5"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>{confirmedOrder ? 'Back to Member Explore' : 'Back to Plan Details'}</span>
          </Link>

          <Link
            href={exploreUrl}
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
                {branding.studioName || 'Member Sanctuary'} &bull; Checkout
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        {loading ? (
          <div className="flex min-h-[340px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-12">
            <div className="flex flex-col items-center gap-3">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Verifying membership plan with studio records...
              </p>
            </div>
          </div>
        ) : error && !plan ? (
          <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center sm:p-12 shadow-sm">
            <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-full bg-rose-50 text-rose-800 mb-4">
              <ShieldCheckIcon className="h-7 w-7" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Plan Unavailable</h2>
            <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
              {error}
            </p>
            <div className="mt-6">
              <Link
                href={exploreUrl}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-900 transition"
              >
                Browse Available Plans
              </Link>
            </div>
          </div>
        ) : confirmedOrder ? (
          /* ========================================================= */
          /* SECTION 5: AFTER PAYMENT / VERIFIED CONFIRMATION VIEW     */
          /* ========================================================= */
          <div className="mx-auto max-w-2xl rounded-[2.5rem] border border-emerald-200 bg-white p-8 sm:p-12 shadow-[0_20px_50px_rgba(16,185,129,0.08)] text-center animate-fadeIn">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 mb-6 border border-emerald-200">
              <CheckIcon className="h-8 w-8 stroke-[2.5]" />
            </div>

            <span className="inline-block rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 px-3.5 py-1 text-xs font-bold uppercase tracking-wider mb-2">
              Payment &amp; Activation Confirmed
            </span>

            <h1 className="font-serif text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950">
              Welcome to Your Sanctuary
            </h1>

            <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
              Your membership pass has been successfully activated and bound to your member profile in the studio database.
            </p>

            {/* Confirmed Order Details Card */}
            <div className="mt-8 rounded-2xl bg-[#FAF8F5] border border-slate-200/90 p-6 text-left space-y-3.5 text-sm">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Order Reference</span>
                <span className="font-mono text-xs font-bold text-slate-900 bg-white px-2.5 py-1 rounded border border-slate-200">
                  {confirmedOrder.orderRef}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-600">Membership Pass</span>
                <span className="font-bold text-slate-950">{confirmedOrder.planName}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-600">Validity Cycle</span>
                <span className="font-semibold text-slate-800">{confirmedOrder.planType}</span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-slate-600">Registered Member</span>
                <span className="font-semibold text-slate-800">
                  {confirmedOrder.memberName} ({confirmedOrder.memberId})
                </span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                <span className="font-bold text-slate-900">Total Settled</span>
                <span className="font-serif text-2xl font-extrabold text-emerald-800">
                  {formatInr(confirmedOrder.amount)}
                </span>
              </div>
            </div>

            {/* Action Buttons: Explicit customer action, no unexpected auto-redirect */}
            <div className="mt-8 space-y-3">
              <Link
                href={user ? (tenant ? `/portal?tab=home&tenant=${encodeURIComponent(tenant)}` : '/portal?tab=home') : memberLoginUrl}
                className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-950/15 hover:bg-rose-900 transition active:scale-98"
              >
                <span>{user ? 'Go to Member Dashboard' : 'Sign In to Member Portal'}</span>
                <ArrowRightIcon className="h-4 w-4" />
              </Link>

              <Link
                href={exploreUrl}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-300 bg-white px-6 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                <span>Return to Member Explore</span>
              </Link>
            </div>
          </div>
        ) : plan && (
          /* ========================================================= */
          /* SECTION 4: CHECKOUT & PAYMENT UI                          */
          /* ========================================================= */
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            {/* Left Column: Plan Summary & Registered Member Profile */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-[2.25rem] border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm">
                <span className="inline-block rounded-full bg-rose-50 border border-rose-200/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-900 mb-3">
                  {plan.planType} Pass
                </span>
                <h1 className="font-serif text-3xl font-extrabold text-slate-950">
                  {plan.name}
                </h1>
                {plan.description && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {plan.description}
                  </p>
                )}

                <div className="mt-6 border-t border-slate-100 pt-6">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3.5">
                    Included Privileges
                  </p>
                  <ul className="space-y-3 text-sm text-slate-700">
                    {getPlanBenefits(plan).map((feat, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-800 mt-0.5 border border-rose-100">
                          <CheckIcon className="h-3 w-3 stroke-[2.5]" />
                        </span>
                        <span className="leading-snug">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Registered Member Account Safe State */}
              <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-800 shrink-0">
                    <UsersIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-base font-bold text-slate-900">
                      Member Account Verified
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {isAuthenticated && user ? (
                        <span>
                          Signed in as <strong className="text-slate-900">{user.name}</strong> ({user.memberId}) &bull; {user.phone || user.email}
                        </span>
                      ) : (
                        <span className="text-amber-800 font-medium">
                          Registration incomplete. Please return to enter your details.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Safe Order Record Reference */}
              <div className="rounded-[2rem] border border-slate-200/80 bg-white p-5 shadow-sm text-xs text-slate-600 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheckIcon className="h-4.5 w-4.5 text-emerald-700" />
                  <span>Order Reference Record:</span>
                </div>
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded">
                  {orderRef}
                </span>
              </div>
            </div>

            {/* Right Column: Order Pricing Review & Payment UI */}
            <div className="lg:col-span-5 space-y-6">
              <div className="rounded-[2.25rem] border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Order Summary
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
                    {orderRef}
                  </span>
                </div>

                <h2 className="mt-2 font-serif text-xl font-bold text-slate-950">
                  Pricing Review
                </h2>

                {/* Referral Code & Rewards Redemption Section (Task 7) */}
                {plan.priceINR > 0 && (
                  <div className="mt-4 space-y-3">
                    {/* Available Referral Reward Redemption for Logged-In Members */}
                    {isAuthenticated && availableRewards > 0 && (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-start gap-3">
                        <input
                          type="checkbox"
                          id="apply-reward-checkbox"
                          checked={applyReward}
                          onChange={(e) => {
                            setApplyReward(e.target.checked);
                            if (e.target.checked) {
                              setReferralApplied(null);
                              setReferralError(null);
                            }
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-800 focus:ring-rose-800 cursor-pointer"
                        />
                        <label htmlFor="apply-reward-checkbox" className="text-xs text-emerald-950 cursor-pointer">
                          <span className="font-bold">Apply referral reward credit</span>
                          <span className="block text-emerald-800 text-[11px] mt-0.5">
                            You have <strong className="font-semibold">{formatInr(availableRewards)}</strong> in reward credits available.
                          </span>
                        </label>
                      </div>
                    )}

                    {/* Friend Referral Code Input */}
                    {!applyReward && (
                      <div className="rounded-2xl border border-slate-200 bg-[#FAF8F5] p-3.5 space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                          Have a referral code?
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="e.g. PRIYA-8X4K"
                            value={referralInput}
                            onChange={(e) => {
                              setReferralInput(e.target.value.toUpperCase());
                              setReferralError(null);
                            }}
                            disabled={referralLoading || Boolean(referralApplied)}
                            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:font-sans placeholder:font-normal focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800 disabled:opacity-60"
                          />
                          {referralApplied ? (
                            <button
                              type="button"
                              onClick={handleRemoveReferral}
                              className="px-3 py-2 rounded-xl border border-rose-200 text-rose-800 bg-white text-xs font-bold hover:bg-rose-50 transition cursor-pointer"
                            >
                              Remove
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApplyReferral()}
                              disabled={referralLoading || !referralInput.trim()}
                              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-40 transition cursor-pointer"
                            >
                              {referralLoading ? 'Checking...' : 'Apply'}
                            </button>
                          )}
                        </div>

                        {referralError && (
                          <p className="text-[11px] text-rose-700 font-medium">
                            {referralError}
                          </p>
                        )}

                        {referralApplied && (
                          <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-[11px] text-emerald-800 font-semibold">
                            <span>5% discount applied via {referralApplied.code}</span>
                            <span className="font-bold text-emerald-900">-{formatInr(referralDiscountAmount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 space-y-3 border-t border-slate-100 pt-5 text-sm">
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Base Price ({plan.name})</span>
                    <span className="font-semibold text-slate-900">{formatInr(basePrice)}</span>
                  </div>

                  {referralDiscountAmount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-semibold">
                      <span>Referral Discount (5%)</span>
                      <span>-{formatInr(referralDiscountAmount)}</span>
                    </div>
                  )}

                  {rewardRedemptionAmount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700 font-semibold">
                      <span>Reward Credit Applied</span>
                      <span>-{formatInr(rewardRedemptionAmount)}</span>
                    </div>
                  )}

                  {/* Confirmed Tax Details: Configurable and inclusive of applicable taxes */}
                  <div className="flex items-start justify-between text-xs text-slate-500 pt-1">
                    <span>Applicable Taxes</span>
                    <span className="font-medium text-slate-700 text-right">
                      Inclusive of applicable taxes
                    </span>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex items-baseline justify-between text-slate-900">
                    <span className="font-bold text-base">Final Payable</span>
                    <span className="font-serif text-2xl font-extrabold text-slate-950">
                      {formatInr(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* Error Banner */}
                {paymentError && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 leading-relaxed">
                    <strong>Payment Alert:</strong> {typeof paymentError === 'string' ? paymentError : String((paymentError as any)?.message || 'Payment processing error.')}
                  </div>
                )}

                {/* Desktop Dynamic UPI QR Area & Mobile UPI Checkout Area */}
                {plan.priceINR > 0 ? (
                  <div className="mt-6 space-y-4">
                    {isGatewayReady ? (
                      /* ACTIVE RAZORPAY TEST MODE UI */
                      <>
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900 mb-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>Razorpay Test Mode Active</span>
                          </div>
                          <p className="text-xs text-emerald-800 font-medium">
                            Gateway Key: <code className="bg-white px-2 py-0.5 rounded text-[11px] font-mono border border-emerald-200">{gatewayConfig?.keyId}</code>
                          </p>
                          <p className="mt-2 text-[11px] text-emerald-700 leading-relaxed">
                            Official Razorpay modal will open supporting test UPI QR, UPI ID, Cards, and Netbanking. Real money will not be debited.
                          </p>
                        </div>

                        {/* Supported UPI & Payment Badges */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">
                            Supported Gateway Payment Methods
                          </p>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold text-slate-600">
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">UPI / QR</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">GPay / PhonePe</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">Cards</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">Netbanking</div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500 text-center">
                            Genuine Razorpay Test Mode checkout &bull; Instant server-side verification
                          </p>
                        </div>

                        {/* Active Payment CTA Button */}
                        <button
                          type="button"
                          onClick={handleRazorpayPayment}
                          disabled={processing || !isAuthenticated}
                          className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-950/20 hover:bg-rose-900 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                        >
                          {processing ? (
                            <div className="flex items-center gap-2">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              <span>Processing Payment...</span>
                            </div>
                          ) : (
                            <>
                              <span>Pay {formatInr(totalAmount)} via Razorpay</span>
                              <ArrowRightIcon className="h-4 w-4" />
                            </>
                          )}
                        </button>
                      </>
                    ) : (
                      /* GATEWAY SETUP PENDING FALLBACK UI (Safe State when credentials are unset) */
                      <>
                        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-[#FAF8F5] p-5 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 mb-2">
                            <LockIcon className="h-4 w-4 text-amber-700" />
                            <span>Payment Setup Pending</span>
                          </div>

                          <div className="mx-auto my-3 flex h-36 w-36 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-inner">
                            <div className="flex flex-col items-center gap-1.5 text-slate-400">
                              <svg className="h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Dynamic UPI QR
                              </span>
                            </div>
                          </div>

                          <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                            <p className="font-semibold text-slate-800">
                              Order #{orderRef} &bull; {formatInr(totalAmount)}
                            </p>
                            <p className="text-slate-500 leading-relaxed">
                              Provider-generated dynamic UPI QR code will appear here once live merchant gateway credentials (RAZORPAY_KEY_ID) are active.
                            </p>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4.5">
                          <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">
                            Supported UPI Gateway Checkout
                          </p>
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-semibold text-slate-600">
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">GPay</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">PhonePe</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">Paytm</div>
                            <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">BHIM</div>
                          </div>
                          <p className="mt-2 text-[10px] text-slate-500 text-center">
                            Direct app handoff will be processed through the approved payment gateway flow.
                          </p>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-900 leading-relaxed">
                          <strong>Payment Gateway Pending:</strong> Razorpay credentials are not yet configured on this environment. In accordance with studio financial policy, paid passes cannot be activated without verified payment settlement. Your order selection is preserved under reference <strong className="font-mono">{orderRef}</strong>.
                        </div>

                        <button
                          type="button"
                          disabled
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-300 px-6 text-xs font-bold uppercase tracking-wider text-slate-600 cursor-not-allowed"
                        >
                          <LockIcon className="h-4 w-4" />
                          <span>Payment Gateway Setup Pending</span>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  /* Free Membership Pass Flow: Authentic Server-Side Activation */
                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 leading-relaxed">
                      <strong>Complimentary Practice Pass:</strong> This pass carries zero charges. Clicking below will verify your account and directly activate your pass in the studio database.
                    </div>

                    <button
                      type="button"
                      onClick={handleFreePassActivation}
                      disabled={processing || !isAuthenticated}
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-rose-950/15 hover:bg-rose-900 transition active:scale-98 disabled:opacity-60 cursor-pointer"
                    >
                      {processing ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <>
                          <span>Activate Complimentary Pass</span>
                          <ArrowRightIcon className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                <p className="mt-4 text-center text-[11px] text-slate-400">
                  Fitness AI Sanctuary &bull; Verified Server Persistence
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
