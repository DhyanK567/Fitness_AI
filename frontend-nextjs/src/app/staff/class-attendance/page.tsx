'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiClient } from '@/lib/api-client';
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
import { Check, CheckCheck, Loader2, MapPin, Sparkles, UserCheck, X } from 'lucide-react';

interface AttendanceRecord {
  id: string;
  bookingId: string;
  status: string;
  checkedInAt?: string | null;
}

interface BookingRecord {
  id: string;
  classId: string;
  memberId: string;
  status: string;
}

interface MemberRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  plan: string;
}

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
}

function formatTime12h(time?: string | null): string {
  if (!time) return 'TBD';
  const [hStr = '0', mStr = '00'] = time.split(':');
  const h = parseInt(hStr, 10);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${mStr} ${ampm}`;
}

export default function StaffClassAttendancePage() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const queryClassId = searchParams.get('classId');

  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyBookingId, setBusyBookingId] = useState<string | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Present' | 'Absent'>('All');

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getFrontDeskOverview();
      const sessionList = overview.sessions || [];
      setSessions(sessionList);
      setBookings(overview.bookings || []);
      setMembers(overview.members || []);
      setAttendance(overview.attendance || []);

      if (queryClassId && sessionList.some((s) => s.id === queryClassId)) {
        setSelectedSessionId(queryClassId);
      } else if (sessionList.length > 0 && !selectedSessionId) {
        setSelectedSessionId(sessionList[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load attendance roster.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [queryClassId]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const attendanceMap = useMemo(() => new Map(attendance.map((a) => [a.bookingId, a])), [attendance]);
  const activeSession = useMemo(() => sessions.find((s) => s.id === selectedSessionId), [sessions, selectedSessionId]);

  // Bookings for the selected session
  const sessionBookings = useMemo(() => {
    return bookings.filter(
      (b) => b.classId === selectedSessionId && b.status?.toLowerCase() !== 'cancelled'
    );
  }, [bookings, selectedSessionId]);

  // Filtered roster for table
  const filteredRoster = useMemo(() => {
    return sessionBookings.filter((b) => {
      const att = attendanceMap.get(b.id);
      const isPresent = att?.status === 'Present';
      const isAbsent = att?.status === 'Absent';

      if (statusFilter === 'Present' && !isPresent) return false;
      if (statusFilter === 'Absent' && !isAbsent) return false;

      if (memberSearch.trim()) {
        const m = memberMap.get(b.memberId);
        const name = m?.fullName || '';
        const phone = m?.phone || '';
        const email = m?.email || '';
        const q = memberSearch.toLowerCase();
        return name.toLowerCase().includes(q) || phone.includes(q) || email.toLowerCase().includes(q);
      }

      return true;
    });
  }, [sessionBookings, memberSearch, statusFilter, attendanceMap, memberMap]);

  // Strict attendance metrics: ONLY Present and Absent (Section 5.E)
  const totalRosterCount = sessionBookings.length;
  const presentCount = sessionBookings.filter((b) => attendanceMap.get(b.id)?.status === 'Present').length;
  const absentCount = sessionBookings.filter((b) => attendanceMap.get(b.id)?.status === 'Absent').length;
  const pendingCount = totalRosterCount - presentCount - absentCount;

  // Mark attendance (Strictly PRESENT / ABSENT)
  async function handleMarkAttendance(bookingId: string, targetStatus: 'Present' | 'Absent') {
    setBusyBookingId(bookingId);
    try {
      const existing = attendanceMap.get(bookingId);
      if (existing) {
        await ApiClient.correctAttendance(
          existing.id,
          targetStatus,
          `Front desk marked ${targetStatus}`
        );
      } else {
        await ApiClient.checkInBooking(bookingId, targetStatus);
      }

      addToast({
        type: 'success',
        title: `Attendance Marked: ${targetStatus}`,
        message: 'Attendance record saved to studio database.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to update attendance record.',
      });
    } finally {
      setBusyBookingId(null);
    }
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Check-in &amp; Attendance
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Verify member attendance for scheduled studio sessions. Attendance statuses are strictly Present or Absent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
          <span>Refresh Roster</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Session Selector Strip */}
      <section
        aria-label="Session selector"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon size="xs" className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
            Select Class Session:
          </span>
        </div>

        <select
          aria-label="Choose active class session"
          value={selectedSessionId}
          onChange={(e) => setSelectedSessionId(e.target.value)}
          className="h-10 w-full sm:w-auto min-w-[280px] rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.date} ({formatTime12h(s.startTime)}) · {s.trainer}
            </option>
          ))}
        </select>
      </section>

      {/* 4 Pastel Statistic Cards (Section 5.E: Strictly Present / Absent) */}
      <section aria-label="Attendance statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Booked – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Total Reserved
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {totalRosterCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Confirmed session roster
          </p>
        </div>

        {/* Metric 2: Present – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Present
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {presentCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Verified in attendance
          </p>
        </div>

        {/* Metric 3: Absent – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Absent
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {absentCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <XCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Marked absent from session
          </p>
        </div>

        {/* Metric 4: Pending Check-in – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Pending Check-in
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {pendingCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <ClockIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-purple-700/85 dark:text-purple-300/85">
            Awaiting desk verification
          </p>
        </div>
      </section>

      {/* Active Session Detail Banner */}
      {activeSession && (
        <section
          aria-label="Active session banner"
          className="rounded-2xl border border-slate-200/80 bg-white p-4.5 shadow-2xs dark:border-studio-800 dark:bg-studio-900 flex flex-wrap items-center justify-between gap-4"
        >
          <div>
            <span className="inline-flex items-center rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
              {activeSession.category}
            </span>
            <h2 className="mt-1 font-serif text-base font-bold text-slate-900 dark:text-white">
              {activeSession.name}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Date: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeSession.date}</span> · Time: <span className="font-semibold text-slate-800 dark:text-slate-200">{formatTime12h(activeSession.startTime)} – {formatTime12h(activeSession.endTime)}</span> · Room: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeSession.room || 'Studio A'}</span> · Trainer: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeSession.trainer}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-studio-800 dark:text-slate-200">
              Roster: {totalRosterCount} / {activeSession.capacity} spots
            </span>
          </div>
        </section>
      )}

      {/* Search and Filters */}
      <section
        aria-label="Roster search controls"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="relative flex-1">
          <SearchIcon size="xs" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search member by name or phone on this roster..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1.5">
          {(['All', 'Present', 'Absent'] as const).map((filter) => (
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

      {/* Roster Table */}
      <section
        aria-label="Member attendance roster table"
        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Member Name</th>
                <th className="px-4 py-3.5">Contact</th>
                <th className="px-4 py-3.5">Membership Plan</th>
                <th className="px-4 py-3.5">Verification Status</th>
                <th className="px-5 py-3.5 text-right">Attendance Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {filteredRoster.map((booking) => {
                const member = memberMap.get(booking.memberId);
                const att = attendanceMap.get(booking.id);
                const isPresent = att?.status === 'Present';
                const isAbsent = att?.status === 'Absent';
                const isBusy = busyBookingId === booking.id;

                return (
                  <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{member?.fullName || 'Member'}</p>
                      <p className="text-[10px] text-slate-400">ID: {booking.memberId.slice(0, 8)}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono text-slate-800 dark:text-slate-200">
                        {member?.phone ? formatIndianMobile(member.phone) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{member?.email}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{member?.plan}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      {isPresent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                          <Check className="h-3 w-3 text-emerald-600" />
                          <span>Present</span>
                        </span>
                      )}
                      {isAbsent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <X className="h-3 w-3 text-rose-600" />
                          <span>Absent</span>
                        </span>
                      )}
                      {!isPresent && !isAbsent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          <ClockIcon size="xs" />
                          <span>Awaiting Check-in</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {/* Strictly two buttons: PRESENT and ABSENT */}
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={isBusy || isPresent}
                          onClick={() => handleMarkAttendance(booking.id, 'Present')}
                          className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                            isPresent
                              ? 'bg-emerald-100 text-emerald-800 opacity-60 cursor-default'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>{isBusy && !isPresent ? 'Saving...' : 'Present'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={isBusy || isAbsent}
                          onClick={() => handleMarkAttendance(booking.id, 'Absent')}
                          className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition cursor-pointer ${
                            isAbsent
                              ? 'bg-rose-100 text-rose-800 opacity-60 cursor-default'
                              : 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300 shadow-2xs'
                          }`}
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>{isBusy && isAbsent ? 'Saving...' : 'Absent'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRoster.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-xs text-slate-400">
                    <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                      No members on this roster
                    </p>
                    <p className="mt-1">
                      {memberSearch.trim() ? 'No members match your search.' : 'No members have reserved this session yet.'}
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
