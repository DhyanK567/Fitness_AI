'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useTenantBranding } from '@/features/settings';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import { formatInr, formatIstDateTime } from '@/lib/localization/india';
import {
  CalendarIcon,
  MapPinIcon,
  UsersIcon,
  CheckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  LockIcon,
  SparklesIcon,
} from '@/components/ui/icons';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

interface StudioEvent {
  id: string;
  title: string;
  category: string;
  startAt: string;
  endAt?: string;
  venue: string;
  organizer: string;
  capacity?: number | null;
  description?: string;
  is_paid?: boolean;
  price?: number;
}

function EventReservationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const branding = useTenantBranding();
  const { user, isAuthenticated, requestOtp, verifyOtp, logout } = useAuthContext();

  const eventId = searchParams?.get('eventId') || '';
  const tenant = searchParams?.get('tenant') || '';

  const [event, setEvent] = useState<StudioEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reservation & Auth State
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [testOtp, setTestOtp] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Confirmed reservation state
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [reservationRef, setReservationRef] = useState<string>('');
  const [reserving, setReserving] = useState(false);
  const [reservationError, setReservationError] = useState<string | null>(null);

  // Fetch verified event details strictly from backend API
  const fetchEventDetails = useCallback(async () => {
    if (!eventId) {
      setLoading(false);
      setError('No event specified. Please select an event from the explore schedule.');
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

      // Query public events list to match the selected event
      const apiBase = resolveClientApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/events/public`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        throw new Error(`Events service returned status ${res.status}`);
      }

      const payload = await res.json();
      let rawList: unknown[] = [];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
        rawList = (payload as any).data;
      }

      const matched = rawList.find((item: any) => String(item?.id) === eventId);
      if (!matched) {
        throw new Error('Selected event was not found or is no longer scheduled.');
      }

      const matchedItem = matched as any;
      setEvent({
        id: String(matchedItem.id),
        title: String(matchedItem.title || matchedItem.name || 'Studio Gathering'),
        category: String(matchedItem.category || 'Workshop'),
        startAt: String(matchedItem.startAt || matchedItem.startDate || matchedItem.date || new Date().toISOString()),
        endAt: matchedItem.endAt ? String(matchedItem.endAt) : undefined,
        venue: String(matchedItem.venue || matchedItem.location || 'Indiranagar Sanctuary'),
        organizer: String(matchedItem.organizer || matchedItem.instructor || 'Studio Master'),
        capacity: typeof matchedItem.capacity === 'number' ? matchedItem.capacity : null,
        description: matchedItem.description,
        is_paid: Boolean(matchedItem.is_paid || matchedItem.isPaid),
        price: typeof matchedItem.price === 'number' ? matchedItem.price : 0,
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to retrieve event information from studio backend.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventDetails();
  }, [fetchEventDetails]);

  // Handle OTP request
  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (authMode === 'register' && !fullName.trim()) {
      setAuthError('Please enter your full name for registration.');
      return;
    }

    setAuthBusy(true);
    const res = await requestOtp(phone, authMode);
    setAuthBusy(false);

    if (res.success && res.challenge_id) {
      setChallengeId(res.challenge_id);
      setTestOtp(res.test_otp || null);
      setStep('otp');
    } else {
      setAuthError(res.message || 'Unable to send verification code. Please check your number.');
    }
  };

  // Handle OTP verification
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!otpCode || otpCode.length !== 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    setAuthBusy(true);
    const res = await verifyOtp(
      challengeId,
      otpCode,
      authMode === 'register' ? fullName : undefined,
      authMode === 'register' && email ? email : undefined,
    );
    setAuthBusy(false);

    if (!res.success) {
      setAuthError(res.message || 'Verification failed. Please ensure the code is correct.');
    }
  };

  // Handle Free Event Reservation Confirmation
  const handleConfirmReservation = async () => {
    if (!event) return;
    setReserving(true);
    setReservationError(null);

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

      // Reuse backend event registration endpoint
      const res = await fetch(`${API_BASE_URL}/api/v1/events/public/${encodeURIComponent(event.id)}/registrations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          registrant_name: user?.name || fullName || 'Studio Member',
          registrant_phone: user?.phone || phone || '+919876543210',
          registrant_email: user?.email || email || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData?.message || errorData?.error || 'Unable to reserve spot. Capacity may be exhausted.');
      }

      const data = await res.json();
      setReservationRef(data.registration_id || `REG-${Date.now().toString().slice(-6)}`);
      setIsConfirmed(true);
    } catch (err: any) {
      setReservationError(err?.message || 'Event reservation failed. Please verify availability.');
    } finally {
      setReserving(false);
    }
  };

  const backUrl = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-200/80 bg-white/95 px-4 py-4 sm:px-8 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-950 transition-colors"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            <span>Back to Member Explore</span>
          </Link>

          <Link href="/" className="font-serif text-lg font-bold tracking-tight text-slate-900 hover:text-rose-900 transition-colors">
            {branding.studioName || 'Fitness AI'}
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
                Loading studio event details...
              </p>
            </div>
          </div>
        ) : error || !event ? (
          <div className="mx-auto max-w-lg rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
            <p className="text-sm font-semibold text-rose-900">{error || 'Event not found'}</p>
            <Link
              href={backUrl}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-900 transition-colors"
            >
              Return to Member Explore
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-12 items-start">
            {/* Left Column: Event Details Card */}
            <div className="lg:col-span-6 rounded-[2.25rem] border border-slate-200/90 bg-white p-7 sm:p-9 shadow-[0_10px_35px_rgba(15,23,42,0.06)]">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-block rounded-full bg-rose-50 border border-rose-200/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-900">
                  {event.category}
                </span>
                <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  event.is_paid && event.price && event.price > 0
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}>
                  {event.is_paid && event.price && event.price > 0 ? `Ticket: ${formatInr(event.price)}` : 'Free Admission'}
                </span>
              </div>

              <h1 className="mt-4 font-serif text-3xl sm:text-4xl font-bold tracking-tight text-slate-950">
                {event.title}
              </h1>

              {event.description && (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  {event.description}
                </p>
              )}

              {/* Event Metadata */}
              <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Date &amp; Time (IST)</span>
                    <span className="block text-base font-bold text-slate-950 mt-0.5">
                      {formatIstDateTime(event.startAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <MapPinIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Venue</span>
                    <span className="block text-sm font-semibold text-slate-800 mt-0.5">{event.venue}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <UsersIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                  <div>
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">Host &amp; Availability</span>
                    <span className="block text-sm text-slate-700 mt-0.5">
                      Led by <strong className="text-slate-950 font-semibold">{event.organizer}</strong>
                      {typeof event.capacity === 'number' && event.capacity > 0 && (
                        <span> &bull; Limited to {event.capacity} seats</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-8 rounded-2xl bg-[#FAF8F5] border border-slate-200/80 p-4.5 flex items-center gap-3">
                <ShieldCheckIcon className="h-5 w-5 text-emerald-700 shrink-0" />
                <p className="text-xs text-slate-600">
                  <strong className="text-slate-900 font-semibold">Confirmed Spot Guarantee:</strong> Reservations are directly recorded in the studio schedule database.
                </p>
              </div>
            </div>

            {/* Right Column: Reservation / Authentication / Confirmed Screen */}
            <div className="lg:col-span-6 rounded-[2.25rem] border border-slate-200/90 bg-white p-7 sm:p-9 shadow-[0_10px_35px_rgba(15,23,42,0.06)]">
              {isConfirmed ? (
                /* Confirmed Reservation Screen */
                <div className="text-center py-4 space-y-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 border-2 border-emerald-200">
                    <CheckIcon className="h-9 w-9 stroke-[3]" />
                  </div>

                  <div>
                    <span className="inline-block rounded-full bg-emerald-100 text-emerald-900 px-3.5 py-1 text-xs font-bold uppercase tracking-wider mb-2">
                      Spot Reserved Successfully
                    </span>
                    <h2 className="font-serif text-3xl font-bold text-slate-950">You&apos;re On the Guest List!</h2>
                    <p className="mt-2 text-xs text-slate-600 max-w-md mx-auto">
                      Your spot for <strong>{event.title}</strong> has been confirmed and registered in studio records.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-[#FAF8F5] p-5 text-left space-y-2.5 text-xs text-slate-700">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Reservation Reference</span>
                      <strong className="font-mono text-slate-900">{reservationRef}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Registrant</span>
                      <strong className="text-slate-900">{user?.name || fullName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Scheduled Date</span>
                      <strong className="text-slate-900">{formatIstDateTime(event.startAt)}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Venue</span>
                      <strong className="text-slate-900">{event.venue}</strong>
                    </div>
                  </div>

                  <div className="pt-2 space-y-3">
                    <Link
                      href="/member/home"
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-md hover:bg-rose-900 transition-all"
                    >
                      <span>Go to Member Dashboard</span>
                      <ArrowRightIcon className="h-3.5 w-3.5" />
                    </Link>

                    <Link
                      href={backUrl}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Return to Member Explore
                    </Link>
                  </div>
                </div>
              ) : isAuthenticated && user ? (
                /* Authenticated: Ready to Reserve */
                <div className="space-y-6">
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Confirmed Member Identity</p>
                    <h3 className="mt-1 font-serif text-2xl font-bold text-slate-950">{user.name}</h3>
                    <p className="mt-1 text-xs text-slate-600">{user.phone || user.email || 'Registered Member Account'}</p>
                    <p className="mt-2 text-[11px] font-semibold text-emerald-700">
                      Member ID: {user.memberId} &bull; Ready for spot reservation
                    </p>
                  </div>

                  {event.is_paid && event.price && event.price > 0 ? (
                    /* Ticketed / Paid Event */
                    <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-5 text-xs text-amber-950 space-y-3">
                      <div className="flex items-center gap-2 text-amber-900 font-bold uppercase tracking-wider text-[11px]">
                        <LockIcon className="h-4 w-4" />
                        <span>Ticketed Event &bull; Payment Integration Pending</span>
                      </div>
                      <p className="leading-relaxed text-amber-900/90">
                        This special workshop requires a ticket fee of <strong>{formatInr(event.price)}</strong>. Online automated payment capture via Razorpay is awaiting live merchant gateway credentials.
                      </p>
                      <p className="text-[11px] text-amber-800 font-medium">
                        Paid event reservations require verified payment before confirmation. You may reserve your ticket directly at the studio reception.
                      </p>
                      <div className="pt-2 flex flex-wrap gap-2">
                        <Link
                          href="/member/home"
                          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition"
                        >
                          Go to Member Dashboard
                        </Link>
                        <Link
                          href={backUrl}
                          className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Back to Explore
                        </Link>
                      </div>
                    </div>
                  ) : (
                    /* Free Event: Direct Confirmation Available */
                    <div className="space-y-4">
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Admission to <strong>{event.title}</strong> is complimentary for studio members. Click below to lock in your reservation.
                      </p>

                      {reservationError && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
                          {reservationError}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleConfirmReservation}
                        disabled={reserving}
                        className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-rose-950/15 hover:bg-rose-900 transition-all active:scale-98 disabled:opacity-60 cursor-pointer"
                      >
                        {reserving ? (
                          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <>
                            <span>Confirm My Spot</span>
                            <ArrowRightIcon className="h-4 w-4" />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => logout()}
                        className="w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors py-1"
                      >
                        Switch member account
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Unauthenticated: Registration & Sign In Tabs */
                <div>
                  <div className="flex border-b border-slate-100 pb-4 mb-6">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setStep('details');
                        setAuthError(null);
                      }}
                      className={`flex-1 text-center pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-[18px] ${
                        authMode === 'register'
                          ? 'border-rose-800 text-rose-900 font-extrabold'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      New to Studio
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setStep('details');
                        setAuthError(null);
                      }}
                      className={`flex-1 text-center pb-2 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 -mb-[18px] ${
                        authMode === 'login'
                          ? 'border-rose-800 text-rose-900 font-extrabold'
                          : 'border-transparent text-slate-400 hover:text-slate-700'
                      }`}
                    >
                      Existing Member
                    </button>
                  </div>

                  <h2 className="font-serif text-2xl font-bold text-slate-950">
                    {authMode === 'register' ? 'Register to Reserve Spot' : 'Member Sign In'}
                  </h2>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                    {authMode === 'register'
                      ? 'Create your studio sanctuary profile to reserve your place in this session.'
                      : 'Sign in with your registered phone number to complete your reservation.'}
                  </p>

                  {authError && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs text-rose-900">
                      {authError}
                    </div>
                  )}

                  {step === 'details' ? (
                    <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
                      {authMode === 'register' && (
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
                      )}

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
                          A 6-digit verification code will be sent to this phone.
                        </p>
                      </div>

                      {authMode === 'register' && (
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                            Email Address <span className="text-slate-400 font-normal">(Optional for confirmation ticket)</span>
                          </label>
                          <input
                            type="email"
                            placeholder="member@example.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                          />
                        </div>
                      )}

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={authBusy}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-rose-800 px-6 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-rose-950/15 hover:bg-rose-900 transition-all disabled:opacity-60"
                        >
                          {authBusy ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <span>Send Verification Code</span>
                          )}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Step 2: OTP Verification */
                    <form onSubmit={handleVerifyOtp} className="mt-6 space-y-5">
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5">
                        <p className="text-xs text-slate-600">
                          Enter the 6-digit code sent to <strong className="text-slate-900">{phone}</strong>
                        </p>
                        {testOtp && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                            <span>Dev Test Code: {testOtp}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                          Verification Code (OTP)
                        </label>
                        <input
                          type="text"
                          required
                          maxLength={6}
                          placeholder="123456"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          className="w-full tracking-widest text-center rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xl font-bold text-slate-900 focus:border-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-800"
                        />
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setStep('details')}
                          className="flex-1 rounded-full border border-slate-200 py-3 text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          Change Number
                        </button>
                        <button
                          type="submit"
                          disabled={authBusy}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-rose-800 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-rose-950/15 hover:bg-rose-900 transition-all disabled:opacity-60"
                        >
                          {authBusy ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <span>Verify &amp; Continue</span>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function EventReservationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
        </div>
      }
    >
      <EventReservationContent />
    </Suspense>
  );
}
