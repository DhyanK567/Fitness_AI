'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiClient, type TrainerOverview } from '@/lib/api-client';
import { formatIndianMobile } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FilterIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
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

const cardSurface =
  'rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const inputControl =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100';

export default function TrainerClassesPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const todayIso = localDateIso();

  async function loadData() {
    setLoading(true);
    try {
      const overview = await ApiClient.getTrainerOverview();
      setData(overview);
    } catch {
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
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const memberMap = useMemo(() => new Map((data?.members || []).map((m) => [m.id, m])), [data]);
  const attendanceMap = useMemo(() => new Map((data?.attendance || []).map((a) => [a.bookingId, a])), [data]);
  const bookings = data?.bookings || [];
  const sessions = data?.sessions || [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      if (s.category) set.add(s.category);
    }
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (categoryFilter !== 'All' && s.category !== categoryFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !(s.room || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sessions, categoryFilter, search]);

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
        message: `Member status updated to ${status}. Synced across studio records.`,
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

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-r from-white via-rose-50/45 to-violet-50/55 p-5 shadow-subtle sm:p-6 dark:border-studio-700 dark:from-studio-900 dark:via-studio-900 dark:to-studio-950">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E11D48] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                <CalendarIcon size="xs" />
                Classes &amp; Schedule
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-300">
                {currentStaffStudio.name}
              </span>
            </div>
            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
              Assigned Classes &amp; Schedule
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300">
              Only sessions assigned directly to your coaching profile
            </p>
          </div>

          <Link
            href="/trainer/attendance"
            className="inline-flex items-center gap-2 rounded-xl bg-[#E11D48] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700"
          >
            <CheckCircleIcon size="xs" />
            <span>Mark Daily Attendance</span>
          </Link>
        </div>
      </section>

      {/* Filter Bar */}
      <div className={`${cardSurface} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="relative">
            <SearchIcon size="xs" className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search classes by title or room..."
              className={`${inputControl} pl-8`}
            />
          </div>
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={inputControl}
              aria-label="Filter class category"
            >
              <option value="All">All Categories ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className="space-y-4">
        {filteredSessions.length === 0 ? (
          <div className={`${cardSurface} p-12 text-center`}>
            <CalendarIcon size="md" className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No assigned classes found</p>
            <p className="mt-1 text-xs text-slate-500">Contact your studio manager to allocate classes to your coach profile.</p>
          </div>
        ) : (
          filteredSessions.map((session) => {
            const classBookings = bookings.filter((b) => b.classId === session.id);
            const presentCount = classBookings.filter((b) => {
              const att = attendanceMap.get(b.id);
              return att?.status === 'Present' || att?.status === 'Late';
            }).length;

            return (
              <div key={session.id} className={`${cardSurface} overflow-hidden`}>
                <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/60 p-4 sm:flex-row sm:items-center dark:border-studio-800 dark:bg-studio-950/60">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">{session.name}</h2>
                      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        {session.category}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {session.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {formatFullTrainerDate(session.date)} · {formatTime12h(session.startTime)} – {formatTime12h(session.endTime)} · {session.room || 'Studio Floor'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span className="font-bold text-rose-700 dark:text-rose-400">{presentCount}</span> / {classBookings.length} Checked In
                    </span>
                    <Link
                      href={`/trainer/attendance?classId=${session.id}`}
                      className="rounded-xl bg-[#E11D48] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700"
                    >
                      Open Roster
                    </Link>
                  </div>
                </div>

                {/* Inline Roster Preview */}
                <div className="p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Class Roster</h3>
                  {classBookings.length === 0 ? (
                    <p className="py-4 text-xs text-slate-400">No members have booked this class yet.</p>
                  ) : (
                    <div className="mt-2 divide-y divide-slate-100 dark:divide-studio-800">
                      {classBookings.map((b) => {
                        const member = memberMap.get(b.memberId);
                        const att = attendanceMap.get(b.id);
                        const isPresent = att?.status === 'Present';
                        const isAbsent = att?.status === 'Absent';
                        const isBusy = busyBookingId === b.id;

                        return (
                          <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                                {member?.fullName?.slice(0, 2).toUpperCase() || 'MB'}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-slate-900 dark:text-white">{member?.fullName || 'Member'}</p>
                                <p className="text-[10px] text-slate-400">{member?.plan || 'Standard'}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {isPresent ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                  ✓ Present
                                </span>
                              ) : isAbsent ? (
                                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                  ✕ Absent
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-studio-800">
                                  Pending
                                </span>
                              )}

                              <button
                                type="button"
                                disabled={isBusy || isPresent}
                                onClick={() => handleMarkAttendance(b.id, 'Present')}
                                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-50 cursor-pointer ${
                                  isPresent
                                    ? 'bg-emerald-700 text-white ring-1 ring-emerald-500'
                                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                }`}
                              >
                                {isBusy ? 'Saving…' : 'Mark Present'}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || isAbsent}
                                onClick={() => handleMarkAttendance(b.id, 'Absent')}
                                className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold transition disabled:opacity-50 cursor-pointer ${
                                  isAbsent
                                    ? 'border-rose-600 bg-rose-600 text-white ring-1 ring-rose-500'
                                    : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300'
                                }`}
                              >
                                Absent
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
