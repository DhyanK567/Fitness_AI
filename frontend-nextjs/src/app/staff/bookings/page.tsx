'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  LayersIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
  XCircleIcon,
} from '@/components/ui/icons';
import { Check, Loader2, Sparkles, UserCheck, X } from 'lucide-react';

interface BookingRecord {
  id: string;
  classId: string;
  memberId: string;
  status: string;
  bookedAt: string;
}

interface MemberRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
}

interface ClassSession {
  id: string;
  name: string;
  category: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  trainer: string;
  capacity?: number;
}

function formatTime12h(time?: string | null): string {
  if (!time) return 'TBD';
  const [hStr = '0', mStr = '00'] = time.split(':');
  const h = parseInt(hStr, 10);
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hour12}:${mStr} ${ampm}`;
}

export default function StaffBookingsPage() {
  const { addToast } = useToast();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [members, setMembers] = useState<MemberRecord[]>([]);
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Confirmed' | 'Waitlisted' | 'Cancelled'>('All');
  const [displayCount, setDisplayCount] = useState(10);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // New Booking Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMemberSearch, setModalMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const overview = await ApiClient.getFrontDeskOverview();
      setBookings(overview.bookings || []);
      setMembers(overview.members || []);
      setSessions(overview.sessions || []);

      if (overview.sessions?.length && !selectedClassId) {
        setSelectedClassId(overview.sessions[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load booking records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const sessionMap = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);

  // Action: Accept booking (Promote waitlist to Confirmed)
  async function handleAcceptBooking(id: string) {
    setActionBusyId(id);
    try {
      await ApiClient.updateBookingStatus(id, 'confirmed');
      addToast({
        type: 'success',
        title: 'Booking Accepted',
        message: 'Member reservation has been confirmed in the database.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Unable to confirm booking.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  // Action: Reject booking (Set status to Cancelled)
  async function handleRejectBooking(id: string) {
    if (!confirm('Reject this booking request? Status will be updated to Cancelled.')) return;
    setActionBusyId(id);
    try {
      await ApiClient.updateBookingStatus(id, 'cancelled');
      addToast({
        type: 'info',
        title: 'Booking Rejected',
        message: 'Reservation request has been rejected and cancelled.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Unable to reject booking.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  // Action: Cancel booking
  async function handleCancelBooking(id: string) {
    if (!confirm('Cancel this confirmed reservation?')) return;
    setActionBusyId(id);
    try {
      await ApiClient.cancelBooking(id);
      addToast({
        type: 'info',
        title: 'Reservation Cancelled',
        message: 'Booking status updated to Cancelled.',
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Cancellation Failed',
        message: err.message || 'Unable to cancel booking.',
      });
    } finally {
      setActionBusyId(null);
    }
  }

  // Action: Create new booking for an existing member
  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMemberId || !selectedClassId) {
      addToast({ type: 'error', title: 'Selection Missing', message: 'Please select an existing member and class.' });
      return;
    }

    setCreating(true);
    try {
      await ApiClient.createBooking({
        class_schedule_id: selectedClassId,
        member_id: selectedMemberId,
        booking_date: new Date().toISOString().slice(0, 10),
      });
      addToast({
        type: 'success',
        title: 'Booking Created',
        message: 'Member has been booked into the session roster.',
      });
      setIsModalOpen(false);
      setSelectedMemberId('');
      setModalMemberSearch('');
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Booking Error',
        message: err.message || 'Unable to complete booking reservation.',
      });
    } finally {
      setCreating(false);
    }
  }

  // Filtered members for Add Modal
  const modalFilteredMembers = useMemo(() => {
    if (!modalMemberSearch.trim()) return members.slice(0, 6);
    const q = modalMemberSearch.toLowerCase();
    return members
      .filter((m) => m.fullName?.toLowerCase().includes(q) || m.phone?.includes(q) || m.email?.toLowerCase().includes(q))
      .slice(0, 6);
  }, [members, modalMemberSearch]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const member = memberMap.get(b.memberId);
      const session = sessionMap.get(b.classId);

      // Status filter
      if (statusFilter !== 'All') {
        const bStatus = (b.status || '').toLowerCase();
        if (statusFilter === 'Confirmed' && bStatus !== 'confirmed') return false;
        if (statusFilter === 'Waitlisted' && bStatus !== 'waitlisted') return false;
        if (statusFilter === 'Cancelled' && bStatus !== 'cancelled') return false;
      }

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const str = `${member?.fullName || ''} ${member?.phone || ''} ${session?.name || ''} ${session?.trainer || ''}`.toLowerCase();
        if (!str.includes(q)) return false;
      }

      return true;
    });
  }, [bookings, statusFilter, search, memberMap, sessionMap]);

  const pagedBookings = useMemo(() => {
    return filteredBookings.slice(0, displayCount);
  }, [filteredBookings, displayCount]);

  // Statistics
  const totalCount = bookings.length;
  const confirmedCount = bookings.filter((b) => b.status?.toLowerCase() === 'confirmed').length;
  const waitlistedCount = bookings.filter((b) => b.status?.toLowerCase() === 'waitlisted').length;
  const cancelledCount = bookings.filter((b) => b.status?.toLowerCase() === 'cancelled').length;

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Bookings
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Review real-time class booking requests, accept waitlisted spots, and manage session cancellations.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
          >
            <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 cursor-pointer"
          >
            <PlusIcon size="xs" />
            <span>Book Member</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* 4 Pastel Statistic Cards */}
      <section aria-label="Booking statistics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Reservations – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Total Reservations
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {totalCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <LayersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            All reservation records
          </p>
        </div>

        {/* Metric 2: Confirmed Seats – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Confirmed Seats
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {confirmedCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Active session seats
          </p>
        </div>

        {/* Metric 3: Pending Waitlist – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Pending Requests
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {waitlistedCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <ClockIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-purple-700/85 dark:text-purple-300/85">
            Awaiting acceptance
          </p>
        </div>

        {/* Metric 4: Cancelled Records – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Cancelled
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {cancelledCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <XCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Historical cancellations
          </p>
        </div>
      </section>

      {/* Search and Filters Section */}
      <section
        aria-label="Booking search and filter controls"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="relative flex-1">
          <SearchIcon size="xs" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search bookings by member name, phone, class session..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDisplayCount(10);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', 'Confirmed', 'Waitlisted', 'Cancelled'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                setStatusFilter(filter);
                setDisplayCount(10);
              }}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
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

      {/* Bookings Table */}
      <section
        aria-label="Bookings roster table"
        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Member</th>
                <th className="px-4 py-3.5">Class / Session</th>
                <th className="px-4 py-3.5">Date &amp; Time</th>
                <th className="px-4 py-3.5">Booked Timestamp</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {pagedBookings.map((b) => {
                const member = memberMap.get(b.memberId);
                const session = sessionMap.get(b.classId);
                const isWaitlisted = b.status?.toLowerCase() === 'waitlisted';
                const isConfirmed = b.status?.toLowerCase() === 'confirmed';
                const isCancelled = b.status?.toLowerCase() === 'cancelled';
                const isBusy = actionBusyId === b.id;

                return (
                  <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900 dark:text-white">{member?.fullName || 'Member'}</p>
                      <p className="text-[10px] text-slate-400">
                        {member?.phone ? formatIndianMobile(member.phone) : '—'} · {member?.email}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{session?.name || 'Session'}</p>
                      <p className="text-[10px] text-slate-400">Coach: {session?.trainer || 'Coach'}</p>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-700 dark:text-slate-300">
                      <p className="font-medium">{session?.date}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatTime12h(session?.startTime)} – {formatTime12h(session?.endTime)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums text-slate-500 dark:text-slate-400 text-[11px]">
                      {b.bookedAt?.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isConfirmed
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : isWaitlisted
                            ? 'bg-purple-50 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300'
                            : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isConfirmed ? 'bg-emerald-500' : isWaitlisted ? 'bg-purple-500' : 'bg-rose-500'
                          }`}
                        />
                        <span>{b.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isWaitlisted && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleAcceptBooking(b.id)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                            >
                              {isBusy ? 'Processing...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRejectBooking(b.id)}
                              className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 transition cursor-pointer dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300"
                            >
                              Reject
                            </button>
                          </>
                        )}

                        {isConfirmed && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleCancelBooking(b.id)}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 transition cursor-pointer dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
                          >
                            {isBusy ? 'Cancelling...' : 'Cancel'}
                          </button>
                        )}

                        {isCancelled && (
                          <span className="text-[10px] text-slate-400 font-medium py-1 px-2">Archived</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredBookings.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-slate-400">
                    <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                      No reservations found
                    </p>
                    <p className="mt-1">
                      {search.trim() ? 'No bookings match your search query.' : 'No booking records in the studio database.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredBookings.length > displayCount && (
          <div className="flex justify-center border-t border-slate-100 p-4 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + 10)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 cursor-pointer"
            >
              <span>See More ({filteredBookings.length - displayCount} remaining)</span>
            </button>
          </div>
        )}
      </section>

      {/* Book Member Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Session Reservation"
        size="md"
      >
        <form onSubmit={handleCreateBooking} className="space-y-4 pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select an existing registered member and scheduled class session to record a new booking.
          </p>

          {/* Member Search / Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select Member <span className="text-rose-600">*</span>
            </label>
            <div className="relative mb-2">
              <SearchIcon size="xs" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search member by name or phone..."
                value={modalMemberSearch}
                onChange={(e) => setModalMemberSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
              />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 dark:border-studio-700 dark:divide-studio-800">
              {modalFilteredMembers.map((m) => {
                const isSelected = selectedMemberId === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMemberId(m.id)}
                    className={`w-full flex items-center justify-between p-2.5 text-left text-xs transition cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50 text-rose-900 font-bold dark:bg-rose-950/40 dark:text-rose-200'
                        : 'hover:bg-slate-50 dark:hover:bg-studio-800'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{m.fullName}</p>
                      <p className="text-[10px] text-slate-400">{m.phone} · {m.email}</p>
                    </div>
                    {isSelected && <span className="text-[10px] font-bold text-rose-600">Selected</span>}
                  </button>
                );
              })}
              {modalFilteredMembers.length === 0 && (
                <p className="p-3 text-center text-xs text-slate-400">No members match search query.</p>
              )}
            </div>
          </div>

          {/* Class Session Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              Select Scheduled Class Session <span className="text-rose-600">*</span>
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 cursor-pointer"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.date} ({formatTime12h(s.startTime)}) · Trainer: {s.trainer}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !selectedMemberId || !selectedClassId}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Confirm Reservation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
