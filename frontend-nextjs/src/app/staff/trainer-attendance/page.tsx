'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
  XCircleIcon,
} from '@/components/ui/icons';
import { AlertCircle, AlertTriangle, ArrowRight, Check, Eye, UserCheck } from 'lucide-react';

interface ClassSession {
  id: string;
  name: string;
  category: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  trainer: string;
  room?: string | null;
  capacity: number;
  status: string;
}

interface BookingRecord {
  id: string;
  classId: string;
  memberId: string;
  status: string;
}

interface AttendanceRecord {
  id: string;
  bookingId: string;
  status: string;
  checkedInAt?: string | null;
}

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

export default function StaffTrainerAttendancePage() {
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(localDateIso());
  const [trainerFilter, setTrainerFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Recorded' | 'Missed' | 'Upcoming'>('All');

  const todayIso = localDateIso();

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getFrontDeskOverview();
      setSessions(overview.sessions || []);
      setBookings(overview.bookings || []);
      setAttendance(overview.attendance || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load trainer session attendance.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const attendanceByBooking = useMemo(
    () => new Map(attendance.map((a) => [a.bookingId, a])),
    [attendance]
  );

  // Unique trainers from real sessions
  const allTrainers = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.trainer).filter(Boolean))).sort();
  }, [sessions]);

  // Compute attendance status for each session
  const sessionAttendanceList = useMemo(() => {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    return sessions
      .filter((s) => normalizeDateIso(s.date) === selectedDate)
      .map((session) => {
        const sessionBookings = bookings.filter((b) => b.classId === session.id);
        const attendedBookings = sessionBookings.filter((b) => {
          const rec = attendanceByBooking.get(b.id);
          return rec?.status === 'Present';
        });

        // Determine if scheduled time has passed
        const [h = '0', m = '0'] = (session.startTime || '07:00').split(':');
        const startMins = parseInt(h, 10) * 60 + parseInt(m, 10);
        const [endH = '0', endM = '0'] = (session.endTime || '08:00').split(':');
        const endMins = parseInt(endH, 10) * 60 + parseInt(endM, 10);

        const isPastDate = selectedDate < todayIso;
        const isFutureDate = selectedDate > todayIso;
        const isToday = selectedDate === todayIso;

        const hasAttendance = attendedBookings.length > 0;

        let trainerStatus: 'Recorded' | 'Missed' | 'In Progress' | 'Upcoming' = 'Upcoming';

        if (isPastDate) {
          trainerStatus = hasAttendance ? 'Recorded' : 'Missed';
        } else if (isFutureDate) {
          trainerStatus = 'Upcoming';
        } else {
          // Today
          if (hasAttendance) {
            trainerStatus = 'Recorded';
          } else if (currentMins >= endMins || (currentMins > startMins + 20 && !hasAttendance)) {
            trainerStatus = 'Missed';
          } else if (currentMins >= startMins && currentMins < endMins) {
            trainerStatus = 'In Progress';
          } else {
            trainerStatus = 'Upcoming';
          }
        }

        return {
          session,
          trainer: session.trainer || 'Unassigned Coach',
          bookedCount: sessionBookings.length,
          presentCount: attendedBookings.length,
          trainerStatus,
          isMissed: trainerStatus === 'Missed',
        };
      });
  }, [sessions, bookings, attendanceByBooking, selectedDate, todayIso]);

  // Filtered session list
  const filteredList = useMemo(() => {
    return sessionAttendanceList.filter((item) => {
      if (trainerFilter !== 'All' && item.trainer.toLowerCase() !== trainerFilter.toLowerCase()) {
        return false;
      }

      if (statusFilter === 'Recorded' && item.trainerStatus !== 'Recorded') return false;
      if (statusFilter === 'Missed' && item.trainerStatus !== 'Missed') return false;
      if (statusFilter === 'Upcoming' && item.trainerStatus !== 'Upcoming' && item.trainerStatus !== 'In Progress') {
        return false;
      }

      return true;
    });
  }, [sessionAttendanceList, trainerFilter, statusFilter]);

  // Metrics
  const totalScheduled = sessionAttendanceList.length;
  const recordedCount = sessionAttendanceList.filter((s) => s.trainerStatus === 'Recorded').length;
  const missedCount = sessionAttendanceList.filter((s) => s.trainerStatus === 'Missed').length;
  const activeTrainersOnDate = new Set(sessionAttendanceList.map((s) => s.trainer)).size;

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Trainer Attendance Monitoring
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Monitor coach attendance for scheduled studio sessions, detect missed attendance, and verify completed rosters.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Date Navigation Bar */}
      <section
        aria-label="Attendance date selector"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon size="xs" className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Monitoring for: <span className="text-rose-600 font-semibold">{formatFullDate(selectedDate)}</span>
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
            aria-label="Select custom attendance monitoring date"
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(e.target.value);
            }}
            className="h-8 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
          />
        </div>
      </section>

      {/* 4 Pastel Statistic Cards */}
      <section aria-label="Trainer attendance metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Scheduled Sessions – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Scheduled Sessions
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {totalScheduled}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <CalendarIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Total assigned sessions
          </p>
        </div>

        {/* Metric 2: Recorded & Verified – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Attendance Recorded
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {recordedCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Sessions with attendance marked
          </p>
        </div>

        {/* Metric 3: Missed Attendance – Soft Lavender / Amber */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF5F5] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Missed Attendance
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {missedCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Sessions past without attendance
          </p>
        </div>

        {/* Metric 4: Active Coaches – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Trainers on Duty
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {activeTrainersOnDate}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Instructors scheduled on floor
          </p>
        </div>
      </section>

      {/* Missed Attendance Alert Banner */}
      {missedCount > 0 && (
        <section
          aria-label="Missed attendance warning"
          className="flex items-center gap-3.5 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 shadow-2xs dark:border-rose-900/60 dark:bg-rose-950/30"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300">
            <AlertCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
              {missedCount} Missed Session Attendance Alert{missedCount === 1 ? '' : 's'}
            </h4>
            <p className="text-[11px] text-rose-800/85 dark:text-rose-300/85 mt-0.5">
              Scheduled session times have passed without recorded member attendance or trainer check-in. This data is synced live with the Admin Dashboard.
            </p>
          </div>
        </section>
      )}

      {/* Filter Bar */}
      <section
        aria-label="Filter trainer attendance"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="w-full sm:w-64">
          <select
            aria-label="Filter by trainer"
            value={trainerFilter}
            onChange={(e) => setTrainerFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
          >
            <option value="All">All Assigned Trainers</option>
            {allTrainers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', 'Recorded', 'Missed', 'Upcoming'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                statusFilter === filter
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-300'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </section>

      {/* Trainer Attendance Monitoring Table */}
      <section
        aria-label="Trainer session attendance table"
        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Assigned Trainer</th>
                <th className="px-4 py-3.5">Session Name</th>
                <th className="px-4 py-3.5">Scheduled Time</th>
                <th className="px-4 py-3.5">Room / Area</th>
                <th className="px-4 py-3.5">Roster Check-ins</th>
                <th className="px-4 py-3.5">Attendance Status</th>
                <th className="px-5 py-3.5 text-right">Roster Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {filteredList.map((item) => {
                const s = item.session;
                const isMissed = item.trainerStatus === 'Missed';
                const isRecorded = item.trainerStatus === 'Recorded';
                const isInProgress = item.trainerStatus === 'In Progress';

                return (
                  <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{item.trainer}</p>
                      <p className="text-[10px] text-slate-400">Assigned Studio Coach</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{s.name}</p>
                      <p className="text-[10px] text-slate-400">{s.category}</p>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-700 dark:text-slate-300">
                      {formatTime12h(s.startTime)} – {formatTime12h(s.endTime)}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                      {s.room || 'Studio A'}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <span className="font-semibold text-slate-900 dark:text-white">{item.presentCount}</span>
                      <span className="text-slate-400"> / {item.bookedCount} members</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {isRecorded && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>Attendance Recorded</span>
                        </span>
                      )}
                      {isMissed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <AlertTriangle className="h-3 w-3 text-rose-600" />
                          <span>Missed Attendance</span>
                        </span>
                      )}
                      {isInProgress && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                          <span>In Progress</span>
                        </span>
                      )}
                      {item.trainerStatus === 'Upcoming' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-studio-800 dark:text-slate-300">
                          <ClockIcon size="xs" />
                          <span>Upcoming Session</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/staff/class-attendance?classId=${encodeURIComponent(s.id)}`}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        <span>View Roster</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}

              {filteredList.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                      No sessions on this date
                    </p>
                    <p className="mt-1">
                      No trainer class sessions scheduled for {formatFullDate(selectedDate)}.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
