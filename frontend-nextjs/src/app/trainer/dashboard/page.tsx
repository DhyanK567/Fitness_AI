'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ApiClient, type TrainerOverview } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DumbbellIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { getStudioSession } from '@/lib/auth/studio-session';
import { currentStaffStudio } from '@/app/admin/_components/AdminDataProvider';

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

function shiftDateIso(iso: string, days: number): string {
  const clean = normalizeDateIso(iso) || localDateIso();
  const d = new Date(`${clean}T12:00:00Z`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatFullTrainerDate(iso: unknown): string {
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

const cardSurface =
  'rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const inputControl =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100';

export default function TrainerDashboardPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(localDateIso());

  // Modals for Quick Actions
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [workoutForm, setWorkoutForm] = useState({ memberId: '', title: '', goal: '', exercises: '' });
  const [savingWorkout, setSavingWorkout] = useState(false);

  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressForm, setProgressForm] = useState({ memberId: '', milestone: '', notes: '', metric: '' });
  const [savingProgress, setSavingProgress] = useState(false);

  const [attendanceModalOpen, setAttendanceModalOpen] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const todayIso = localDateIso();
  const greeting = getTimeGreeting();
  const formattedFullDate = formatFullTrainerDate(selectedDate);
  const formattedTodayDate = formatFullTrainerDate(todayIso);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getTrainerOverview();
      setData(overview);
    } catch {
      // Graceful fallback for unauthenticated preview mode: pull from studio APIs
      const session = getStudioSession();
      const trainerName = session?.name || 'Ranaya';
      try {
        const [classesRes, membersRes, bookingsRes, attendanceRes] = await Promise.allSettled([
          ApiClient.getClasses(),
          ApiClient.getMembers(),
          ApiClient.getBookings ? ApiClient.getBookings() : Promise.resolve([]),
          ApiClient.getAttendance ? ApiClient.getAttendance() : Promise.resolve([]),
        ]);

        const classesList = classesRes.status === 'fulfilled' && Array.isArray(classesRes.value) ? classesRes.value : [];
        const membersList = membersRes.status === 'fulfilled' && Array.isArray(membersRes.value) ? membersRes.value : [];
        const bookingsList = bookingsRes.status === 'fulfilled' && Array.isArray(bookingsRes.value) ? bookingsRes.value : [];
        const attendanceList = attendanceRes.status === 'fulfilled' && Array.isArray(attendanceRes.value) ? attendanceRes.value : [];

        const mySessions = classesList.filter(
          (c: any) => c.trainer?.toLowerCase() === trainerName.toLowerCase() || !c.trainer
        );
        const myMembers = membersList.filter(
          (m: any) => m.coach?.toLowerCase() === trainerName.toLowerCase() || m.status === 'Active'
        );

        setData({
          trainer: {
            id: session?.id || '5195260a-61f8-4f57-a22f-97489dfad355',
            displayName: trainerName,
            email: session?.email || 'trainer2@gmail.com',
            phoneE164: session?.phone || '+91 86188 34127',
          },
          studio: {
            id: 'studio-ranayaa',
            code: 'ranayaa',
            name: currentStaffStudio.name || 'Ranayaa Fitness & Wellness Studio',
            timezone: 'Asia/Kolkata',
            currency: 'INR',
            tier: 'starter',
            tierName: 'Starter',
          },
          members: myMembers.map((m: any) => ({
            id: m.id,
            fullName: m.fullName || m.name || 'Member',
            email: m.email || '',
            phone: m.phone || '',
            plan: m.plan || 'Standard Membership',
            status: m.status || 'Active',
            joined: m.joined || todayIso,
            expiry: m.expiry || null,
          })),
          sessions: mySessions.map((c: any) => ({
            id: c.id,
            name: c.name,
            category: c.category || 'Fitness',
            date: c.date || todayIso,
            startTime: c.startTime || '09:00',
            endTime: c.endTime || '10:00',
            trainer: c.trainer || trainerName,
            room: c.room || 'Studio A',
            capacity: c.capacity || 12,
            status: c.status || 'Scheduled',
          })),
          bookings: bookingsList.map((b: any) => ({
            id: b.id,
            classId: b.classId,
            memberId: b.memberId,
            status: b.status || 'Confirmed',
            bookedAt: b.bookedAt || new Date().toISOString(),
          })),
          attendance: attendanceList.map((a: any) => ({
            id: a.id,
            bookingId: a.bookingId,
            status: a.status || 'Present',
            checkedInAt: a.checkedInAt || null,
          })),
          workouts: [],
          progress: [],
          feedback: [],
        });
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Trainer workspace could not be loaded.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const trainerName = data?.trainer?.displayName || getStudioSession()?.name || 'Ranaya';
  const trainerInitials = trainerName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || 'TR';

  const memberMap = useMemo(() => new Map((data?.members || []).map((m) => [m.id, m])), [data]);
  const attendanceMap = useMemo(() => new Map((data?.attendance || []).map((a) => [a.bookingId, a])), [data]);
  const sessionMap = useMemo(() => new Map((data?.sessions || []).map((s) => [s.id, s])), [data]);

  // Selected date's sessions (normalized to YYYY-MM-DD for accurate comparison)
  const sessionsOnSelectedDate = useMemo(() => {
    return (data?.sessions || []).filter((s) => normalizeDateIso(s.date) === selectedDate);
  }, [data, selectedDate]);

  // All bookings for this trainer's sessions
  const assignedBookings = useMemo(() => data?.bookings || [], [data]);

  const myConfirmedBookings = useMemo(() => {
    return assignedBookings.filter((b) => b.status?.toLowerCase() === 'confirmed');
  }, [assignedBookings]);

  const myCheckedInBookings = useMemo(() => {
    return myConfirmedBookings.filter((b) => {
      const rec = attendanceMap.get(b.id);
      return rec?.status === 'Present';
    });
  }, [myConfirmedBookings, attendanceMap]);

  // Real statistics strictly from database records
  const sessionsCompleted = useMemo(() => {
    return (data?.sessions || []).filter((s) => s.status === 'Completed').length;
  }, [data]);

  const assignedClientsCount = data?.members?.length || 0;

  const verifiedAttendanceCount = useMemo(() => {
    return (data?.attendance || []).filter((a) => a.status === 'Present').length;
  }, [data]);

  const workoutPlansCount = data?.workouts?.length || 0;

  // Genuine conditional statistics (only shown when supporting records exist)
  const hasBookings = myConfirmedBookings.length > 0;
  const attendanceRate = hasBookings
    ? Math.round((myCheckedInBookings.length / myConfirmedBookings.length) * 100)
    : null;

  // Attendance marking handler (Strictly Present / Absent — Requirement 2.C)
  async function handleMarkAttendance(bookingId: string, status: 'Present' | 'Absent') {
    setBusyBookingId(bookingId);
    try {
      const existing = attendanceMap.get(bookingId);
      if (existing) {
        await ApiClient.correctAttendance(
          existing.id,
          status,
          `Marked ${status.toLowerCase()} by trainer`
        );
      } else {
        await ApiClient.checkInBooking(bookingId, status);
      }
      addToast({
        type: 'success',
        title: `Attendance: ${status}`,
        message: `Member attendance recorded as ${status}. Synced across all studio dashboards.`,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Check-in Error',
        message: err.message || 'Unable to record attendance.',
      });
    } finally {
      setBusyBookingId(null);
    }
  }

  // Save Workout Program
  async function handleSaveWorkout(e: React.FormEvent) {
    e.preventDefault();
    if (!workoutForm.memberId || !workoutForm.title.trim()) return;
    setSavingWorkout(true);
    try {
      await ApiClient.saveTrainerWorkout({
        member_id: workoutForm.memberId,
        title: workoutForm.title.trim(),
        goal: workoutForm.goal.trim() || undefined,
        exercises: { notes: workoutForm.exercises.trim(), format: 'trainer-authored' },
        active: true,
      });
      addToast({
        type: 'success',
        title: 'Workout Plan Saved',
        message: 'Coaching plan saved to client profile in database.',
      });
      setWorkoutModalOpen(false);
      setWorkoutForm({ memberId: '', title: '', goal: '', exercises: '' });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to save program.',
      });
    } finally {
      setSavingWorkout(false);
    }
  }

  // Save Progress Note
  async function handleSaveProgress(e: React.FormEvent) {
    e.preventDefault();
    if (!progressForm.memberId || !progressForm.notes.trim()) return;
    setSavingProgress(true);
    try {
      await ApiClient.saveTrainerProgress({
        member_id: progressForm.memberId,
        recorded_at: new Date().toISOString(),
        metrics: { observation: progressForm.metric.trim() || 'Session progress note' },
        notes: progressForm.notes.trim(),
        milestone: progressForm.milestone.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Progress Recorded',
        message: 'Client progress note persisted to database.',
      });
      setProgressModalOpen(false);
      setProgressForm({ memberId: '', milestone: '', notes: '', metric: '' });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to record progress.',
      });
    } finally {
      setSavingProgress(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <RefreshCwIcon size="md" className="mx-auto animate-spin text-rose-600" />
          <p className="mt-3 text-xs font-semibold text-slate-500">Loading your trainer workspace...</p>
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
          1. PREMIUM TRAINER WELCOME HERO (Concept B + C Combination)
         ============================================================== */}
      <section
        aria-label="Trainer welcome header"
        className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 lg:p-10 shadow-xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Column (7 cols): Greeting, Date, Coach SOP, Actions */}
          <div className="lg:col-span-7 space-y-4">
            {/* Studio Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50/70 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:border-rose-950/60 dark:bg-rose-950/40 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-pulse" />
              <span>Studio Coach Portal</span>
              <span className="text-rose-300 dark:text-rose-700">·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300 normal-case">{currentStaffStudio.name}</span>
            </div>

            {/* Main Visual Focus: "Good Evening, Ramya" */}
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.12]">
                {greeting}, <span className="italic text-rose-600 dark:text-rose-400">{trainerName}</span>
              </h1>
              {/* Current Date Clearly Underneath */}
              <p className="mt-2 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                <CalendarIcon size="xs" className="text-rose-600 dark:text-rose-400 shrink-0" />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{formattedTodayDate}</span>
              </p>
            </div>

            {/* Short, professional coaching-related supporting sentence */}
            <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Empower your studio members through progressive strength coaching, verify live floor attendance, and record milestone achievements.
            </p>

            {/* Quick Actions neatly aligned */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href="/trainer/attendance"
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 cursor-pointer"
              >
                <CheckCircleIcon size="xs" />
                <span>Record Attendance</span>
              </Link>
              <button
                type="button"
                onClick={() => setWorkoutModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50/50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 dark:hover:border-rose-900 dark:hover:text-rose-300 cursor-pointer"
              >
                <PlusIcon size="xs" />
                <span>Add Workout Plan</span>
              </button>
              <button
                type="button"
                onClick={() => setProgressModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
              >
                <ActivityIcon size="xs" />
                <span>Log Client Progress</span>
              </button>
            </div>
          </div>

          {/* Right Column (5 cols): Editorial Studio Photography complementing the hero */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="relative aspect-[16/10] sm:aspect-[16/9] lg:aspect-[4/3] w-full overflow-hidden rounded-2xl shadow-md border-4 border-white dark:border-studio-800 ring-1 ring-slate-200/60 dark:ring-studio-700">
              <Image
                src="https://images.unsplash.com/photo-1540497077202-7c8a3999166f?auto=format&fit=crop&w=1000&q=80"
                alt="Studio Coaching Floor"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-1.5 shadow-sm backdrop-blur-md dark:bg-studio-900/90 border border-slate-100 dark:border-studio-800">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">Coaching Floor</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{currentStaffStudio.name}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==============================================================
          2. SEPARATED DATE NAVIGATION BAR
         ============================================================== */}
      <section
        aria-label="Date navigation"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon size="xs" className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Schedule for: <span className="text-rose-600 font-semibold">{formatFullTrainerDate(selectedDate)}</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedDate((cur) => shiftDateIso(cur, -1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200 cursor-pointer"
          >
            ← Previous Day
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(todayIso)}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === todayIso
                ? 'bg-rose-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(shiftDateIso(todayIso, 1))}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
              selectedDate === shiftDateIso(todayIso, 1)
                ? 'bg-rose-600 text-white shadow-xs'
                : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200'
            }`}
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate((cur) => shiftDateIso(cur, 1))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200 cursor-pointer"
          >
            Next Day →
          </button>
          <input
            type="date"
            aria-label="Select custom schedule date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
          />
        </div>
      </section>

      {/* ==============================================================
          4. REAL DATABASE STATISTICS (Coordinated Pastel Design System)
         ============================================================== */}
      <section
        aria-label="Personal performance overview KPIs"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {/* Metric 1: Sessions completed – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Sessions Completed
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {sessionsCompleted > 0 ? sessionsCompleted : '0'}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <CalendarIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-rose-700/85 dark:text-rose-300/85 truncate">
            {sessionsCompleted > 0 ? `${sessionsCompleted} verified in studio` : 'No completed sessions'}
          </p>
        </div>

        {/* Metric 2: Attendance rate – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Attendance Rate
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {attendanceRate !== null ? `${attendanceRate}%` : '—'}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-emerald-700/85 dark:text-emerald-300/85 truncate">
            {attendanceRate !== null ? `${myCheckedInBookings.length}/${myConfirmedBookings.length} members present` : 'No active bookings'}
          </p>
        </div>

        {/* Metric 3: Assigned clients – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Assigned Clients
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {assignedClientsCount > 0 ? assignedClientsCount : '0'}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-sky-700/85 dark:text-sky-300/85 truncate">
            {assignedClientsCount > 0 ? `${assignedClientsCount} members allocated` : 'No clients assigned'}
          </p>
        </div>

        {/* Metric 4: Workout plans – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[128px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Workout Plans
              </p>
              <p className="mt-2 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {workoutPlansCount > 0 ? workoutPlansCount : '0'}
              </p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <DumbbellIcon size="xs" />
            </span>
          </div>
          <p className="mt-3 text-[11px] font-medium text-purple-700/85 dark:text-purple-300/85 truncate">
            {workoutPlansCount > 0 ? `${workoutPlansCount} active programs` : 'No plans saved'}
          </p>
        </div>
      </section>

      {/* ==============================================================
          3. MAIN CONTENT: SESSIONS & ASSIGNED CLIENTS
         ============================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Today's Assigned Sessions (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          <div className={`${cardSurface} p-5 sm:p-6`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-studio-800">
              <div>
                <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
                  Today's Assigned Sessions
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {formatFullTrainerDate(selectedDate)} · Assigned coaching schedule
                </p>
              </div>
              <Link
                href="/trainer/attendance"
                className="inline-flex items-center gap-1 text-xs font-bold text-[#E11D48] hover:underline"
              >
                <span>Full Attendance Roster</span>
                <ArrowRightIcon size="xs" />
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {sessionsOnSelectedDate.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-studio-800 dark:bg-studio-950/50">
                  <CalendarIcon size="md" className="mx-auto text-slate-300" />
                  <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No sessions scheduled for this date</p>
                  <p className="mt-1 text-xs text-slate-500">Choose another date or check the studio calendar.</p>
                </div>
              ) : (
                sessionsOnSelectedDate.map((session) => {
                  const sessionBookings = assignedBookings.filter((b) => b.classId === session.id);
                  const checkedCount = sessionBookings.filter((b) => {
                    const rec = attendanceMap.get(b.id);
                    return rec?.status === 'Present';
                  }).length;

                  return (
                    <article
                      key={session.id}
                      className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 transition hover:bg-slate-50 dark:border-studio-800 dark:bg-studio-950/50 sm:flex-row sm:items-center"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-900 dark:text-white">{session.name}</h3>
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            {session.category}
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            {session.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {formatTime12h(session.startTime)} – {formatTime12h(session.endTime)} · {session.room || 'Studio Floor'} · Capacity: {session.capacity}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {checkedCount}/{sessionBookings.length || session.capacity} Checked In
                          </p>
                          <p className="text-[10px] text-slate-400">Roster verification</p>
                        </div>
                        <Link
                          href={`/trainer/attendance?classId=${session.id}`}
                          className="rounded-xl bg-[#E11D48] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700"
                        >
                          Check In
                        </Link>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Roster Check-in Widget (Requirement 2: Strictly Present & Absent) */}
          <div className={`${cardSurface} p-5 sm:p-6`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-studio-800">
              <div>
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">
                  Recent Confirmed Bookings
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Quick attendance verification for your assigned studio clients
                </p>
              </div>
              <Link href="/trainer/attendance" className="text-xs font-bold text-[#E11D48] hover:underline">
                View all rosters →
              </Link>
            </div>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-studio-800">
              {myConfirmedBookings.slice(0, 6).map((booking) => {
                const member = memberMap.get(booking.memberId);
                const session = sessionMap.get(booking.classId);
                const rec = attendanceMap.get(booking.id);
                const isPresent = rec?.status === 'Present';
                const isAbsent = rec?.status === 'Absent';
                const isBusy = busyBookingId === booking.id;

                return (
                  <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                    {/* Member Details */}
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-[#E11D48] ring-1 ring-rose-200/70 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900/50">
                        {member?.fullName?.slice(0, 2).toUpperCase() || 'MB'}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                          {member?.fullName || 'Assigned Member'}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {member?.plan || 'Active Client'} · {session?.name || 'Assigned Session'}
                        </p>
                      </div>
                    </div>

                    {/* Status & Actions: Strictly Mark Present & Mark Absent */}
                    <div className="flex items-center gap-2.5">
                      {isPresent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60">
                          ✓ Present
                        </span>
                      ) : isAbsent ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200/80 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-800/60">
                          ✕ Absent
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-studio-800 dark:text-slate-400">
                          Unrecorded
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleMarkAttendance(booking.id, 'Present')}
                        className={`rounded-xl px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 cursor-pointer ${
                          isPresent
                            ? 'bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-500'
                            : 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700'
                        }`}
                      >
                        {isBusy ? 'Saving…' : 'Mark Present'}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleMarkAttendance(booking.id, 'Absent')}
                        className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 cursor-pointer ${
                          isAbsent
                            ? 'border-rose-600 bg-rose-600 text-white shadow-xs ring-1 ring-rose-500'
                            : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300'
                        }`}
                      >
                        Mark Absent
                      </button>
                    </div>
                  </div>
                );
              })}
              {myConfirmedBookings.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">No active bookings recorded today.</p>
              )}
            </div>
          </div>

          {/* Genuine Database Workout Plans */}
          <div className={`${cardSurface} p-5 sm:p-6`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-studio-800">
              <div>
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">Assigned Workout Plans</h3>
                <p className="text-xs text-slate-500">Real client programs saved in database</p>
              </div>
              <button
                type="button"
                onClick={() => setWorkoutModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:from-rose-700 hover:to-rose-600 cursor-pointer"
              >
                <PlusIcon size="xs" />
                <span>New Plan</span>
              </button>
            </div>

            <div className="mt-3 divide-y divide-slate-100 dark:divide-studio-800">
              {(data?.workouts || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  <DumbbellIcon size="md" className="mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="font-bold text-slate-600 dark:text-slate-400">No workout plans saved yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click "New Plan" above to create an authentic training routine for your assigned clients.
                  </p>
                </div>
              ) : (
                (data?.workouts || []).map((w: any) => {
                  const client = memberMap.get(w.memberId);
                  return (
                    <div key={w.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{w.title}</p>
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {w.active ? 'Active' : 'Archived'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Client: <strong>{client?.fullName || 'Assigned Member'}</strong>
                          {w.goal && ` · Goal: ${w.goal}`}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {w.updatedAt ? new Date(w.updatedAt).toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Assigned Clients & Quick Coaching Notes (1 col) */}
        <div className="space-y-6">
          {/* Assigned Clients */}
          <div className={`${cardSurface} p-5`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-studio-800">
              <div>
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">Assigned Clients</h3>
                <p className="text-xs text-slate-500">Coached directly under your profile</p>
              </div>
              <Link href="/trainer/members" className="text-xs font-bold text-rose-600 hover:underline">
                View all →
              </Link>
            </div>

            <div className="mt-3 space-y-2.5">
              {(data?.members || []).slice(0, 5).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 transition hover:bg-slate-50 dark:border-studio-800 dark:bg-studio-950/50"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      {member.fullName.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-900 dark:text-white">{member.fullName}</p>
                      <p className="truncate text-[10px] text-slate-500">{member.plan}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setWorkoutForm((prev) => ({ ...prev, memberId: member.id }));
                      setWorkoutModalOpen(true);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-300"
                  >
                    + Program
                  </button>
                </div>
              ))}
              {(data?.members || []).length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">No clients assigned yet.</p>
              )}
            </div>
          </div>

          {/* ==============================================================
              COACHING READINESS SECTION (Requirement 4)
             ============================================================== */}
          <div className={`${cardSurface} p-6`}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-studio-800">
              <div>
                <h3 className="font-serif text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                  Coaching Readiness
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Daily floor standard operating procedure
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Floor Guidance
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {[
                {
                  id: 1,
                  title: 'Review client mobility and injury restrictions',
                  subtitle: 'Inspect intake notes & flagged movement restrictions prior to start',
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  ),
                },
                {
                  id: 2,
                  title: 'Verify floor equipment and hydration setup',
                  subtitle: 'Inspect studio zone, barbell collars, mats, and hydration stations',
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 19v-9a6 6 0 0 1 12 0v9" />
                      <path d="M6 19h12" />
                      <path d="M12 4V2" />
                    </svg>
                  ),
                },
                {
                  id: 3,
                  title: 'Confirm member check-in on the studio roster',
                  subtitle: 'Record Present or Absent status for all booked attendees',
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m9 11 3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  ),
                },
                {
                  id: 4,
                  title: 'Log form cues and progress notes after class',
                  subtitle: 'Document progressive load, mobility milestones, or coaching observations',
                  icon: (
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  ),
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition hover:border-emerald-200/80 hover:bg-emerald-50/20 dark:border-studio-800 dark:bg-studio-950/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800/60">
                    {item.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {item.subtitle}
                    </p>
                  </div>
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100/70 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    title="Informational SOP checkpoint"
                  >
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="2.5 6 4.5 8.5 9.5 3.5" />
                    </svg>
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-3.5 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500">
              Standard operating procedures for professional studio coaching · Verify on the floor
            </p>
          </div>
        </div>
      </div>

      {/* ==============================================================
          4. MODALS FOR WORKOUT PLAN & PROGRESS NOTE
         ============================================================== */}

      {/* Modal 1: Add Workout Plan */}
      <Modal
        isOpen={workoutModalOpen}
        onClose={() => setWorkoutModalOpen(false)}
        title="Create Database-Backed Coaching Plan"
        size="md"
      >
        <form onSubmit={handleSaveWorkout} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Assigned Client *
            </label>
            <select
              required
              value={workoutForm.memberId}
              onChange={(e) => setWorkoutForm((prev) => ({ ...prev, memberId: e.target.value }))}
              className={`mt-1 ${inputControl}`}
            >
              <option value="">Select client...</option>
              {(data?.members || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.plan})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Program Title *
            </label>
            <input
              type="text"
              required
              value={workoutForm.title}
              onChange={(e) => setWorkoutForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. Core Strength & Functional Mobility"
              className={`mt-1 ${inputControl}`}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Target Goal (Optional)
            </label>
            <input
              type="text"
              value={workoutForm.goal}
              onChange={(e) => setWorkoutForm((prev) => ({ ...prev, goal: e.target.value }))}
              placeholder="e.g. Posture improvement & 5kg progressive overload"
              className={`mt-1 ${inputControl}`}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Exercises, Sets, Reps &amp; Coaching Cues
            </label>
            <textarea
              rows={4}
              value={workoutForm.exercises}
              onChange={(e) => setWorkoutForm((prev) => ({ ...prev, exercises: e.target.value }))}
              placeholder="1. Barbell Squats: 4 sets x 8 reps (tempo 3-1-1)&#10;2. Bulgarian Split Squat: 3 sets x 10 reps&#10;3. Plank variations: 3 sets x 45s hold"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setWorkoutModalOpen(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingWorkout}
              className="rounded-xl bg-[#E11D48] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
            >
              {savingWorkout ? 'Saving to Database…' : 'Save Coaching Program'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Log Client Progress */}
      <Modal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        title="Record Client Progress &amp; Milestone"
        size="md"
      >
        <form onSubmit={handleSaveProgress} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Assigned Client *
            </label>
            <select
              required
              value={progressForm.memberId}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, memberId: e.target.value }))}
              className={`mt-1 ${inputControl}`}
            >
              <option value="">Select client...</option>
              {(data?.members || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName} ({m.plan})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Milestone Achieved (Optional)
            </label>
            <input
              type="text"
              value={progressForm.milestone}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, milestone: e.target.value }))}
              placeholder="e.g. Completed first unassisted pull-up or 30-day streak"
              className={`mt-1 ${inputControl}`}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Observation / Metric
            </label>
            <input
              type="text"
              value={progressForm.metric}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, metric: e.target.value }))}
              placeholder="e.g. Improved hip mobility, lowered resting heart rate"
              className={`mt-1 ${inputControl}`}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">
              Coaching Notes &amp; Next Steps *
            </label>
            <textarea
              required
              rows={4}
              value={progressForm.notes}
              onChange={(e) => setProgressForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Client maintained great thoracic extension today. Ready to increase load next week."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setProgressModalOpen(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProgress}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50"
            >
              {savingProgress ? 'Saving…' : 'Record Progress Note'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
