'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ApiClient, type FrontDeskOverview } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  GridIcon,
  LayersIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Loader2, Sparkles, UserCheck, X, XCircle } from 'lucide-react';
import { getStudioSession } from '@/lib/auth/studio-session';
import { currentStaffStudio } from '@/app/admin/_components/AdminDataProvider';
import { FloatingAIChat } from '@/components/chat/FloatingAIChat';
import { useAIChat } from '@/features/ai/hooks/useAIChat';

function localDateIso(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
}

function normalizeDateIso(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const match = val.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(val);
  }
  return '';
}

function formatFullDate(iso: unknown): string {
  const clean = normalizeDateIso(iso) || localDateIso();
  const d = new Date(`${clean}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function formatTime12h(time?: string | null): string {
  if (!time) return 'TBD';
  const [hStr = '0', mStr = '00'] = time.split(':');
  const h = parseInt(hStr, 10);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${mStr} ${ampm}`;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export default function StaffDashboardPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<FrontDeskOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [operationsTab, setOperationsTab] = useState<'classes' | 'trainers' | 'requests' | 'checkin'>('classes');
  const [searchArrival, setSearchArrival] = useState('');
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const todayIso = localDateIso();
  const greeting = getTimeGreeting();
  const formattedTodayDate = formatFullDate(todayIso);

  // AI Chat integration for Staff
  const { sendMessage, isLoading, error: chatError, sessionId } = useAIChat({
    variant: 'member',
    onMessageReceived: (response) => {
      console.log('Staff AI Response:', response);
    },
    onError: (err) => {
      console.error('Staff AI Chat Error:', err);
    },
  });

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getFrontDeskOverview();
      setData(overview);
    } catch {
      // Graceful fallback: pull from studio APIs using active session
      const session = getStudioSession();
      try {
        const [classesRes, membersRes, bookingsRes, attendanceRes] = await Promise.allSettled([
          ApiClient.getClasses(),
          ApiClient.getMembers(),
          ApiClient.getBookings(),
          ApiClient.getAttendance(),
        ]);

        const classesList = classesRes.status === 'fulfilled' && Array.isArray(classesRes.value) ? classesRes.value : [];
        const membersList = membersRes.status === 'fulfilled' && Array.isArray(membersRes.value) ? membersRes.value : [];
        const bookingsList = bookingsRes.status === 'fulfilled' && Array.isArray(bookingsRes.value) ? bookingsRes.value : [];
        const attendanceList = attendanceRes.status === 'fulfilled' && Array.isArray(attendanceRes.value) ? attendanceRes.value : [];

        setData({
          user: {
            id: session?.id || 'staff-default-id',
            displayName: session?.name || 'Front Desk Staff',
            email: session?.email || 'staff@wellness.studio',
            phoneE164: session?.phone || '+91 98765 43210',
          },
          studio: {
            id: 'studio-main',
            code: 'wellness-studio',
            name: currentStaffStudio.name || 'Ranayaa Fitness & Wellness Studio',
            timezone: 'Asia/Kolkata',
            currency: 'INR',
            tier: 'starter',
            tierName: 'Starter',
          },
          members: membersList.map((m: any) => ({
            id: m.id,
            fullName: m.fullName || m.full_name || m.name || 'Member',
            email: m.email || '',
            phone: m.phone || '',
            plan: m.membership_id || m.plan || 'Standard Membership',
            status: m.status || 'Active',
            joined: m.join_date || m.joined || todayIso,
            expiry: m.expiry || null,
          })),
          sessions: classesList.map((c: any) => ({
            id: c.id,
            name: c.name,
            category: c.category || 'Fitness',
            date: c.date || todayIso,
            startTime: c.startTime || '07:00',
            endTime: c.endTime || '08:00',
            trainer: c.trainer || 'Staff Coach',
            room: c.room || 'Studio A',
            capacity: c.capacity || 14,
            status: c.status || 'Scheduled',
          })),
          bookings: bookingsList.map((b: any) => ({
            id: b.id,
            classId: b.classId || b.class_schedule_id,
            memberId: b.memberId || b.member_id,
            status: b.status || 'Confirmed',
            bookedAt: b.bookedAt || b.booked_at || new Date().toISOString(),
          })),
          attendance: attendanceList.map((a: any) => ({
            id: a.id,
            bookingId: a.bookingId || a.booking_id,
            status: a.status || 'Present',
            checkedInAt: a.checkedInAt || a.checked_in_at || null,
          })),
        });
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Staff workspace could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const staffName = data?.user?.displayName || getStudioSession()?.name || 'Front Desk Staff';

  const memberMap = useMemo(() => new Map((data?.members || []).map((m) => [m.id, m])), [data]);
  const sessionMap = useMemo(() => new Map((data?.sessions || []).map((s) => [s.id, s])), [data]);
  const attendanceMap = useMemo(() => new Map((data?.attendance || []).map((a) => [a.bookingId, a])), [data]);

  // Today's scheduled sessions
  const todaySessions = useMemo(() => {
    return (data?.sessions || []).filter(
      (s) => normalizeDateIso(s.date) === todayIso || s.status === 'Scheduled'
    );
  }, [data, todayIso]);

  // Today's bookings
  const todayBookings = useMemo(() => {
    return (data?.bookings || []).filter((b) => {
      const sess = sessionMap.get(b.classId);
      return sess && (normalizeDateIso(sess.date) === todayIso || sess.status === 'Scheduled');
    });
  }, [data, sessionMap, todayIso]);

  // Confirmed bookings for today
  const todayConfirmedBookings = useMemo(() => {
    return todayBookings.filter((b) => b.status?.toLowerCase() === 'confirmed');
  }, [todayBookings]);

  // Checked in bookings for today
  const todayCheckedInBookings = useMemo(() => {
    return todayBookings.filter((b) => attendanceMap.get(b.id)?.status === 'Present');
  }, [todayBookings, attendanceMap]);

  // Pending booking requests (waitlisted or pending)
  const pendingRequests = useMemo(() => {
    return (data?.bookings || []).filter((b) => {
      const st = b.status?.toLowerCase();
      return st === 'waitlisted' || st === 'pending';
    });
  }, [data]);

  // Total registered members
  const totalMembersCount = data?.members?.length || 0;

  // Filtered arrivals for Desk Fast Check-in
  const filteredArrivals = useMemo(() => {
    if (!searchArrival.trim()) return todayBookings.slice(0, 10);
    const q = searchArrival.toLowerCase();
    return todayBookings.filter((b) => {
      const m = memberMap.get(b.memberId);
      const s = sessionMap.get(b.classId);
      return (
        m?.fullName?.toLowerCase().includes(q) ||
        m?.phone?.includes(q) ||
        s?.name?.toLowerCase().includes(q) ||
        s?.trainer?.toLowerCase().includes(q)
      );
    });
  }, [todayBookings, memberMap, sessionMap, searchArrival]);

  // Fast Check-in action (Strictly PRESENT / ABSENT)
  async function handleQuickCheckIn(bookingId: string) {
    setCheckingInId(bookingId);
    try {
      await ApiClient.frontDeskCheckIn(bookingId);
      addToast({
        type: 'success',
        title: 'Check-in Recorded',
        message: 'Member attendance marked Present in database.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Check-in Failed',
        message: err.message || 'Could not record member check-in.',
      });
    } finally {
      setCheckingInId(null);
    }
  }

  // Booking action: Accept / Confirm Request
  async function handleAcceptBooking(bookingId: string) {
    setActionBusyId(bookingId);
    try {
      await ApiClient.updateBookingStatus(bookingId, 'confirmed');
      addToast({
        type: 'success',
        title: 'Booking Confirmed',
        message: 'Member request promoted to confirmed seat.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Could not confirm booking request.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  // Booking action: Reject Request
  async function handleRejectBooking(bookingId: string) {
    if (!confirm('Reject this booking request?')) return;
    setActionBusyId(bookingId);
    try {
      await ApiClient.updateBookingStatus(bookingId, 'cancelled');
      addToast({
        type: 'info',
        title: 'Booking Rejected',
        message: 'Booking request has been cancelled.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Could not reject booking request.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  // Booking action: Cancel Confirmed Reservation
  async function handleCancelBooking(bookingId: string) {
    if (!confirm('Cancel this confirmed reservation?')) return;
    setActionBusyId(bookingId);
    try {
      await ApiClient.cancelBooking(bookingId);
      addToast({
        type: 'info',
        title: 'Reservation Cancelled',
        message: 'Booking status updated to Cancelled in database.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Cancellation Failed',
        message: err.message || 'Could not cancel reservation.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  const currentTimeStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
  }, []);

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <RefreshCwIcon size="md" className="mx-auto animate-spin text-rose-600" />
          <p className="mt-3 text-xs font-semibold text-slate-500">Loading front desk operations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* ==============================================================
          1. WELCOME HERO (Warm White & Rose Pink Design Language)
         ============================================================== */}
      <section
        aria-label="Staff welcome header"
        className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 lg:p-10 shadow-xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column (7 cols): Greeting, Date, Front Desk Role, Actions */}
          <div className="lg:col-span-7 space-y-4">
            {/* Studio Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:border-rose-950/60 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
              <span>Front Desk Operations</span>
              <span className="text-rose-300 dark:text-rose-700">·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 normal-case">{currentStaffStudio.name}</span>
            </div>

            {/* Main Visual Focus: "Good Morning, Staff Member" */}
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
                {greeting}, <span className="italic text-rose-600 dark:text-rose-400">{staffName}</span>
              </h1>
              {/* Current Date Clearly Underneath */}
              <p className="mt-2 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <CalendarIcon size="xs" className="text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formattedTodayDate}</span>
              </p>
            </div>

            {/* Short, professional front-desk supporting sentence */}
            <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Coordinate front-desk arrivals, oversee real-time studio bookings, verify member check-ins, and monitor trainer session schedules across the floor.
            </p>

            {/* Quick Actions relevant to front-desk responsibilities */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/staff/class-attendance"
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 cursor-pointer"
              >
                <CheckCircleIcon size="xs" />
                <span>Desk Check-in</span>
              </Link>
              <Link
                href="/staff/members"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50/50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 dark:hover:border-rose-900 dark:hover:text-rose-300 cursor-pointer"
              >
                <UsersIcon size="xs" />
                <span>Member Lookup</span>
              </Link>
              <Link
                href="/staff/bookings"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
              >
                <LayersIcon size="xs" />
                <span>View Bookings</span>
              </Link>
            </div>
          </div>

          {/* Right Column (5 cols): Editorial Studio Photography */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-md border-4 border-white dark:border-studio-800 ring-1 ring-slate-200/60 dark:ring-studio-700">
              <Image
                src="https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=1000&q=80"
                alt="Studio Reception and Training Floor"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-md dark:bg-studio-900/90 border border-slate-100 dark:border-studio-800">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">Live Reception</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{currentStaffStudio.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          2. FIVE PASTEL STATISTIC CARDS (Section 6)
         ============================================================== */}
      <section
        aria-label="Front desk operational KPIs"
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5"
      >
        {/* Metric 1: Total Members – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Total Members
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {totalMembersCount > 0 ? totalMembersCount : '0'}
              </p>
            </div>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-rose-700/85 dark:text-rose-300/85 truncate">
            {totalMembersCount > 0 ? `${totalMembersCount} registered members` : 'No registered members'}
          </p>
        </div>

        {/* Metric 2: Today's Classes – Soft Sky Blue */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-sky-200/70 bg-[#EEF7FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Today&apos;s Classes
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {todaySessions.length > 0 ? todaySessions.length : '0'}
              </p>
            </div>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <CalendarIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-sky-700/85 dark:text-sky-300/85 truncate">
            {todaySessions.length > 0 ? `${todaySessions.length} sessions on schedule` : 'No sessions today'}
          </p>
        </div>

        {/* Metric 3: Today's Bookings – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-emerald-200/70 bg-[#E9FAF1] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Today&apos;s Bookings
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {todayBookings.length > 0 ? todayBookings.length : '0'}
              </p>
            </div>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <LayersIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-emerald-700/85 dark:text-emerald-300/85 truncate">
            {todayBookings.length > 0 ? `${todayConfirmedBookings.length} confirmed reservations` : 'No bookings today'}
          </p>
        </div>

        {/* Metric 4: Today's Check-ins – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-purple-200/70 bg-[#F5EFFF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Today&apos;s Check-ins
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {todayCheckedInBookings.length > 0 ? todayCheckedInBookings.length : '0'}
              </p>
            </div>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-purple-700/85 dark:text-purple-300/85 truncate">
            {todayBookings.length > 0
              ? `${todayCheckedInBookings.length}/${todayBookings.length} checked in`
              : 'No check-ins yet'}
          </p>
        </div>

        {/* Metric 5: Pending Requests – Warm Peach / Amber */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-amber-200/80 bg-[#FFFBEB] p-4.5 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/30 col-span-2 md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Pending Requests
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-amber-950 dark:text-amber-100">
                {pendingRequests.length > 0 ? pendingRequests.length : '0'}
              </p>
            </div>
            <span className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100/90 text-amber-700 shadow-2xs dark:bg-amber-900/60 dark:text-amber-200">
              <ClockIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-amber-700/85 dark:text-amber-300/85 truncate">
            {pendingRequests.length > 0 ? `${pendingRequests.length} awaiting review` : 'No pending requests'}
          </p>
        </div>
      </section>

      {/* ==============================================================
          3. TODAY'S OPERATIONS (Section 7)
         ============================================================== */}
      <section
        aria-label="Today's operations workspace"
        className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 dark:border-studio-800">
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
              Today&apos;s Operations
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Live scheduled classes, trainer attendance monitoring, member check-ins, and booking requests
            </p>
          </div>

          {/* Operations Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-[#FCFAF8] p-1 dark:border-studio-800 dark:bg-studio-950">
            <button
              type="button"
              onClick={() => setOperationsTab('classes')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                operationsTab === 'classes'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Classes &amp; Sessions ({todaySessions.length})
            </button>
            <button
              type="button"
              onClick={() => setOperationsTab('trainers')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                operationsTab === 'trainers'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Trainer Attendance
            </button>
            <button
              type="button"
              onClick={() => setOperationsTab('requests')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                operationsTab === 'requests'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Booking Requests ({pendingRequests.length})
            </button>
            <button
              type="button"
              onClick={() => setOperationsTab('checkin')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                operationsTab === 'checkin'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              Desk Fast Check-in
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------------
            TAB A: TODAY'S CLASSES & SESSIONS
           ------------------------------------------------------------- */}
        {operationsTab === 'classes' && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todaySessions.map((session) => {
                const bookingsInSession = todayBookings.filter((b) => b.classId === session.id);
                const confirmedCount = bookingsInSession.filter((b) => b.status?.toLowerCase() === 'confirmed').length;
                const occupancyPct = session.capacity > 0 ? Math.min(100, Math.round((confirmedCount / session.capacity) * 100)) : 0;

                return (
                  <div
                    key={session.id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[#FCFAF8] p-4.5 dark:border-studio-700 dark:bg-studio-950/50"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            {session.category}
                          </span>
                          <h3 className="mt-1.5 font-serif text-sm font-bold text-slate-900 dark:text-white">
                            {session.name}
                          </h3>
                        </div>
                        <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-studio-800 dark:text-slate-300">
                          {session.room || 'Studio Floor'}
                        </span>
                      </div>

                      <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                        <ClockIcon size="xs" className="text-rose-600" />
                        <span>{formatTime12h(session.startTime)} – {formatTime12h(session.endTime)}</span>
                      </p>

                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Assigned Trainer: <strong className="text-slate-800 dark:text-slate-200">{session.trainer || 'Coach'}</strong>
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-studio-800">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                        <span>Capacity Occupancy</span>
                        <span className="tabular-nums font-bold text-slate-900 dark:text-white">
                          {confirmedCount} / {session.capacity} spots
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-studio-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-rose-600 transition-all duration-300"
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {todaySessions.length === 0 && (
                <div className="col-span-full py-10 text-center text-xs text-slate-400">
                  <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                    No classes scheduled for today
                  </p>
                  <p className="mt-1">
                    Scheduled sessions created in the studio calendar will automatically appear here.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB B: TRAINER ATTENDANCE MONITORING
           ------------------------------------------------------------- */}
        {operationsTab === 'trainers' && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Assigned Trainer</th>
                  <th className="px-3 py-3">Scheduled Session</th>
                  <th className="px-3 py-3">Time &amp; Studio</th>
                  <th className="px-3 py-3">Floor Status</th>
                  <th className="px-4 py-3 text-right">Attendance Indicator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                {todaySessions.map((session) => {
                  const sessionAttendance = (data?.attendance || []).filter((a) => {
                    const b = (data?.bookings || []).find((bk) => bk.id === a.bookingId);
                    return b?.classId === session.id;
                  });
                  const hasAttendanceRecorded = sessionAttendance.length > 0;
                  const isSessionStarted = session.startTime && session.startTime <= currentTimeStr;
                  const isSessionEnded = session.endTime && session.endTime < currentTimeStr;

                  let statusText = 'Upcoming';
                  let statusBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-300';

                  if (hasAttendanceRecorded) {
                    statusText = 'On Floor / Verified';
                    statusBadgeClass = 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
                  } else if (isSessionEnded) {
                    statusText = 'Missed Attendance';
                    statusBadgeClass = 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
                  } else if (isSessionStarted) {
                    statusText = 'In Session';
                    statusBadgeClass = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
                  }

                  return (
                    <tr key={session.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 dark:text-white">{session.trainer || 'Assigned Coach'}</p>
                        <p className="text-[10px] text-slate-400">Studio Instructor</p>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {session.name}
                        <span className="block text-[10px] font-normal text-slate-400">{session.category}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                        <span className="font-semibold">{formatTime12h(session.startTime)} – {formatTime12h(session.endTime)}</span>
                        <span className="block text-[10px] text-slate-400">{session.room || 'Studio Floor'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${statusBadgeClass}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            statusText.includes('Verified') || statusText.includes('In Session')
                              ? 'bg-emerald-500 animate-pulse'
                              : statusText.includes('Missed')
                              ? 'bg-rose-500'
                              : 'bg-slate-400'
                          }`} />
                          <span>{statusText}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          {hasAttendanceRecorded
                            ? `${sessionAttendance.length} member check-ins filed`
                            : isSessionEnded
                            ? 'No check-in record filed'
                            : 'Awaiting session time'}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {todaySessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                      No trainer sessions scheduled for today.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB C: BOOKING REQUESTS (Accept, Reject, Cancel)
           ------------------------------------------------------------- */}
        {operationsTab === 'requests' && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-3 py-3">Session Requested</th>
                  <th className="px-3 py-3">Scheduled Time</th>
                  <th className="px-3 py-3">Request Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                {pendingRequests.map((booking) => {
                  const member = memberMap.get(booking.memberId);
                  const session = sessionMap.get(booking.classId);
                  const isBusy = actionBusyId === booking.id;

                  return (
                    <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 dark:text-white">{member?.fullName || 'Member'}</p>
                        <p className="text-[10px] text-slate-400">{member?.phone ? formatIndianMobile(member.phone) : member?.email}</p>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">
                        {session?.name || 'Studio Class'}
                        <span className="block text-[10px] font-normal text-slate-400">Coach: {session?.trainer || 'Staff'}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatTime12h(session?.startTime)} – {formatTime12h(session?.endTime)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>{booking.status || 'Waitlisted'}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleAcceptBooking(booking.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{isBusy ? 'Processing...' : 'Accept'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectBooking(booking.id)}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-50 disabled:opacity-50 transition cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {pendingRequests.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-xs text-slate-400">
                      <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                        No pending booking requests
                      </p>
                      <p className="mt-1">
                        All member reservation requests have been processed.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* -------------------------------------------------------------
            TAB D: DESK FAST CHECK-IN
           ------------------------------------------------------------- */}
        {operationsTab === 'checkin' && (
          <div className="mt-5 space-y-4">
            <div className="relative w-full sm:w-80">
              <SearchIcon size="xs" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search member name or phone..."
                value={searchArrival}
                onChange={(e) => setSearchArrival(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-3 py-3">Session</th>
                    <th className="px-3 py-3">Scheduled Time</th>
                    <th className="px-3 py-3">Trainer</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                  {filteredArrivals.map((booking) => {
                    const member = memberMap.get(booking.memberId);
                    const session = sessionMap.get(booking.classId);
                    const att = attendanceMap.get(booking.id);
                    const isCheckedIn = att?.status === 'Present';

                    return (
                      <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-900 dark:text-white">{member?.fullName || 'Member'}</p>
                          <p className="text-[10px] text-slate-400">
                            {member?.phone ? formatIndianMobile(member.phone) : 'No phone'} · {member?.plan}
                          </p>
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">
                          {session?.name || 'Studio Session'}
                          <span className="block text-[10px] font-normal text-slate-400">{session?.room || 'Studio Floor'}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 dark:text-slate-300 tabular-nums">
                          {formatTime12h(session?.startTime)} – {formatTime12h(session?.endTime)}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-700 dark:text-slate-300">
                          {session?.trainer || 'Coach'}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                              isCheckedIn
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${isCheckedIn ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <span>{isCheckedIn ? 'Present' : 'Not Checked In'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {isCheckedIn ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              <Check className="h-3.5 w-3.5" />
                              <span>Verified</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleQuickCheckIn(booking.id)}
                              disabled={checkingInId === booking.id}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                            >
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>{checkingInId === booking.id ? 'Recording...' : 'Mark Present'}</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredArrivals.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                        <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                          No matching member arrivals
                        </p>
                        <p className="mt-1">
                          {searchArrival.trim() ? 'No bookings match your search term.' : 'No member bookings scheduled for this date.'}
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    {/* ── Floating Staff AI Assistant ── */}
    <FloatingAIChat
      variant="member"
      title="Ask AI"
      subtitle="Your front desk studio assistant"
      welcomeMessage="Hi! 👋 I'm your front desk studio assistant. I can help with class schedules, member check-ins, bookings, and studio operations."
      studioName={currentStaffStudio.name}
      onSendMessage={sendMessage}
      onMessageReceived={(response) => {
        console.log('Staff AI Response:', response);
      }}
      isBackendConnected={!!sessionId}
    />
    </div>
  );
}
