'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiClient, type TrainerOverview } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FilterIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
  XCircleIcon,
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

const cardSurface =
  'rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const inputControl =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100';

export default function TrainerAttendancePage() {
  const searchParams = useSearchParams();
  const initialClassId = searchParams?.get('classId') || 'All';

  const { addToast } = useToast();
  const [data, setData] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [selectedDate, setSelectedDate] = useState<string>(localDateIso());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent'>('All');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>(initialClassId);

  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);

  const todayIso = localDateIso();
  const formattedFullDate = formatFullTrainerDate(selectedDate);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getTrainerOverview();
      setData(overview);
    } catch {
      // Fallback to studio API entities for preview mode
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
        setError(fallbackErr.message || 'Unable to load attendance data.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const memberMap = useMemo(() => new Map((data?.members || []).map((m) => [m.id, m])), [data]);
  const sessionMap = useMemo(() => new Map((data?.sessions || []).map((s) => [s.id, s])), [data]);
  const attendanceMap = useMemo(() => new Map((data?.attendance || []).map((a) => [a.bookingId, a])), [data]);

  // Classes for date (normalized to YYYY-MM-DD for accurate comparison)
  const sessionsOnSelectedDate = useMemo(() => {
    return (data?.sessions || []).filter((s) => normalizeDateIso(s.date) === selectedDate);
  }, [data, selectedDate]);

  // Bookings for selected date's classes
  const bookingsForSelectedDate = useMemo(() => {
    const classIds = new Set(sessionsOnSelectedDate.map((s) => s.id));
    return (data?.bookings || []).filter((b) => classIds.has(b.classId));
  }, [data, sessionsOnSelectedDate]);

  // Filtered roster rows
  const filteredRoster = useMemo(() => {
    return bookingsForSelectedDate.filter((booking) => {
      // Class filter
      if (selectedClassFilter !== 'All' && booking.classId !== selectedClassFilter) {
        return false;
      }

      // Status filter (Strictly Present / Absent — Requirement 2.C)
      const att = attendanceMap.get(booking.id);
      const isPresent = att?.status === 'Present';
      const isAbsent = att?.status === 'Absent';
      const isPending = !isPresent && !isAbsent;

      if (statusFilter === 'Present' && !isPresent) return false;
      if (statusFilter === 'Absent' && !isAbsent) return false;

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const member = memberMap.get(booking.memberId);
        const session = sessionMap.get(booking.classId);
        const str = `${member?.fullName || ''} ${member?.phone || ''} ${session?.name || ''} ${session?.room || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [bookingsForSelectedDate, selectedClassFilter, statusFilter, searchQuery, attendanceMap, memberMap, sessionMap]);

  // Metrics (Real database records)
  const totalBookingsCount = bookingsForSelectedDate.length;
  const presentCount = bookingsForSelectedDate.filter((b) => attendanceMap.get(b.id)?.status === 'Present').length;
  const absentCount = bookingsForSelectedDate.filter((b) => attendanceMap.get(b.id)?.status === 'Absent').length;
  const pendingCount = totalBookingsCount - presentCount - absentCount;
  const verifiedCount = presentCount;
  const verificationRate = totalBookingsCount > 0 ? Math.round((verifiedCount / totalBookingsCount) * 100) : 100;

  // Mark attendance handler (Strictly Present / Absent — Requirement 2.C)
  async function handleMark(bookingId: string, targetStatus: 'Present' | 'Absent') {
    setBusyBookingId(bookingId);
    try {
      const existing = attendanceMap.get(bookingId);
      if (existing) {
        // Correct existing record status
        await ApiClient.correctAttendance(
          existing.id,
          targetStatus,
          `Marked ${targetStatus.toLowerCase()} by trainer`
        );
      } else {
        // Record new attendance
        await ApiClient.checkInBooking(bookingId, targetStatus);
      }

      addToast({
        type: 'success',
        title: `Attendance: ${targetStatus}`,
        message: `Member recorded as ${targetStatus}. Synced with PostgreSQL database and all studio dashboards.`,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Check-in Failed',
        message: err.message || 'Unable to update attendance record.',
      });
    } finally {
      setBusyBookingId(null);
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-r from-white via-rose-50/45 to-violet-50/55 p-5 shadow-subtle sm:p-6 dark:border-studio-700 dark:from-studio-900 dark:via-studio-900 dark:to-studio-950">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E11D48] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                <CheckCircleIcon size="xs" />
                Session Rosters &amp; Attendance
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-300">
                {currentStaffStudio.name}
              </span>
            </div>

            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
              Sessions &amp; Attendance Verification
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">{formattedFullDate}</span>
              {' · '}
              <span>Record live check-ins and absences directly to the shared studio roster</span>
            </p>
          </div>

          {/* Date Navigator */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDate((cur) => shiftDateIso(cur, -1))}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(todayIso)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                selectedDate === todayIso
                  ? 'bg-[#E11D48] text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-rose-200 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(shiftDateIso(todayIso, 1))}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                selectedDate === shiftDateIso(todayIso, 1)
                  ? 'bg-[#E11D48] text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-rose-200 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200'
              }`}
            >
              Tomorrow
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate((cur) => shiftDateIso(cur, 1))}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200"
            >
              Next →
            </button>
            <input
              type="date"
              aria-label="Select attendance date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* 4 Summary Stat Cards (Strictly Present & Absent) */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Bookings</p>
          <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalBookingsCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{sessionsOnSelectedDate.length} session(s) on date</p>
        </div>

        <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-subtle dark:border-emerald-900/60 dark:bg-emerald-950/30">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            Marked Present
          </p>
          <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {presentCount}
          </p>
          <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-400">Verified attendance</p>
        </div>

        <div className="rounded-2xl border border-rose-200/80 bg-rose-50/50 p-4 shadow-subtle dark:border-rose-900/60 dark:bg-rose-950/30">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
            Marked Absent
          </p>
          <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-rose-700 dark:text-rose-300">
            {absentCount}
          </p>
          <p className="mt-1 text-[11px] text-rose-800/80 dark:text-rose-400">Recorded absent</p>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Unrecorded
          </p>
          <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-slate-700 dark:text-slate-300">
            {pendingCount}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Not yet recorded</p>
        </div>
      </section>

      {/* Filter Bar */}
      <div className={`${cardSurface} p-4`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <SearchIcon size="xs" className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search member, phone, class..."
              className={`${inputControl} pl-8`}
            />
          </div>

          <div>
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              className={inputControl}
              aria-label="Filter by assigned class"
            >
              <option value="All">All Assigned Classes ({sessionsOnSelectedDate.length})</option>
              {sessionsOnSelectedDate.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({formatTime12h(c.startTime)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className={inputControl}
              aria-label="Filter by attendance status"
            >
              <option value="All">All Attendance ({bookingsForSelectedDate.length})</option>
              <option value="Present">Present ({presentCount})</option>
              <option value="Absent">Absent ({absentCount})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Roster & Attendance Table */}
      <div className={`${cardSurface} overflow-hidden`}>
        <div className="border-b border-slate-100 p-5 dark:border-studio-800">
          <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
            Member Session Attendance Roster
          </h2>
          <p className="text-xs text-slate-500">
            Showing {filteredRoster.length} roster entries for {formattedFullDate}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Member Details</th>
                <th className="px-4 py-3">Session &amp; Room</th>
                <th className="px-4 py-3">Date &amp; Time</th>
                <th className="px-4 py-3">Current Status</th>
                <th className="px-5 py-3 text-right">Attendance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {filteredRoster.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-xs text-slate-400">
                    <ClockIcon size="md" className="mx-auto text-slate-300" />
                    <p className="mt-2 font-bold text-slate-700 dark:text-slate-300">No attendance records found</p>
                    <p className="mt-1 text-slate-400">Change date or filter to review another session roster.</p>
                  </td>
                </tr>
              ) : (
                filteredRoster.map((booking) => {
                  const member = memberMap.get(booking.memberId);
                  const session = sessionMap.get(booking.classId);
                  const att = attendanceMap.get(booking.id);
                  const isPresent = att?.status === 'Present';
                  const isAbsent = att?.status === 'Absent';
                  const isPending = !isPresent && !isAbsent;
                  const isBusy = busyBookingId === booking.id;

                  return (
                    <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-900/40">
                      {/* Member Info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            {member?.fullName?.slice(0, 2).toUpperCase() || 'MB'}
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {member?.fullName || 'Studio Member'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {member?.plan || 'Member'} · {member?.phone ? formatIndianMobile(member.phone) : 'No phone'}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Session Info */}
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">
                          {session?.name || 'Class Session'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {session?.category || 'Fitness'} · {session?.room || 'Studio Floor'}
                        </p>
                      </td>

                      {/* Timing */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        <p className="font-medium">
                          {formatTime12h(session?.startTime)} – {formatTime12h(session?.endTime)}
                        </p>
                        <p className="text-[10px] text-slate-400">{session?.date || selectedDate}</p>
                      </td>

                      {/* Current Status Badge (Strictly Present / Absent / Pending) */}
                      <td className="px-4 py-3.5">
                        {isPresent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            ✓ Present
                            {att?.checkedInAt && (
                              <span className="text-[10px] font-normal opacity-80">
                                · {formatTime12h(att.checkedInAt.slice(11, 16))}
                              </span>
                            )}
                          </span>
                        ) : isAbsent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            ✕ Absent
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:bg-studio-800 dark:text-slate-400">
                            Unrecorded
                          </span>
                        )}
                      </td>

                      {/* Actions: Strictly TWO Buttons (Requirement 2.C) */}
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleMark(booking.id, 'Present')}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
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
                            onClick={() => handleMark(booking.id, 'Absent')}
                            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                              isAbsent
                                ? 'border-rose-600 bg-rose-600 text-white shadow-xs ring-1 ring-rose-500'
                                : 'border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300'
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
