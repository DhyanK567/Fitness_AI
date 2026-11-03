'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  EyeIcon,
  EyeOffIcon,
  SparklesIcon,
  CalendarIcon,
  ShieldCheckIcon,
  XIcon,
} from '@/components/ui/icons';
import { useAuthContext, extractErrorMessage } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';

function MemberLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    loginWithEmailPassword,
    requestOtp,
    completeMemberAccount,
    isAuthenticated,
    user,
  } = useAuthContext();
  const { addToast } = useToast();

  // Selected item context preservation
  const planId = searchParams?.get('planId') || '';
  const planName = searchParams?.get('planName') || '';
  const eventId = searchParams?.get('eventId') || '';
  const eventTitle = searchParams?.get('eventTitle') || '';
  const tenant = searchParams?.get('tenant') || '';
  const rawReturnUrl = searchParams?.get('returnUrl') || searchParams?.get('redirect') || '';

  // Mode: 'login' | 'complete_account'
  const [viewMode, setViewMode] = useState<'login' | 'complete_account'>('login');

  // Simple Member Login State (Email + Password only)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  // Forgot Password Modal State
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotNotice, setForgotNotice] = useState<{ type: 'info' | 'error' | 'success'; message: string } | null>(null);

  // Existing Paid Member Account Completion State
  const [completeStep, setCompleteStep] = useState<'request_otp' | 'verify_and_set'>('request_otp');
  const [completePhone, setCompletePhone] = useState('');
  const [completeChallengeId, setCompleteChallengeId] = useState('');
  const [completeOtp, setCompleteOtp] = useState('');
  const [completeTestOtp, setCompleteTestOtp] = useState<string | null>(null);
  const [completeEmail, setCompleteEmail] = useState('');
  const [completePassword, setCompletePassword] = useState('');
  const [completeConfirmPassword, setCompleteConfirmPassword] = useState('');
  const [completeShowPassword, setCompleteShowPassword] = useState(false);
  const [completeCooldown, setCompleteCooldown] = useState(0);
  const [completeError, setCompleteError] = useState('');
  const [completeBusy, setCompleteBusy] = useState(false);

  // Determine back URL to Member Experience
  const determineBackUrl = (): string => {
    const params = new URLSearchParams();
    if (tenant) params.set('tenant', tenant);
    if (planId) params.set('planId', planId);
    if (planName) params.set('planName', planName);
    if (eventId) params.set('eventId', eventId);
    if (eventTitle) params.set('eventTitle', eventTitle);
    const qs = params.toString();
    return qs ? `/member-explore?${qs}` : '/member-explore';
  };

  // Determine redirection after successful authentication
  const determineSuccessRedirect = (): string => {
    if (planId) {
      const tenantParam = tenant ? `&tenant=${encodeURIComponent(tenant)}` : '';
      return `/checkout?planId=${encodeURIComponent(planId)}${tenantParam}`;
    }
    if (eventId) {
      const tenantParam = tenant ? `&tenant=${encodeURIComponent(tenant)}` : '';
      return `/member/events?eventId=${encodeURIComponent(eventId)}${tenantParam}`;
    }
    if (rawReturnUrl && rawReturnUrl.startsWith('/') && !rawReturnUrl.startsWith('//')) {
      return rawReturnUrl;
    }
    const tenantParam = tenant ? `tenant=${encodeURIComponent(tenant)}` : '';
    return tenantParam ? `/portal?tab=home&${tenantParam}` : '/portal?tab=home';
  };

  // Cooldown timer effect for account completion
  useEffect(() => {
    if (completeCooldown <= 0) return;
    const timer = setInterval(() => {
      setCompleteCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [completeCooldown]);

  // If already authenticated, redirect straight to destination
  useEffect(() => {
    if (isAuthenticated && user) {
      router.replace(determineSuccessRedirect());
    }
  }, [isAuthenticated, user]);

  // ==========================================
  // SIMPLE MEMBER LOGIN HANDLER (EMAIL + PASSWORD)
  // ==========================================
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setLoginError('Please enter a valid registered email address.');
      return;
    }
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoginBusy(true);
    const res = await loginWithEmailPassword(cleanEmail, password);
    setLoginBusy(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Welcome Back',
        message: 'Signed in successfully. Opening your Member Sanctuary...',
      });
      router.push(determineSuccessRedirect());
    } else {
      const msg = typeof res.message === 'string' ? res.message : extractErrorMessage(res.message, 'Invalid email or password.');
      setLoginError(msg);
    }
  }

  // ==========================================
  // FORGOT PASSWORD HANDLER
  // ==========================================
  async function handleForgotPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setForgotNotice(null);

    const cleanEmail = forgotEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setForgotNotice({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    setForgotBusy(true);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const res = await fetch(`${apiBaseUrl}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: cleanEmail }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const rawMsg = extractErrorMessage(errorData, '');
        if (res.status === 503 || rawMsg.toLowerCase().includes('not configured') || rawMsg.toLowerCase().includes('email delivery')) {
          setForgotNotice({
            type: 'info',
            message:
              'Email Service Notice: Automated password reset via email requires an active email service provider (SMTP or Resend). Please contact the studio front desk or support administrator to reset your password.',
          });
        } else {
          setForgotNotice({
            type: 'error',
            message: rawMsg || 'Unable to process password reset request at this time.',
          });
        }
      } else {
        setForgotNotice({
          type: 'success',
          message:
            'If an account is associated with this email address, password reset instructions have been dispatched. Please check your inbox.',
        });
      }
    } catch {
      setForgotNotice({
        type: 'info',
        message:
          'Email Service Notice: Automated password reset via email requires an active email service provider (SMTP or Resend). Please contact the studio front desk or support administrator to reset your password.',
      });
    } finally {
      setForgotBusy(false);
    }
  }

  // ==========================================
  // EXISTING PAID MEMBER: ACCOUNT COMPLETION (MOBILE OTP -> SET PASSWORD)
  // ==========================================
  async function handleRequestCompleteOtp(e: React.FormEvent) {
    e.preventDefault();
    setCompleteError('');

    const cleanPhone = completePhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setCompleteError('Please enter the 10-digit mobile number used when purchasing your membership.');
      return;
    }

    setCompleteBusy(true);
    const res = await requestOtp(cleanPhone, 'complete_account');
    setCompleteBusy(false);

    if (res.success && res.challenge_id) {
      setCompleteChallengeId(res.challenge_id);
      setCompleteTestOtp(res.test_otp || null);
      setCompleteStep('verify_and_set');
      addToast({
        type: 'info',
        title: 'Verification Code Dispatched',
        message: `Verification code sent to +91 ${cleanPhone.slice(-10)}.`,
      });
    } else {
      const msg = typeof res.message === 'string' ? res.message : extractErrorMessage(res.message, 'Failed to dispatch verification code.');
      const retrySec = (res as any)?.retry_after;
      if (typeof retrySec === 'number' && retrySec > 0) {
        setCompleteCooldown(retrySec);
      }
      setCompleteError(msg);
    }
  }

  async function handleCompleteAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCompleteError('');

    if (!completeOtp || completeOtp.length !== 6) {
      setCompleteError('Please enter the 6-digit verification code.');
      return;
    }

    const cleanEmail = completeEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setCompleteError('Please enter a valid email address for your member login.');
      return;
    }

    if (!completePassword || completePassword.length < 8) {
      setCompleteError('Password must be at least 8 characters long.');
      return;
    }

    if (completePassword !== completeConfirmPassword) {
      setCompleteError('Passwords do not match. Please re-enter.');
      return;
    }

    setCompleteBusy(true);
    const res = await completeMemberAccount({
      challenge_id: completeChallengeId,
      otp: completeOtp,
      email: cleanEmail,
      password: completePassword,
      confirmPassword: completeConfirmPassword,
    });
    setCompleteBusy(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Account Setup Complete',
        message: 'Your credentials have been saved and your membership pass restored!',
      });
      router.push(determineSuccessRedirect());
    } else {
      const msg = typeof res.message === 'string' ? res.message : extractErrorMessage(res.message, 'Account completion failed.');
      setCompleteError(msg);
    }
  }

  const backUrl = determineBackUrl();

  return (
    <main className="min-h-screen bg-[#FCFAF8] dark:bg-slate-950 px-4 py-8 text-slate-900 dark:text-slate-100 sm:px-8 font-sans selection:bg-[#E11D48] selection:text-white transition-colors">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-10 lg:grid-cols-[1fr_470px]">
        {/* Left Column: Brand & Editorial Value Proposition */}
        <section className="mx-auto max-w-xl">
          <Link
            href={backUrl}
            className="text-sm font-bold text-slate-900 dark:text-white hover:text-rose-700 dark:hover:text-rose-400 transition inline-flex items-center gap-2"
          >
            &larr; Back to Member Experience
          </Link>

          <p className="mt-12 text-xs font-bold uppercase tracking-[.2em] text-[#E11D48] dark:text-rose-400">
            MEMBER SANCTUARY
          </p>

          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight sm:text-5xl text-slate-900 dark:text-white">
            A calmer way to practice, move &amp; thrive.
          </h1>

          <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 dark:text-slate-400">
            Sign in to access your classes, schedule, passes, and studio community from one welcoming sanctuary.
          </p>

          {/* 3 Pastel Feature Cards */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: 'Passes & plans',
                icon: '♡',
                color: 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/50 text-rose-700 dark:text-rose-300',
              },
              {
                label: 'Classes & bookings',
                icon: '✻',
                color: 'bg-sky-50 dark:bg-sky-950/40 border-sky-100 dark:border-sky-900/50 text-sky-700 dark:text-sky-300',
              },
              {
                label: 'Community & practice',
                icon: '◌',
                color: 'bg-violet-50 dark:bg-violet-950/40 border-violet-100 dark:border-violet-900/50 text-violet-700 dark:text-violet-300',
              },
            ].map((item) => (
              <div
                key={item.label}
                className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 ${item.color}`}
              >
                <span className="text-xl block">{item.icon}</span>
                <p className="mt-3 text-sm font-semibold">{item.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Right Column: Clean Elevated Login Card */}
        <section className="rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl shadow-slate-200/60 dark:shadow-slate-950/60 sm:p-8 relative">
          {/* Selected Pass Context Notification */}
          {planName && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-rose-900">
                <SparklesIcon className="h-4 w-4 text-rose-700 shrink-0" />
                <span>Selected Membership Pass</span>
              </div>
              <p className="mt-1 font-serif text-sm font-bold text-slate-900">{planName}</p>
              <p className="mt-0.5 text-slate-600">
                Sign in to your member account to review and confirm your pass selection.
              </p>
            </div>
          )}

          {/* Selected Event Context Notification */}
          {eventTitle && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-rose-900">
                <CalendarIcon className="h-4 w-4 text-rose-700 shrink-0" />
                <span>Selected Studio Event</span>
              </div>
              <p className="mt-1 font-serif text-sm font-bold text-slate-900">{eventTitle}</p>
              <p className="mt-0.5 text-slate-600">
                Sign in to reserve your attendance for this workshop.
              </p>
            </div>
          )}

          {viewMode === 'login' ? (
            /* ========================================================= */
            /* 1. SIMPLE MEMBER LOGIN VIEW (EMAIL + PASSWORD ONLY)       */
            /* ========================================================= */
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#E11D48] dark:text-rose-400">
                MEMBER ACCESS
              </p>

              <h2 className="mt-2 font-serif text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Welcome to your portal
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                Sign in with your email address and password to access your member dashboard.
              </p>

              <form noValidate onSubmit={handleLogin} className="mt-6 space-y-4.5">
                <div>
                  <label htmlFor="member-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Email Address
                  </label>
                  <input
                    id="member-email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (loginError) setLoginError('');
                    }}
                    placeholder="member@example.com"
                    className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-sm outline-none transition bg-slate-50/70 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:border-[#E11D48] focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="member-password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotEmail(email);
                        setForgotNotice(null);
                        setForgotModalOpen(true);
                      }}
                      className="text-xs font-semibold text-[#E11D48] dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="member-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder="Enter your password"
                      className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 pl-3.5 pr-11 text-sm outline-none transition bg-slate-50/70 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:border-[#E11D48] focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40 text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-800 transition cursor-pointer"
                    >
                      {showPassword ? <EyeOffIcon size="sm" /> : <EyeIcon size="sm" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-3 text-xs font-medium leading-5 text-rose-800 dark:text-rose-300 space-y-1.5">
                    <p>{loginError}</p>
                    {loginError.toLowerCase().includes('set your password') && (
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('complete_account');
                          setLoginError('');
                        }}
                        className="font-bold underline text-rose-900 dark:text-rose-200 hover:text-rose-950 cursor-pointer"
                      >
                        Click here to set your password &rarr;
                      </button>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginBusy}
                  className="h-12 w-full rounded-full bg-[#E11D48] text-sm font-bold text-white shadow-sm transition hover:bg-[#BE123C] active:scale-[0.98] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {loginBusy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Signing In…</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>

              {/* Secure Account Completion Callout for Existing Paid OTP Members */}
              <div className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-950/30 p-4 text-xs">
                <p className="font-bold text-amber-900 dark:text-amber-200">
                  Paid member without a password?
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-400 leading-relaxed">
                  If you purchased your membership using mobile verification earlier, complete your password setup once to access your existing membership.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('complete_account');
                    setCompleteStep('request_otp');
                    setCompleteError('');
                  }}
                  className="mt-2.5 inline-flex items-center gap-1.5 font-bold text-[#E11D48] dark:text-rose-400 hover:underline cursor-pointer"
                >
                  <span>Set Password &amp; Complete Account Setup &rarr;</span>
                </button>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* 2. EXISTING PAID MEMBER ACCOUNT COMPLETION WORKFLOW       */
            /* ========================================================= */
            <div>
              <button
                type="button"
                onClick={() => {
                  setViewMode('login');
                  setCompleteError('');
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-3 inline-flex items-center gap-1"
              >
                &larr; Back to Member Sign In
              </button>

              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#E11D48] dark:text-rose-400">
                ACCOUNT COMPLETION
              </p>

              <h2 className="mt-2 font-serif text-2xl font-bold text-slate-900 dark:text-white">
                Set Your Account Password
              </h2>

              <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Verify your registered mobile number to attach an email and password to your existing paid membership pass.
              </p>

              {completeStep === 'request_otp' ? (
                /* Step 1: Verify Mobile Number */
                <form noValidate onSubmit={handleRequestCompleteOtp} className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="complete-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Purchased Mobile Number
                    </label>
                    <div className="relative mt-1.5 flex items-center">
                      <span className="absolute left-3.5 text-xs font-bold text-slate-500 select-none">
                        +91
                      </span>
                      <input
                        id="complete-phone"
                        type="tel"
                        required
                        maxLength={10}
                        value={completePhone}
                        onChange={(e) => {
                          setCompletePhone(e.target.value);
                          if (completeError) setCompleteError('');
                        }}
                        placeholder="98765 43210"
                        className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 pl-12 pr-3 text-sm outline-none transition bg-slate-50/70 dark:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:border-[#E11D48] focus:ring-4 focus:ring-rose-100 dark:focus:ring-rose-950/40 text-slate-900 dark:text-white"
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Enter the 10-digit number used during your Razorpay pass purchase.
                    </p>
                  </div>

                  {completeError && (
                    <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-300">
                      {completeError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={completeBusy || completeCooldown > 0}
                    className="h-12 w-full rounded-full bg-[#E11D48] text-sm font-bold text-white shadow-sm transition hover:bg-[#BE123C] active:scale-[0.98] disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {completeBusy ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Sending Verification Code…</span>
                      </>
                    ) : completeCooldown > 0 ? (
                      <span>Resend in {completeCooldown}s</span>
                    ) : (
                      <span>Send Verification Code</span>
                    )}
                  </button>
                </form>
              ) : (
                /* Step 2: Enter OTP, Email, and Password */
                <form noValidate onSubmit={handleCompleteAccountSubmit} className="mt-5 space-y-4">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-xs">
                    <p className="text-slate-600 dark:text-slate-400">
                      Code sent to <strong className="text-slate-900 dark:text-white">+91 {completePhone.replace(/\D/g, '').slice(-10)}</strong>
                    </p>
                    {completeTestOtp && (
                      <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:text-amber-200">
                        <ShieldCheckIcon className="w-3.5 h-3.5" />
                        <span>Development Code: {completeTestOtp}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label htmlFor="complete-otp" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      6-Digit Verification Code
                    </label>
                    <input
                      id="complete-otp"
                      type="text"
                      maxLength={6}
                      required
                      value={completeOtp}
                      onChange={(e) => {
                        setCompleteOtp(e.target.value.replace(/\D/g, ''));
                        if (completeError) setCompleteError('');
                      }}
                      placeholder="123456"
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 font-mono text-center text-lg tracking-widest outline-none bg-white dark:bg-slate-800 focus:border-[#E11D48] text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="complete-email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Email Address (for member login)
                    </label>
                    <input
                      id="complete-email"
                      type="email"
                      required
                      value={completeEmail}
                      onChange={(e) => {
                        setCompleteEmail(e.target.value);
                        if (completeError) setCompleteError('');
                      }}
                      placeholder="member@example.com"
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm outline-none bg-white dark:bg-slate-800 focus:border-[#E11D48] text-slate-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="complete-pw" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        New Password
                      </label>
                      <div className="relative mt-1">
                        <input
                          id="complete-pw"
                          type={completeShowPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={completePassword}
                          onChange={(e) => {
                            setCompletePassword(e.target.value);
                            if (completeError) setCompleteError('');
                          }}
                          placeholder="Min 8 chars"
                          className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 pl-3 pr-9 text-sm outline-none bg-white dark:bg-slate-800 focus:border-[#E11D48] text-slate-900 dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={() => setCompleteShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-700"
                        >
                          {completeShowPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="complete-confirm-pw" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Confirm Password
                      </label>
                      <input
                        id="complete-confirm-pw"
                        type={completeShowPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        value={completeConfirmPassword}
                        onChange={(e) => {
                          setCompleteConfirmPassword(e.target.value);
                          if (completeError) setCompleteError('');
                        }}
                        placeholder="Re-enter password"
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm outline-none bg-white dark:bg-slate-800 focus:border-[#E11D48] text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  {completeError && (
                    <div role="alert" className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs font-medium text-rose-800 dark:text-rose-300">
                      {completeError}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCompleteStep('request_otp');
                        setCompleteError('');
                      }}
                      className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Change Number
                    </button>
                    <button
                      type="submit"
                      disabled={completeBusy}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#E11D48] py-3 text-xs font-bold uppercase tracking-wider text-white shadow-sm hover:bg-[#BE123C] transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {completeBusy ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <span>Save &amp; Enter Portal</span>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Bottom links */}
          <p className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            Need to register a new membership?{' '}
            <Link
              href={determineBackUrl()}
              className="font-bold text-[#E11D48] dark:text-rose-400 hover:underline"
            >
              Browse Plans
            </Link>
            <span className="mx-2 text-slate-300 dark:text-slate-700">&bull;</span>
            <Link
              href="/staff-login"
              className="font-medium text-slate-600 dark:text-slate-400 hover:text-[#E11D48] dark:hover:text-rose-400 hover:underline"
            >
              Staff Portal
            </Link>
          </p>
        </section>
      </div>

      {/* Forgot Password Modal */}
      {forgotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-6 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setForgotModalOpen(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              <XIcon className="h-5 w-5" />
            </button>

            <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-white">
              Reset Your Password
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Enter your registered email address to receive password reset instructions.
            </p>

            <form onSubmit={handleForgotPasswordSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="member@example.com"
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-sm outline-none bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:bg-white focus:border-[#E11D48]"
                />
              </div>

              {forgotNotice && (
                <div
                  className={`rounded-xl p-3.5 text-xs leading-relaxed ${
                    forgotNotice.type === 'error'
                      ? 'border border-rose-200 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200'
                      : forgotNotice.type === 'info'
                      ? 'border border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200'
                  }`}
                >
                  {forgotNotice.message}
                </div>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setForgotModalOpen(false)}
                  className="flex-1 rounded-full border border-slate-200 dark:border-slate-700 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="flex-1 inline-flex items-center justify-center rounded-full bg-[#E11D48] py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#BE123C] disabled:opacity-60 cursor-pointer"
                >
                  {forgotBusy ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <span>Send Instructions</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export default function MemberLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#FCFAF8]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        </div>
      }
    >
      <MemberLoginForm />
    </Suspense>
  );
}
