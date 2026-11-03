'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ApiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FilterIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { ArrowRight, Dumbbell, MapPin, Sparkles, UserCheck } from 'lucide-react';

interface SessionItem {
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
  bookedCount?: number;
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

export default function StaffClassesPage() {
  const { addToast } = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(localDateIso());
  const [trainerFilter, setTrainerFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const todayIso = localDateIso();

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getFrontDeskOverview();
      const sessionList = overview.sessions || [];
      const bookings = overview.bookings || [];

      // Calculate real confirmed booking count per session
      const bookingCounts = new Map<string, number>();
      bookings.forEach((b) => {
        if (b.status?.toLowerCase() === 'confirmed') {
          bookingCounts.set(b.classId, (bookingCounts.get(b.classId) || 0) + 1);
        }
      });

      const enriched: SessionItem[] = sessionList.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category || 'Fitness',
        date: s.date || todayIso,
        startTime: s.startTime || '07:00',
        endTime: s.endTime || '08:00',
        trainer: s.trainer || 'Staff Coach',
        room: s.room || 'Studio A',
        capacity: s.capacity || 14,
        status: s.status || 'Scheduled',
        bookedCount: bookingCounts.get(s.id) || 0,
      }));

      setSessions(enriched);
    } catch (err: any) {
      setError(err.message || 'Unable to load class schedule.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Unique trainers and categories from real backend data
  const trainers = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.trainer).filter(Boolean))).sort();
  }, [sessions]);

  const categories = useMemo(() => {
    return Array.from(new Set(sessions.map((s) => s.category).filter(Boolean))).sort();
  }, [sessions]);

  // Filtered sessions for selected date and criteria
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      // Date filter
      if (selectedDate && normalizeDateIso(s.date) !== selectedDate) {
        return false;
      }

      // Trainer filter
      if (trainerFilter !== 'All' && s.trainer.toLowerCase() !== trainerFilter.toLowerCase()) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'All' && s.category.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const str = `${s.name} ${s.trainer} ${s.room || ''} ${s.category}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [sessions, selectedDate, trainerFilter, categoryFilter, search]);

  // Summary Metrics (Real database values)
  const scheduledOnDate = filteredSessions.length;
  const totalCapacityOnDate = filteredSessions.reduce((sum, s) => sum + s.capacity, 0);
  const totalBookedOnDate = filteredSessions.reduce((sum, s) => sum + (s.bookedCount || 0), 0);
  const activeTrainersCount = new Set(filteredSessions.map((s) => s.trainer)).size;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Class &amp; Session Schedule
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            View scheduled studio sessions, assigned coach assignments, room allocations, and live capacity.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
          <span>Refresh Schedule</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Date Navigation Bar (Exact same layout as Trainer Dashboard) */}
      <section
        aria-label="Schedule date selector"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon size="xs" className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Roster for: <span className="text-rose-600 font-semibold">{formatFullDate(selectedDate)}</span>
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

      {/* 4 Pastel Statistic Cards */}
      <section aria-label="Schedule statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Scheduled Sessions – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Scheduled Sessions
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {scheduledOnDate}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <CalendarIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Sessions on selected date
          </p>
        </div>

        {/* Metric 2: Assigned Trainers – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Assigned Trainers
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {activeTrainersCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Coaches scheduled to teach
          </p>
        </div>

        {/* Metric 3: Confirmed Reservations – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Confirmed Bookings
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {totalBookedOnDate}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Seats reserved by members
          </p>
        </div>

        {/* Metric 4: Studio Floor Capacity – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Total Spot Capacity
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {totalCapacityOnDate}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <ClockIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-purple-700/85 dark:text-purple-300/85">
            Maximum seats available
          </p>
        </div>
      </section>

      {/* Search and Filters */}
      <section
        aria-label="Class search and filter controls"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="relative">
          <SearchIcon size="xs" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search session, trainer, room..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div>
          <select
            aria-label="Filter by assigned trainer"
            value={trainerFilter}
            onChange={(e) => setTrainerFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
          >
            <option value="All">All Assigned Trainers</option>
            {trainers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            aria-label="Filter by class category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Scheduled Sessions Roster List */}
      <section
        aria-label="Scheduled classes roster"
        className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="border-b border-slate-100 pb-4 dark:border-studio-800 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
              Daily Class Sessions &amp; Trainer Assignments
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Scheduled workouts, rooms, assigned instructors, and real-time attendance rosters
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {filteredSessions.length} session{filteredSessions.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.map((session) => {
            const booked = session.bookedCount || 0;
            const occupancyPct = session.capacity > 0 ? Math.min(100, Math.round((booked / session.capacity) * 100)) : 0;

            return (
              <div
                key={session.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-[#FCFAF8] p-5 shadow-2xs transition hover:border-rose-200 hover:shadow-xs dark:border-studio-700 dark:bg-studio-950/40"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-md bg-rose-100 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                      {session.category}
                    </span>
                    <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-studio-800 dark:text-slate-300">
                      {session.room || 'Studio A'}
                    </span>
                  </div>

                  <h3 className="mt-2 font-serif text-base font-bold text-slate-900 dark:text-white">
                    {session.name}
                  </h3>

                  <div className="mt-2.5 space-y-1.5 text-xs">
                    <p className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold">
                      <ClockIcon size="xs" className="text-rose-600 shrink-0" />
                      <span>{formatTime12h(session.startTime)} – {formatTime12h(session.endTime)}</span>
                    </p>

                    <p className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <UsersIcon size="xs" className="text-slate-400 shrink-0" />
                      <span>
                        Trainer: <strong className="text-slate-900 dark:text-white font-semibold">{session.trainer || 'Unassigned'}</strong>
                      </span>
                    </p>
                  </div>
                </div>

                <div className="mt-5 pt-3.5 border-t border-slate-200/70 dark:border-studio-800">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                    <span>Confirmed Bookings</span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {booked} / {session.capacity} spots
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-studio-800 overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full bg-rose-600 transition-all duration-300"
                      style={{ width: `${occupancyPct}%` }}
                    />
                  </div>

                  <Link
                    href={`/staff/class-attendance?classId=${encodeURIComponent(session.id)}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-xs font-bold text-slate-700 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 cursor-pointer"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Open Attendance Roster</span>
                  </Link>
                </div>
              </div>
            );
          })}

          {filteredSessions.length === 0 && (
            <div className="col-span-full py-12 text-center text-xs text-slate-400">
              <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                No sessions found for this date
              </p>
              <p className="mt-1">
                Select another date or adjust your trainer and category filters.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
