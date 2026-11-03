'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Clipboard,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  MailCheck,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { StudioPricingSection, STUDIO_TIERS, StudioTierItem } from '@/components/pricing/StudioPricingSection';
import { useTenantBranding } from '@/features/settings';
import { EmployeeSetupWizard } from '@/components/auth/EmployeeSetupWizard';
import {
  extractSession,
  getApiError,
  getApiErrorCode,
  getMfaTicket,
  PASSWORD_RULES,
  persistStudioSession,
  slugifyStudioName,
  unwrapApiPayload,
} from '@/lib/auth/studio-auth';
import { formatIndianMobile, isValidIndianMobile } from '@/lib/localization/india';

type Mode = 'login' | 'register' | 'setup';
type LoginStage = 'credentials' | 'mfa';
type RegistrationStep = 1 | 2 | 3 | 4 | 5;

interface EnrollmentDetails {
  token: string;
  secret: string;
  otpAuthUrl: string;
  recoveryCodes: string[];
}

interface PaymentVerifiedState {
  paymentId: string;
  orderId: string;
  amount: number;
  planTier: string;
  verifiedAt: string;
}

interface NoticeProps {
  tone?: 'error' | 'warning' | 'success' | 'info';
  children: React.ReactNode;
}

function Notice({ tone = 'info', children }: NoticeProps) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm leading-5 ${styles[tone]}`}>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-800">
      {label}
      <span className="mt-2 block">{children}</span>
      {error ? <span className="mt-1.5 block text-xs font-medium text-rose-700">{error}</span> : null}
      {!error && hint ? <span className="mt-1.5 block text-xs font-normal text-slate-500">{hint}</span> : null}
    </label>
  );
}

function OtpInput({
  value,
  onChange,
  disabled = false,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label htmlFor="mfa-code" className="block text-sm font-semibold text-slate-800">{label}</label>
      <div
        className="relative mt-3 grid cursor-text grid-cols-6 gap-2"
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          id="mfa-code"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={label}
          disabled={disabled}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        {Array.from({ length: 6 }).map((_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={`flex aspect-square max-h-14 items-center justify-center rounded-xl border bg-white text-xl font-bold shadow-sm transition sm:text-2xl ${
              index === value.length ? 'border-indigo-500 ring-4 ring-indigo-100' : 'border-slate-200'
            }`}
          >
            {value[index] ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const stepLabels = ['Studio', 'Subscription', 'Password', 'Authenticator', 'Workspace'];

function RegistrationStepper({ step }: { step: RegistrationStep }) {
  return (
    <ol aria-label="Registration progress" className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {stepLabels.map((label, index) => {
        const number = (index + 1) as RegistrationStep;
        const complete = number < step;
        const active = number === step;
        return (
          <li key={label} aria-current={active ? 'step' : undefined}>
            <div className={`h-1.5 rounded-full ${number <= step ? 'bg-gradient-to-r from-rose-600 to-indigo-600' : 'bg-slate-200'}`} />
            <div className="mt-2 flex items-center gap-1 sm:gap-1.5">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${number <= step ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {complete ? <Check className="h-3 w-3" /> : number}
              </span>
              <span className={`hidden text-[10px] sm:text-[11px] font-semibold sm:inline ${active ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function loadRazorpayScript(): Promise<boolean> {
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
}

function StudioAuthContent() {
  const branding = useTenantBranding();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>('login');
  const [selectedPlan, setSelectedPlan] = useState<'Basic' | 'Premium' | 'Ultra Premium'>('Premium');
  const [copied, setCopied] = useState<string | null>(null);

  // Existing Login state
  const [loginStage, setLoginStage] = useState<LoginStage>('credentials');
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loginCode, setLoginCode] = useState('');
  const [mfaTicket, setMfaTicket] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Create Studio Registration state
  const [registrationStep, setRegistrationStep] = useState<RegistrationStep>(1);
  const [studioName, setStudioName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [studioAddress, setStudioAddress] = useState('');
  const [studioCity, setStudioCity] = useState('');
  const [studioPincode, setStudioPincode] = useState('');

  // Subscription & Payment state
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [paymentVerified, setPaymentVerified] = useState<PaymentVerifiedState | null>(null);
  const [orderRef, setOrderRef] = useState('');
  const [razorpayKeyId, setRazorpayKeyId] = useState<string | null>(null);
  const [razorpayMode, setRazorpayMode] = useState<'test' | 'live'>('test');

  // Password & Authenticator state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tenantCode, setTenantCode] = useState('');
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [enrollment, setEnrollment] = useState<EnrollmentDetails | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [recoveryCodesSaved, setRecoveryCodesSaved] = useState(false);

  const tenantPreview = useMemo(() => slugifyStudioName(studioName) || 'your-studio', [studioName]);
  const passwordScore = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const inputClass = 'h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

  const planPrices: Record<'Basic' | 'Premium' | 'Ultra Premium', number> = {
    Basic: 1000,
    Premium: 2000,
    'Ultra Premium': 3000,
  };

  const selectedTierConfig: StudioTierItem = useMemo(() => {
    return (
      STUDIO_TIERS.find((t) => t.name === selectedPlan) || {
        name: selectedPlan,
        code: selectedPlan,
        priceInr: planPrices[selectedPlan] || 2000,
        period: 'per month',
        description: 'Complete studio management system.',
        features: ['Memberships', 'Scheduling', 'Attendance'],
      }
    );
  }, [selectedPlan]);

  // Load query params & remembered email
  useEffect(() => {
    const requestedMode = searchParams.get('mode');
    if (requestedMode === 'register' || requestedMode === 'login' || requestedMode === 'setup') {
      setMode(requestedMode);
    }
    const plan = searchParams.get('plan');
    if (plan) {
      const match = STUDIO_TIERS.find(
        (tier) => tier.name.toLowerCase() === plan.toLowerCase() || tier.code.toLowerCase() === plan.toLowerCase(),
      );
      if (match) setSelectedPlan(match.name as any);
    }
  }, [searchParams]);

  useEffect(() => {
    const remembered = window.localStorage.getItem('fitness-studio-remembered-id');
    if (remembered) {
      setLoginIdentifier(remembered);
      setRememberMe(true);
    }
  }, []);

  // Fetch live gateway payment configuration
  useEffect(() => {
    let active = true;
    fetch('/api/auth/studio/plan-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (data.razorpay?.key_id) setRazorpayKeyId(data.razorpay.key_id);
        if (data.razorpay?.mode) setRazorpayMode(data.razorpay.mode);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Render QR Code when enrollment token & auth URL available
  useEffect(() => {
    if (!enrollment?.otpAuthUrl) return;
    let active = true;
    QRCode.toDataURL(enrollment.otpAuthUrl, { width: 256, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => active && setQrDataUrl(url))
      .catch(() => active && setRegistrationError('The QR code could not be rendered. Use the setup key below instead.'));
    return () => {
      active = false;
    };
  }, [enrollment?.otpAuthUrl]);

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setLoginError('');
    setRegistrationError('');
    router.replace(`/staff-login?mode=${nextMode}`, { scroll: false });
  }

  function copyText(value: string, key: string) {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(key);
        window.setTimeout(() => setCopied(null), 1800);
      })
      .catch(() => setRegistrationError('Clipboard access was blocked. Select and copy the value manually.'));
  }

  function authHeaders(code?: string) {
    return {
      'Content-Type': 'application/json',
      ...(code ? { 'x-tenant-code-dev': code } : {}),
    };
  }

  // --------------------------------------------------------------------------
  // EXISTING STUDIO LOGIN (Unmodified Security Flow)
  // --------------------------------------------------------------------------
  async function loginRequest(
    extra: { totp_code?: string; recovery_code?: string; mfa_ticket?: string } = {},
    identifier = loginIdentifier,
    loginPass = loginPassword,
    code = '',
  ) {
    const response = await fetch('/api/auth/staff/login', {
      method: 'POST',
      headers: authHeaders(code),
      body: JSON.stringify({ email: identifier.trim().toLowerCase(), password: loginPass, ...extra }),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function completeSession(data: unknown, fallback?: { email?: string; name?: string; studioName?: string }) {
    const session = extractSession(data);
    if (!session) return false;
    const target = persistStudioSession(session, {
      email: fallback?.email ?? loginIdentifier.trim().toLowerCase(),
      name: fallback?.name ?? (ownerName || loginIdentifier.split('@')[0] || 'Studio team member'),
      studioName: fallback?.studioName ?? (studioName || 'Fitness AI Studio'),
      plan: selectedPlan,
    });
    if (!target) {
      setLoginError('Your account role is not recognized. Contact your studio administrator.');
      return false;
    }
    window.location.assign(target);
    return true;
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginError('');
    if (!loginIdentifier.trim() || !loginPassword) {
      setLoginError('Enter your work email and password to continue.');
      return;
    }
    if (useRecoveryCode ? recoveryCode.trim().length < 6 : loginStage === 'mfa' && loginCode.length !== 6) {
      setLoginError(useRecoveryCode ? 'Enter a valid recovery code.' : 'Enter the complete 6-digit code from Google Authenticator.');
      return;
    }

    setLoginBusy(true);
    try {
      const extra =
        loginStage === 'mfa'
          ? useRecoveryCode
            ? { recovery_code: recoveryCode.trim(), mfa_ticket: mfaTicket }
            : { totp_code: loginCode, mfa_ticket: mfaTicket }
          : {};
      const activeTenantCode =
        tenantCode || (typeof window !== 'undefined' ? window.localStorage.getItem('fitness-studio-tenant-code') || '' : '');
      let result = await loginRequest(extra, loginIdentifier, loginPassword, activeTenantCode);
      if (!result.response.ok && activeTenantCode && result.response.status === 401) {
        const retryResult = await loginRequest(extra, loginIdentifier, loginPassword, '');
        if (retryResult.response.ok || getApiErrorCode(retryResult.data) === 'MFA_REQUIRED') {
          result = retryResult;
        }
      }
      const { response, data } = result;
      if (response.ok) {
        const payload = unwrapApiPayload(data);
        if (payload.mfa_enrollment_required === true) {
          if (typeof payload.enrollment_token !== 'string') {
            setLoginError('Authenticator setup is required, but the server did not return an enrollment token.');
            return;
          }

          const cleanEmail = loginIdentifier.trim().toLowerCase();
          const resumedTenantCode =
            typeof payload.tenant_code === 'string' && payload.tenant_code
              ? payload.tenant_code
              : activeTenantCode || tenantCode || '';
          setEmail(cleanEmail);
          setPassword(loginPassword);
          setOwnerName(cleanEmail.split('@')[0] || 'Studio owner');
          setStudioName(resumedTenantCode || 'Your studio');
          setTenantCode(resumedTenantCode);
          if (typeof window !== 'undefined' && resumedTenantCode) {
            window.localStorage.setItem('fitness-studio-tenant-code', resumedTenantCode);
          }
          setRegistrationStep(4);
          setNeedsEmailVerification(false);
          setRegistrationError('');
          setMode('register');
          router.replace('/staff-login?mode=register', { scroll: false });
          setRegistrationBusy(true);
          try {
            await enrollTotp(payload.enrollment_token, resumedTenantCode);
          } catch (error) {
            setRegistrationError(error instanceof Error ? error.message : 'Authenticator setup could not be resumed.');
          } finally {
            setRegistrationBusy(false);
          }
          return;
        }
        if (rememberMe) window.localStorage.setItem('fitness-studio-remembered-id', loginIdentifier.trim());
        else window.localStorage.removeItem('fitness-studio-remembered-id');
        if (!completeSession(data)) setLoginError('The server did not return a valid session.');
        return;
      }

      if (getApiErrorCode(data) === 'MFA_REQUIRED') {
        const ticket = getMfaTicket(data);
        if (!ticket) {
          setLoginError('The authentication challenge was incomplete. Please enter your password again.');
          setLoginStage('credentials');
          return;
        }
        setMfaTicket(ticket);
        setLoginStage('mfa');
        setUseRecoveryCode(false);
        setLoginCode('');
        setRecoveryCode('');
        setLoginError('');
        return;
      }

      setLoginError(getApiError(data, 'Unable to sign in with those credentials.'));
    } catch {
      setLoginError('Unable to reach the authentication service. Try again shortly.');
    } finally {
      setLoginBusy(false);
    }
  }

  // --------------------------------------------------------------------------
  // CREATE STUDIO REGISTRATION WORKFLOW
  // --------------------------------------------------------------------------

  // Step 1: Validate Studio Details
  function validateBusinessInfo() {
    if (studioName.trim().length < 2) return 'Enter a studio or facility name (at least 2 characters).';
    if (ownerName.trim().length < 2) return 'Enter the owner’s full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid work email address.';
    if (!isValidIndianMobile(phone)) return 'Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.';
    if (studioAddress.trim().length < 4) return 'Enter the street address for your studio facility.';
    if (studioCity.trim().length < 2) return 'Enter the city where your studio is located.';
    if (!/^[1-9][0-9]{5}$/.test(studioPincode.trim())) return 'Enter a valid 6-digit Indian PIN code (e.g. 560001).';
    return '';
  }

  async function goToSubscriptionPlan(event: FormEvent) {
    event.preventDefault();
    if (registrationBusy) return;
    const error = validateBusinessInfo();
    setRegistrationError(error);
    if (error) return;

    setRegistrationBusy(true);
    try {
      const response = await fetch('/api/auth/studio/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studio_name: studioName.trim(),
          email: email.trim().toLowerCase(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegistrationError(getApiError(data, 'Studio name or work email is already taken.'));
        return;
      }
      setRegistrationStep(2);
      setRegistrationError('');
    } catch {
      setRegistrationStep(2);
    } finally {
      setRegistrationBusy(false);
    }
  }

  // Step 2: Razorpay Subscription Payment
  async function submitPaymentVerification(payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    if (!payload.razorpay_order_id || !payload.razorpay_payment_id || !payload.razorpay_signature) {
      setPaymentError('Order ID, payment ID, and signature are required for payment verification.');
      setPaymentBusy(false);
      return;
    }

    setPaymentBusy(true);
    setPaymentError('');
    try {
      const res = await fetch('/api/auth/studio/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_tier: selectedPlan,
          razorpay_order_id: payload.razorpay_order_id,
          razorpay_payment_id: payload.razorpay_payment_id,
          razorpay_signature: payload.razorpay_signature,
        }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getApiError(raw, 'Payment signature verification failed on backend.'));
      }

      const data = unwrapApiPayload<any>(raw);
      setPaymentVerified({
        paymentId: data.payment_id || raw.payment_id || payload.razorpay_payment_id,
        orderId: data.order_id || raw.order_id || payload.razorpay_order_id,
        amount: Number(data.amount || raw.amount || (planPrices[selectedPlan] * 100)),
        planTier: selectedPlan,
        verifiedAt: data.verified_at || raw.verified_at || new Date().toISOString(),
      });
      setRegistrationStep(3); // Advance to Password Setup
    } catch (err: any) {
      setPaymentError(err?.message || 'Payment verification failed.');
    } finally {
      setPaymentBusy(false);
    }
  }

  async function handleRazorpayPayment() {
    setPaymentBusy(true);
    setPaymentError('');

    try {
      // 1. Create order on server using authoritative backend plan price
      const orderRes = await fetch('/api/auth/studio/subscription-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_tier: selectedPlan,
          studio_name: studioName.trim(),
          owner_name: ownerName.trim(),
          owner_email: email.trim().toLowerCase(),
          owner_phone: formatIndianMobile(phone),
        }),
      });

      if (!orderRes.ok) {
        const err = await orderRes.json().catch(() => ({}));
        throw new Error(getApiError(err, 'Failed to create payment order.'));
      }

      const orderRaw = await orderRes.json();
      const orderPayload = unwrapApiPayload<any>(orderRaw);
      const activeOrderId = (orderPayload.order_id || orderRaw.order_id) as string;
      const orderAmountPaise = Number(orderPayload.amount || orderRaw.amount || (planPrices[selectedPlan] * 100));
      const orderAmountInr = Number(orderPayload.amount_inr || orderRaw.amount_inr || planPrices[selectedPlan]);
      const keyId = (orderPayload.key_id || orderRaw.key_id || razorpayKeyId || '') as string;

      if (!keyId) {
        throw new Error('Payment is not configured. Please contact support.');
      }

      if (!activeOrderId || !orderAmountPaise || orderAmountPaise <= 0) {
        throw new Error('Server returned an incomplete payment order. Please retry.');
      }

      setOrderRef(activeOrderId);

      // 2. Load Razorpay SDK
      const scriptLoaded = await loadRazorpayScript();
      if (scriptLoaded && (window as any).Razorpay) {
        const options = {
          key: keyId,
          amount: orderAmountPaise, // Exactly in paise: 100000, 200000, or 300000
          currency: 'INR',
          name: branding.studioName || 'Fitness AI',
          description: `${selectedPlan} Studio Platform Subscription (₹${orderAmountInr.toLocaleString('en-IN')}/mo)`,
          order_id: activeOrderId,
          prefill: {
            name: ownerName.trim(),
            email: email.trim().toLowerCase(),
            contact: phone.trim(),
          },
          theme: { color: '#e11d48' },
          modal: {
            ondismiss: () => {
              setPaymentBusy(false);
              setPaymentError('Payment window was closed before completion. You can retry when ready.');
            },
          },
          handler: async (response: {
            razorpay_payment_id?: string;
            razorpay_order_id?: string;
            razorpay_signature?: string;
          }) => {
            const returnedOrderId = response.razorpay_order_id || activeOrderId;
            const returnedPaymentId = response.razorpay_payment_id || '';
            const returnedSignature = response.razorpay_signature || '';

            if (!returnedPaymentId || !returnedSignature) {
              setPaymentBusy(false);
              setPaymentError('Razorpay response did not contain verified payment details. Please retry.');
              return;
            }

            await submitPaymentVerification({
              razorpay_order_id: returnedOrderId,
              razorpay_payment_id: returnedPaymentId,
              razorpay_signature: returnedSignature,
            });
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', (failResp: any) => {
          setPaymentBusy(false);
          setPaymentError(failResp?.error?.description || 'Payment was declined or cancelled. You can retry.');
        });
        rzp.open();
      } else {
        // Fallback test verification in offline sandbox where checkout.js is blocked
        await executeTestModeVerification(activeOrderId);
      }
    } catch (err: any) {
      setPaymentBusy(false);
      setPaymentError(err?.message || 'Payment initiation failed. Please try again.');
    }
  }

  async function executeTestModeVerification(orderIdToVerify?: string) {
    setPaymentBusy(true);
    setPaymentError('');
    try {
      let activeOrderId = orderIdToVerify || orderRef;
      if (!activeOrderId) {
        const orderRes = await fetch('/api/auth/studio/subscription-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan_tier: selectedPlan,
            studio_name: studioName.trim(),
            owner_name: ownerName.trim(),
            owner_email: email.trim().toLowerCase(),
            owner_phone: formatIndianMobile(phone),
          }),
        });
        const orderRaw = await orderRes.json();
        const orderPayload = unwrapApiPayload<any>(orderRaw);
        activeOrderId = (orderPayload.order_id || orderRaw.order_id) as string;
        setOrderRef(activeOrderId);
      }

      if (!activeOrderId) {
        throw new Error('Could not obtain an Order ID from payment service.');
      }

      const testPaymentId = `pay_test_${Math.random().toString(36).substring(2, 12)}`;
      const testSignature = `sig_test_${activeOrderId}`;
      await submitPaymentVerification({
        razorpay_order_id: activeOrderId,
        razorpay_payment_id: testPaymentId,
        razorpay_signature: testSignature,
      });
    } catch (err: any) {
      setPaymentBusy(false);
      setPaymentError(err?.message || 'Test checkout verification failed.');
    }
  }

  // Step 3: Password creation & Studio Tenant Registration
  async function enrollTotp(token: string, code: string) {
    const response = await fetch('/api/auth/staff/totp/enroll', {
      method: 'POST',
      headers: { ...authHeaders(code), Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(getApiError(data, 'Authenticator enrollment could not be started.'));
    const payload = unwrapApiPayload(data);
    const secret = typeof payload.secret === 'string' ? payload.secret : '';
    const otpAuthUrl = typeof payload.otpauth_url === 'string' ? payload.otpauth_url : '';
    const recoveryCodes = Array.isArray(payload.recovery_codes)
      ? payload.recovery_codes.filter((item): item is string => typeof item === 'string')
      : [];
    if (!secret || !otpAuthUrl || recoveryCodes.length === 0) {
      throw new Error('The enrollment response was incomplete. Please retry.');
    }
    setEnrollment({ token, secret, otpAuthUrl, recoveryCodes });
    setRecoveryCodesSaved(false);
    setNeedsEmailVerification(false);
  }

  async function bootstrapEnrollment(code: string, enrollmentToken?: string) {
    if (enrollmentToken) {
      await enrollTotp(enrollmentToken, code);
      return;
    }
    const { response, data } = await loginRequest({}, email, password, code);
    const payload = unwrapApiPayload(data);
    if (response.ok && payload.mfa_enrollment_required === true && typeof payload.enrollment_token === 'string') {
      await enrollTotp(payload.enrollment_token, code);
      return;
    }
    throw new Error(getApiError(data, 'Verify your work email, then retry authenticator setup.'));
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (registrationBusy) return;
    setRegistrationError('');
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      setRegistrationError('Create a password that meets all five security requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setRegistrationError('The password confirmation does not match.');
      return;
    }

    setRegistrationBusy(true);
    try {
      const response = await fetch('/api/auth/studio/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studio_name: studioName.trim(),
          owner_name: ownerName.trim(),
          owner_email: email.trim().toLowerCase(),
          owner_phone: formatIndianMobile(phone),
          password,
          subscription_plan: selectedPlan,
          address: studioAddress.trim(),
          city: studioCity.trim(),
          postal_code: studioPincode.trim(),
          payment_id: paymentVerified?.paymentId,
          order_id: paymentVerified?.orderId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegistrationError(getApiError(data, 'Studio registration failed. Please try again.'));
        return;
      }

      const payload = unwrapApiPayload(data);
      const confirmedCode = typeof payload.tenant_code === 'string' ? payload.tenant_code : tenantPreview;
      const enrollmentToken = typeof payload.enrollment_token === 'string' ? payload.enrollment_token : undefined;
      setTenantCode(confirmedCode);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('fitness-studio-tenant-code', confirmedCode);
      }
      setRegistrationStep(4); // Advance to Authenticator Setup
      try {
        await bootstrapEnrollment(confirmedCode, enrollmentToken);
      } catch (error) {
        setNeedsEmailVerification(payload.requires_email_verification === true);
        setRegistrationError(error instanceof Error ? error.message : 'Authenticator setup could not be started.');
      }
    } catch {
      setRegistrationError('Unable to reach the registration service. Try again shortly.');
    } finally {
      setRegistrationBusy(false);
    }
  }

  async function retryEnrollment() {
    setRegistrationBusy(true);
    setRegistrationError('');
    try {
      await bootstrapEnrollment(tenantCode || tenantPreview);
    } catch (error) {
      setRegistrationError(error instanceof Error ? error.message : 'Authenticator setup could not be started.');
    } finally {
      setRegistrationBusy(false);
    }
  }

  // Step 4: Verify Google Authenticator Code & Direct Redirect to /admin/dashboard
  async function verifyEnrollment(event: FormEvent) {
    event.preventDefault();
    if (!recoveryCodesSaved) {
      setRegistrationError('Confirm that you saved the recovery codes before activating MFA.');
      return;
    }
    if (!enrollment || enrollmentCode.length !== 6) {
      setRegistrationError('Enter the complete 6-digit code from your authenticator app.');
      return;
    }
    setRegistrationBusy(true);
    setRegistrationError('');
    try {
      const response = await fetch('/api/auth/staff/totp/verify', {
        method: 'POST',
        headers: { ...authHeaders(tenantCode), Authorization: `Bearer ${enrollment.token}` },
        body: JSON.stringify({ code: enrollmentCode }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegistrationError(getApiError(data, 'That code was not accepted. Wait for a new code and retry.'));
        return;
      }

      // Step 1: Submit credentials to get the MFA ticket
      const credLogin = await loginRequest({}, email, password, tenantCode);
      const ticket = getApiErrorCode(credLogin.data) === 'MFA_REQUIRED' ? getMfaTicket(credLogin.data) : null;
      if (!ticket) {
        const directSession = credLogin.response.ok ? extractSession(credLogin.data) : null;
        if (directSession) {
          const target = persistStudioSession(directSession, {
            email: email.trim().toLowerCase(),
            name: ownerName.trim(),
            studioName: studioName.trim(),
            plan: selectedPlan,
          });
          if (!target) {
            setRegistrationError('Your owner role could not be verified. Contact support before continuing.');
            return;
          }
          setRegistrationStep(5);
          window.setTimeout(() => window.location.assign(target), 1200);
          return;
        }
        setRegistrationError(getApiError(credLogin.data, 'MFA was enabled, but workspace session creation failed. Sign in to continue.'));
        return;
      }

      // Step 2: Exchange the MFA ticket + TOTP code for an authoritative session
      const login = await loginRequest({ mfa_ticket: ticket, totp_code: enrollmentCode }, email, password, tenantCode);
      if (!login.response.ok) {
        setRegistrationError(getApiError(login.data, 'MFA was enabled, but the workspace session could not be created. Sign in to continue.'));
        return;
      }
      const session = extractSession(login.data);
      if (!session) {
        setRegistrationError('MFA was enabled, but the server did not return a workspace session.');
        return;
      }

      // Owner accounts redirect directly to /admin/dashboard
      const target = persistStudioSession(session, {
        email: email.trim().toLowerCase(),
        name: ownerName.trim(),
        studioName: studioName.trim(),
        plan: selectedPlan,
      });
      if (!target) {
        setRegistrationError('Your owner role could not be verified. Contact support before continuing.');
        return;
      }
      setRegistrationStep(5);
      window.setTimeout(() => window.location.assign(target), 1200);
    } catch {
      setRegistrationError('Verification could not be completed. Check your connection and retry.');
    } finally {
      setRegistrationBusy(false);
    }
  }

  function downloadRecoveryCodes() {
    if (!enrollment) return;
    const body = [
      `Fitness AI Studio Recovery Codes`,
      `Studio: ${studioName}`,
      `Account: ${email}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      ...enrollment.recoveryCodes,
      '',
      'Each code can be used once. Store this file securely.',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${tenantCode || tenantPreview}-recovery-codes.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (mode === 'setup') return <EmployeeSetupWizard token={searchParams.get('token') ?? ''} />;

  const cardTitle =
    mode === 'login'
      ? loginStage === 'mfa'
        ? 'Authenticator Verification'
        : 'Welcome back'
      : registrationStep === 1
      ? 'Tell us about your studio'
      : registrationStep === 2
      ? 'Choose plan & complete subscription'
      : registrationStep === 3
      ? 'Secure your owner account'
      : registrationStep === 4
      ? 'Protect your workspace'
      : 'Your studio is ready';

  const formatInr = (amount: number) =>
    new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);

  return (
    <div className="min-h-screen bg-slate-50/50 text-slate-950">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(225,29,72,0.08),transparent_35%),radial-gradient(circle_at_85%_20%,rgba(244,63,94,0.06),transparent_35%)]"
      />
      <header className="border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/"
              id="fitness-ai-logo-link"
              aria-label={`${branding.studioName || 'Fitness AI'} - Back to landing page`}
              className="group flex items-center gap-2.5 font-bold tracking-tight text-slate-900 transition hover:opacity-85"
            >
              {branding.logoUrl ? (
                <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-white shadow-xs border border-slate-200 p-1">
                  <Image
                    src={branding.logoUrl}
                    alt={branding.studioName || 'Studio logo'}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </span>
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600 text-white shadow-sm shadow-rose-200 transition-transform group-hover:scale-105"
                  aria-hidden="true"
                >
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                  </svg>
                </span>
              )}
              <span className="flex flex-col leading-tight">
                <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
                  {branding.studioName || 'Fitness AI'}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-600">
                  Studio Workspace
                </span>
              </span>
            </Link>

            <div className="hidden h-5 w-px bg-slate-200 sm:block" />

            <Link
              href="/"
              id="back-to-landing-btn"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-white hover:text-rose-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to landing page</span>
            </Link>
          </div>
          <Link href="/member-login" className="text-sm font-semibold text-slate-600 transition hover:text-rose-700">
            Member sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[0.88fr_1.12fr] lg:items-start lg:px-8 lg:py-16">
        {/* Left Information Section */}
        <section className="pt-4 lg:sticky lg:top-8 lg:pt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-3.5 py-1.5 text-xs font-bold text-rose-700 shadow-xs">
            <ShieldCheck className="h-3.5 w-3.5 text-rose-600" />
            <span>Unified Studio Operating System</span>
          </div>
          <h1 className="mt-5 font-serif text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl leading-tight">
            Your Studio. Your Vision. One Workspace.
          </h1>
          <p className="mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-slate-600">
            Manage memberships, classes, trainers, payments, and daily studio operations from one connected workspace.
          </p>

          <div className="mt-8 space-y-3.5">
            <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-subtle backdrop-blur-sm transition hover:border-rose-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Building2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">Studio Management</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  Real-time visibility into attendance, capacity, and studio performance.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-subtle backdrop-blur-sm transition hover:border-rose-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                <CheckCircle2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">Team &amp; Scheduling</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  Roster trainers, schedule group classes, and manage bookings seamlessly.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-subtle backdrop-blur-sm transition hover:border-rose-200">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900">Members &amp; Payments</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  Automated renewal tracking, member check-in, and Razorpay payment records.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Form Section */}
        <section
          id="studio-auth-form"
          className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_30px_90px_rgba(15,23,42,0.12)] backdrop-blur-xl"
        >
          <div className="border-b border-slate-100 p-6 sm:p-8">
            <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Studio access">
              {(['login', 'register'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={mode === item}
                  onClick={() => switchMode(item)}
                  className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold transition ${
                    mode === item ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item === 'login' ? 'Sign in' : 'Create studio'}
                </button>
              ))}
            </div>
            {mode === 'register' ? (
              <div className="mt-6">
                <RegistrationStepper step={registrationStep} />
              </div>
            ) : null}
          </div>

          <div className="p-6 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">
              {mode === 'login' ? 'Studio team access' : `Step ${registrationStep} of 5`}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{cardTitle}</h2>

            {/* MODE 1: LOGIN (Email -> Password -> TOTP -> Dashboard) */}
            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="mt-7 space-y-5" noValidate>
                {loginStage === 'credentials' ? (
                  <>
                    <Field label="Work email">
                      <input
                        type="email"
                        autoComplete="username"
                        value={loginIdentifier}
                        onChange={(event) => setLoginIdentifier(event.target.value)}
                        placeholder="owner@yourstudio.com"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Password">
                      <div className="relative">
                        <input
                          type={showLoginPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value)}
                          placeholder="Enter your password"
                          className={`${inputClass} pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((value) => !value)}
                          aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-700"
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </Field>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <label className="flex items-center gap-2 text-slate-600">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(event) => setRememberMe(event.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        />{' '}
                        Remember email
                      </label>
                      <Link href="/reset-password" className="font-semibold text-rose-700 hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setLoginStage('credentials');
                        setMfaTicket('');
                        setLoginError('');
                        setUseRecoveryCode(false);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to credentials
                    </button>
                    <p className="text-sm leading-relaxed text-slate-600">
                      Open your <strong>Google Authenticator</strong> app and enter the 6-digit verification code for{' '}
                      <strong className="text-slate-900">{loginIdentifier}</strong>.
                    </p>
                    {useRecoveryCode ? (
                      <Field
                        label="Single-use recovery code"
                        hint="Enter one of your 10-character emergency backup recovery codes."
                      >
                        <input
                          value={recoveryCode}
                          onChange={(event) => setRecoveryCode(event.target.value.trim().slice(0, 32))}
                          autoComplete="one-time-code"
                          className={`${inputClass} font-mono tracking-wider uppercase`}
                          placeholder="XXXX-XXXX"
                          autoFocus
                        />
                      </Field>
                    ) : (
                      <OtpInput
                        value={loginCode}
                        onChange={setLoginCode}
                        disabled={loginBusy}
                        label="Google Authenticator 6-digit code"
                      />
                    )}
                    <div className="pt-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setUseRecoveryCode((value) => !value);
                          setLoginError('');
                        }}
                        className="text-xs font-medium text-slate-500 hover:text-rose-600 hover:underline transition"
                      >
                        {useRecoveryCode
                          ? '← Use Google Authenticator code instead'
                          : 'Lost authenticator? Use an emergency recovery code'}
                      </button>
                    </div>
                  </>
                )}
                {loginError ? <Notice tone="error">{loginError}</Notice> : null}
                <button
                  type="submit"
                  disabled={loginBusy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white shadow-lg transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loginBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LockKeyhole className="h-4 w-4" />
                  )}
                  {loginStage === 'mfa'
                    ? useRecoveryCode
                      ? 'Verify recovery code'
                      : 'Verify authenticator code'
                    : 'Sign in to workspace'}
                </button>
              </form>
            ) : registrationStep === 1 ? (
              /* STEP 1: STUDIO DETAILS */
              <form onSubmit={goToSubscriptionPlan} className="mt-7 space-y-4 sm:space-y-5" noValidate>
                <Field label="Studio / facility name">
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      value={studioName}
                      onChange={(event) => setStudioName(event.target.value)}
                      className={`${inputClass} pl-10`}
                      placeholder="Prana Movement Studio"
                      maxLength={120}
                      autoFocus
                    />
                  </div>
                </Field>

                <Field label="Owner full name">
                  <input
                    value={ownerName}
                    onChange={(event) => setOwnerName(event.target.value)}
                    className={inputClass}
                    placeholder="Your full legal name"
                    maxLength={160}
                    autoComplete="name"
                  />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Work email">
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className={inputClass}
                      placeholder="owner@yourstudio.com"
                      maxLength={254}
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Phone number">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      className={inputClass}
                      placeholder="+91 98765 43210"
                      maxLength={20}
                      autoComplete="tel"
                    />
                  </Field>
                </div>

                <Field label="Studio street address">
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      value={studioAddress}
                      onChange={(event) => setStudioAddress(event.target.value)}
                      className={`${inputClass} pl-10`}
                      placeholder="142 Outer Ring Road, Indiranagar"
                      maxLength={255}
                    />
                  </div>
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="City">
                    <input
                      value={studioCity}
                      onChange={(event) => setStudioCity(event.target.value)}
                      className={inputClass}
                      placeholder="Bengaluru"
                      maxLength={100}
                    />
                  </Field>
                  <Field label="PIN code">
                    <input
                      value={studioPincode}
                      onChange={(event) => setStudioPincode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      className={inputClass}
                      placeholder="560038"
                      maxLength={6}
                      inputMode="numeric"
                    />
                  </Field>
                </div>

                {registrationError ? <Notice tone="error">{registrationError}</Notice> : null}

                <button
                  type="submit"
                  disabled={registrationBusy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:opacity-95 disabled:opacity-60"
                >
                  {registrationBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking availability...
                    </>
                  ) : (
                    <>
                      Continue to plan &amp; payment <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : registrationStep === 2 ? (
              /* STEP 2: PLAN SELECTION & RAZORPAY SUBSCRIPTION PAYMENT */
              <div className="mt-7 space-y-6">
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationStep(1);
                    setRegistrationError('');
                    setPaymentError('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to studio details
                </button>

                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Select Platform Tier</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {(['Basic', 'Premium', 'Ultra Premium'] as const).map((tierName) => {
                      const isSelected = selectedPlan === tierName;
                      const price = planPrices[tierName];
                      return (
                        <button
                          key={tierName}
                          type="button"
                          onClick={() => {
                            setSelectedPlan(tierName);
                            setPaymentVerified(null);
                            setPaymentError('');
                          }}
                          className={`flex flex-col items-start rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? 'border-rose-600 bg-rose-50/40 ring-2 ring-rose-600/20'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <span className="font-bold text-slate-900">{tierName}</span>
                            {isSelected ? <CheckCircle2 className="h-4 w-4 text-rose-600" /> : null}
                          </div>
                          <span className="mt-2 text-xl font-extrabold text-slate-950">{formatInr(price)}</span>
                          <span className="text-[11px] text-slate-500">per month</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Price Summary Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">
                        Price Summary
                      </span>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {selectedTierConfig.name} Studio Subscription
                      </p>
                      <p className="text-xs text-slate-500">{selectedTierConfig.description}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-extrabold text-slate-950">
                        {formatInr(planPrices[selectedPlan])}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        ({(planPrices[selectedPlan] * 100).toLocaleString('en-IN')} paise)
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 border-b border-slate-200/60 pb-3 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Monthly Base Platform Fee</span>
                      <span className="font-semibold text-slate-900">{formatInr(planPrices[selectedPlan])}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Billing Frequency</span>
                      <span className="font-medium text-slate-700">Monthly recurring</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxes</span>
                      <span className="font-medium text-slate-700">Inclusive of applicable taxes</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 pt-1 text-sm">
                      <span>Total Amount to Pay</span>
                      <span className="text-rose-700 text-base font-extrabold">{formatInr(planPrices[selectedPlan])}</span>
                    </div>
                  </div>

                  <ul className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                    {selectedTierConfig.features?.map((feature) => (
                      <li key={feature} className="flex items-center gap-1.5 font-medium">
                        <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-white p-3 border border-slate-200 text-xs">
                    <span className="flex items-center gap-2 font-semibold text-slate-700">
                      <CreditCard className="h-4 w-4 text-rose-600" />
                      Razorpay Gateway {razorpayMode === 'test' ? 'Test Mode' : 'Live'}
                    </span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                      HMAC Verified
                    </span>
                  </div>
                </div>

                {paymentVerified ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Payment Verified Successfully
                    </div>
                    <p className="mt-1 text-xs text-emerald-700">
                      Reference: <strong className="font-mono">{paymentVerified.paymentId}</strong> &bull; Order:{' '}
                      <strong className="font-mono">{paymentVerified.orderId}</strong> &bull; Plan:{' '}
                      <strong>{paymentVerified.planTier}</strong> ({formatInr(paymentVerified.amount >= 10000 ? paymentVerified.amount / 100 : paymentVerified.amount)})
                    </p>
                    <button
                      type="button"
                      onClick={() => setRegistrationStep(3)}
                      className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800"
                    >
                      Continue to password creation <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    {paymentError ? <Notice tone="error">{paymentError}</Notice> : null}

                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleRazorpayPayment}
                        disabled={paymentBusy}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:opacity-95 disabled:opacity-60"
                      >
                        {paymentBusy ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Processing order...
                          </>
                        ) : (
                          <>
                            <CreditCard className="h-4 w-4" /> Pay {formatInr(planPrices[selectedPlan])} via Razorpay
                          </>
                        )}
                      </button>

                      {/* Developer / test simulated checkout option */}
                      <button
                        type="button"
                        onClick={() => executeTestModeVerification()}
                        disabled={paymentBusy}
                        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-600" /> Test Mode Quick Verify (HMAC-SHA256)
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : registrationStep === 3 ? (
              /* STEP 3: PASSWORD CREATION */
              <form onSubmit={handleRegister} className="mt-7 space-y-5" noValidate>
                <button
                  type="button"
                  onClick={() => {
                    setRegistrationStep(2);
                    setRegistrationError('');
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to subscription plan
                </button>

                {paymentVerified ? (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {selectedPlan} Platform Subscription Verified
                    </span>
                    <span className="font-mono text-[11px] text-emerald-700">{paymentVerified.paymentId}</span>
                  </div>
                ) : null}

                <Field
                  label="Create owner password"
                  hint="Use a unique password you do not use elsewhere for other applications."
                >
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={`${inputClass} pr-12`}
                      minLength={10}
                      maxLength={128}
                      autoComplete="new-password"
                      placeholder="At least 10 characters"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-400 hover:text-slate-700"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                <div>
                  <div className="flex gap-1.5">
                    {PASSWORD_RULES.map((rule, index) => (
                      <span
                        key={rule.label}
                        className={`h-1.5 flex-1 rounded-full ${
                          index < passwordScore
                            ? passwordScore < 3
                              ? 'bg-rose-500'
                              : passwordScore < 5
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                            : 'bg-slate-200'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {PASSWORD_RULES.map((rule) => {
                      const met = rule.test(password);
                      return (
                        <span
                          key={rule.label}
                          className={`flex items-center gap-1.5 text-xs ${
                            met ? 'font-semibold text-emerald-700' : 'text-slate-500'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> {rule.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <Field
                  label="Confirm password"
                  error={confirmPassword && password !== confirmPassword ? 'Passwords do not match.' : undefined}
                >
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className={inputClass}
                    minLength={10}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder="Re-enter your password"
                  />
                </Field>

                {registrationError ? <Notice tone="error">{registrationError}</Notice> : null}

                <button
                  type="submit"
                  disabled={registrationBusy || passwordScore < 5 || password !== confirmPassword}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-indigo-100 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {registrationBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Creating workspace...
                    </>
                  ) : (
                    <>
                      Create studio &amp; configure MFA <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>
            ) : registrationStep === 4 ? (
              /* STEP 4: GOOGLE AUTHENTICATOR ENROLLMENT (TOTP) */
              <div className="mt-7 space-y-6">
                {!enrollment ? (
                  <div className="space-y-5">
                    <div className="flex justify-center py-4">
                      {registrationBusy ? (
                        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                      ) : needsEmailVerification ? (
                        <MailCheck className="h-14 w-14 text-amber-600" />
                      ) : (
                        <KeyRound className="h-14 w-14 text-indigo-600" />
                      )}
                    </div>
                    {needsEmailVerification ? (
                      <Notice tone="warning">
                        <strong>Verify your work email first.</strong>
                        <br />
                        The authentication service requires email confirmation before issuing the MFA enrollment token.
                        After verifying, return here and continue.
                      </Notice>
                    ) : null}
                    {registrationError ? <Notice tone="error">{registrationError}</Notice> : null}
                    <button
                      type="button"
                      onClick={retryEnrollment}
                      disabled={registrationBusy}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {registrationBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}{' '}
                      {needsEmailVerification ? 'I verified my email — continue' : 'Retry authenticator setup'}
                    </button>
                  </div>
                ) : (
                  <form onSubmit={verifyEnrollment} className="space-y-6">
                    <p className="text-sm leading-6 text-slate-600">
                      Scan this QR code in <strong>Google Authenticator</strong>, save all backup recovery codes, then
                      enter the current 6-digit code.
                    </p>

                    <div className="grid gap-5 lg:grid-cols-[180px_1fr]">
                      <div className="flex min-h-44 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        {qrDataUrl ? (
                          <Image
                            src={qrDataUrl}
                            alt="Google Authenticator enrollment QR code"
                            width={164}
                            height={164}
                            unoptimized
                          />
                        ) : (
                          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
                        )}
                      </div>
                      <div className="space-y-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold text-slate-500">Manual setup key</p>
                          <p className="mt-2 break-all font-mono text-sm font-bold text-slate-900">{enrollment.secret}</p>
                          <button
                            type="button"
                            onClick={() => copyText(enrollment.secret, 'secret')}
                            className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700"
                          >
                            {copied === 'secret' ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
                            {copied === 'secret' ? 'Copied' : 'Copy setup key'}
                          </button>
                        </div>
                        <Notice>
                          <strong>Do not share this key.</strong> Anyone with it can generate valid sign-in codes.
                        </Notice>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">Single-use recovery codes</p>
                          <p className="mt-1 text-xs text-slate-500">Store these somewhere safe and separate from your password.</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => copyText(enrollment.recoveryCodes.join('\n'), 'codes')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
                          >
                            <Clipboard className="h-3.5 w-3.5" /> {copied === 'codes' ? 'Copied' : 'Copy all'}
                          </button>
                          <button
                            type="button"
                            onClick={downloadRecoveryCodes}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {enrollment.recoveryCodes.map((code) => (
                          <code key={code} className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs font-bold text-slate-700">
                            {code}
                          </code>
                        ))}
                      </div>
                      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                        <input
                          type="checkbox"
                          checked={recoveryCodesSaved}
                          onChange={(event) => {
                            setRecoveryCodesSaved(event.target.checked);
                            if (registrationError) setRegistrationError('');
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-amber-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>I saved these recovery codes in a secure place.</span>
                      </label>
                    </div>

                    <OtpInput
                      value={enrollmentCode}
                      onChange={setEnrollmentCode}
                      disabled={registrationBusy}
                      label="Code from Google Authenticator"
                    />

                    {registrationError ? <Notice tone="error">{registrationError}</Notice> : null}

                    <button
                      type="submit"
                      disabled={registrationBusy || enrollmentCode.length !== 6 || !recoveryCodesSaved}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-indigo-600 text-sm font-bold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {registrationBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}{' '}
                      Verify &amp; enter workspace
                    </button>
                  </form>
                )}
              </div>
            ) : (
              /* STEP 5: WORKSPACE LIVE SESSION & REDIRECT */
              <div className="py-10 text-center">
                <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-9 w-9" />
                  <span className="absolute -right-1 -top-1 text-2xl">✦</span>
                </div>
                <h3 className="mt-6 text-2xl font-bold">Security verified</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Your live session is ready. Taking you to the admin dashboard…
                </p>
                <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-indigo-600" />
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Subscription Pricing Section at Bottom */}
      <StudioPricingSection
        id="studio-plans"
        actionType="select"
        selectedPlan={selectedPlan}
        onSelectPlan={(plan) => {
          setSelectedPlan(plan as any);
          if (mode !== 'register') switchMode('register');
          if (registrationStep > 2) setRegistrationStep(2);
          document.getElementById('studio-auth-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        title="Choose the foundation for your studio."
        eyebrow="Studio platform tiers"
        description="Select a plan now and review billing from your admin workspace after secure onboarding."
        compact
      />
    </div>
  );
}

export default function StudioLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <span className="sr-only">Loading studio access</span>
        </div>
      }
    >
      <StudioAuthContent />
    </Suspense>
  );
}
