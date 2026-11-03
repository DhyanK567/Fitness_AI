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
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { AlertCircle, AlertTriangle, Check, CreditCard, Mail, Phone, Sparkles, User, UserCheck, X } from 'lucide-react';

interface MemberItem {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  plan: string;
  status: string;
  joined: string;
  expiry?: string | null;
  emergencyContact?: string;
  gender?: string;
}

export default function StaffMembersPage() {
  const { addToast } = useToast();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Expiring Soon' | 'Frozen' | 'Expired'>('All');
  const [displayCount, setDisplayCount] = useState(10);
  const [selectedMember, setSelectedMember] = useState<MemberItem | null>(null);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const data = await ApiClient.getMembers();
      if (Array.isArray(data)) {
        const mapped: MemberItem[] = (data as any[]).map((m) => ({
          id: m.id,
          fullName: m.full_name || m.fullName || m.name || 'Member',
          email: m.email || '',
          phone: m.phone || '',
          plan: m.membership_id || m.plan || 'Standard Membership',
          status: m.status ? m.status.charAt(0).toUpperCase() + m.status.slice(1).toLowerCase() : 'Active',
          joined: m.join_date || m.joined || new Date().toISOString().slice(0, 10),
          expiry: m.expiry || null,
          emergencyContact: m.emergency_contact || m.emergencyContact || 'Not recorded',
          gender: m.gender || 'Not specified',
        }));
        setMembers(mapped);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load member directory.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const today = useMemo(() => new Date(), []);
  const next7Days = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d;
  }, []);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      const name = m.fullName || '';
      const email = m.email || '';
      const phone = m.phone || '';
      const plan = m.plan || '';

      const matchesSearch =
        name.toLowerCase().includes(search.toLowerCase()) ||
        email.toLowerCase().includes(search.toLowerCase()) ||
        phone.toLowerCase().includes(search.toLowerCase()) ||
        plan.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === 'All') return true;
      if (statusFilter === 'Active') return m.status?.toLowerCase() === 'active';
      if (statusFilter === 'Frozen') return m.status?.toLowerCase() === 'frozen';
      if (statusFilter === 'Expired') {
        if (m.status?.toLowerCase() === 'expired') return true;
        if (m.expiry) {
          const exp = new Date(m.expiry);
          return exp < today;
        }
        return false;
      }
      if (statusFilter === 'Expiring Soon') {
        if (!m.expiry) return false;
        const exp = new Date(m.expiry);
        return exp >= today && exp <= next7Days;
      }
      return true;
    });
  }, [members, search, statusFilter, today, next7Days]);

  const pagedMembers = useMemo(() => {
    return filteredMembers.slice(0, displayCount);
  }, [filteredMembers, displayCount]);

  const totalCount = members.length;
  const activeCount = useMemo(() => members.filter((m) => m.status?.toLowerCase() === 'active').length, [members]);
  const expiringSoonCount = useMemo(() => {
    return members.filter((m) => {
      if (!m.expiry) return false;
      const exp = new Date(m.expiry);
      return exp >= today && exp <= next7Days;
    }).length;
  }, [members, today, next7Days]);
  const frozenCount = useMemo(() => members.filter((m) => m.status?.toLowerCase() === 'frozen').length, [members]);

  return (
    <div className="space-y-6 font-sans">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Member Lookup
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Search registered studio members, verify active subscription plans, validity dates, and contact records.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
        >
          <RefreshCwIcon size="xs" className={loading ? 'animate-spin text-rose-600' : ''} />
          <span>Refresh Records</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* 4 Pastel Statistic Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Enrolled – Soft Blush Pink */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-rose-200/70 bg-[#FFF1F2] p-4.5 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Total Enrolled
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-rose-950 dark:text-rose-100">
                {totalCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-100/90 text-rose-700 shadow-2xs dark:bg-rose-900/60 dark:text-rose-200">
              <UsersIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-rose-700/85 dark:text-rose-300/85">
            Registered member accounts
          </p>
        </div>

        {/* Metric 2: Active Access – Soft Mint Green */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-emerald-200/70 bg-[#F0FDF4] p-4.5 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Active Access
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-emerald-950 dark:text-emerald-100">
                {activeCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100/90 text-emerald-700 shadow-2xs dark:bg-emerald-900/60 dark:text-emerald-200">
              <CheckCircleIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-emerald-700/85 dark:text-emerald-300/85">
            Valid studio access
          </p>
        </div>

        {/* Metric 3: Expiring Soon – Soft Lavender */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-purple-200/70 bg-[#F5F3FF] p-4.5 shadow-2xs dark:border-purple-900/40 dark:bg-purple-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-800 dark:text-purple-300">
                Expiring in 7 Days
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-purple-950 dark:text-purple-100">
                {expiringSoonCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-purple-100/90 text-purple-700 shadow-2xs dark:bg-purple-900/60 dark:text-purple-200">
              <ClockIcon size="xs" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-purple-700/85 dark:text-purple-300/85">
            Upcoming renewals
          </p>
        </div>

        {/* Metric 4: Frozen / Inactive – Powder Blue */}
        <div className="flex flex-col justify-between min-h-[110px] rounded-2xl border border-sky-200/70 bg-[#F0F9FF] p-4.5 shadow-2xs dark:border-sky-900/40 dark:bg-sky-950/30">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800 dark:text-sky-300">
                Frozen Accounts
              </p>
              <p className="mt-1.5 font-serif text-2xl sm:text-3xl font-bold tabular-nums text-sky-950 dark:text-sky-100">
                {frozenCount}
              </p>
            </div>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sky-100/90 text-sky-700 shadow-2xs dark:bg-sky-900/60 dark:text-sky-200">
              <AlertCircle className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-2 text-[10px] font-medium text-sky-700/85 dark:text-sky-300/85">
            Temporarily paused
          </p>
        </div>
      </div>

      {/* Search and Filters Section */}
      <section
        aria-label="Member search and filter controls"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="relative flex-1">
          <SearchIcon size="xs" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by member name, phone, email, or membership plan..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setDisplayCount(10);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(['All', 'Active', 'Expiring Soon', 'Frozen', 'Expired'] as const).map((filter) => (
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

      {/* Members Directory Table */}
      <section
        aria-label="Registered members table"
        className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FCFAF8] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3.5">Member Name</th>
                <th className="px-4 py-3.5">Contact Details</th>
                <th className="px-4 py-3.5">Membership Plan</th>
                <th className="px-4 py-3.5">Joined Date</th>
                <th className="px-4 py-3.5">Plan Validity</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {pagedMembers.map((member) => {
                const initials = member.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'M';

                const isActive = member.status?.toLowerCase() === 'active';
                const isFrozen = member.status?.toLowerCase() === 'frozen';

                return (
                  <tr key={member.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                          {initials}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">{member.fullName}</p>
                          <p className="text-[10px] text-slate-400">ID: {member.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {member.phone ? formatIndianMobile(member.phone) : '—'}
                      </p>
                      <p className="text-[10px] text-slate-400 truncate max-w-[180px]">{member.email || 'No email'}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{member.plan}</span>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400 tabular-nums">
                      {member.joined?.slice(0, 10)}
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      {member.expiry ? (
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {member.expiry.slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-emerald-700 dark:text-emerald-400 font-medium">Ongoing Valid</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : isFrozen
                            ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300'
                            : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive ? 'bg-emerald-500' : isFrozen ? 'bg-sky-500' : 'bg-rose-500'
                          }`}
                        />
                        <span>{member.status}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedMember(member)}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200 cursor-pointer"
                      >
                        <span>View Profile</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredMembers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-slate-400">
                    <p className="font-serif text-base font-semibold text-slate-700 dark:text-slate-300">
                      No members found
                    </p>
                    <p className="mt-1">
                      {search.trim() ? 'No registered members match your search criteria.' : 'No members registered in the studio database.'}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredMembers.length > displayCount && (
          <div className="flex justify-center border-t border-slate-100 p-4 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + 10)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 cursor-pointer"
            >
              <span>See More ({filteredMembers.length - displayCount} remaining)</span>
            </button>
          </div>
        )}
      </section>

      {/* Member Profile Details Modal */}
      <Modal
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        title="Member Profile Details"
        size="md"
      >
        {selectedMember && (
          <div className="space-y-4 pt-1 text-xs">
            {/* Header info */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-[#FCFAF8] p-4 dark:border-studio-700 dark:bg-studio-800/40">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] to-rose-600 text-sm font-bold text-white shadow-xs">
                {selectedMember.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </span>
              <div>
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">
                  {selectedMember.fullName}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Member ID: <span className="font-mono text-slate-700 dark:text-slate-300">{selectedMember.id}</span>
                </p>
              </div>
            </div>

            {/* Profile fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Phone</span>
                <p className="mt-1 font-mono text-xs font-semibold text-slate-900 dark:text-white">
                  {selectedMember.phone ? formatIndianMobile(selectedMember.phone) : 'Not recorded'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {selectedMember.email || 'Not recorded'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Membership Plan</span>
                <p className="mt-1 text-xs font-bold text-rose-700 dark:text-rose-400">
                  {selectedMember.plan}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Membership Status</span>
                <p className="mt-1 text-xs font-bold text-slate-900 dark:text-white">
                  {selectedMember.status}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Enrolled Since</span>
                <p className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                  {selectedMember.joined?.slice(0, 10)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Plan Validity Expiry</span>
                <p className="mt-1 font-mono text-xs text-slate-800 dark:text-slate-200">
                  {selectedMember.expiry ? selectedMember.expiry.slice(0, 10) : 'Ongoing / Lifetime'}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-studio-700 dark:bg-studio-900 sm:col-span-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Emergency Contact</span>
                <p className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                  {selectedMember.emergencyContact}
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-bold text-white hover:bg-slate-800 dark:bg-studio-800 dark:hover:bg-studio-700 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
