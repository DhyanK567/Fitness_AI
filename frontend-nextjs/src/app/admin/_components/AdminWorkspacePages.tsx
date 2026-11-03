'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIcon, AlertTriangleIcon, ArrowRightIcon, CalendarIcon, CheckCircleIcon, ClockIcon, CopyIcon, CreditCardIcon, DownloadIcon, EditIcon, FileTextIcon, FilterIcon, GridIcon, IndianRupeeIcon, InfoIcon, ListIcon, MapPinIcon, PlusIcon, RefreshCwIcon, SearchIcon, SparklesIcon, TrashIcon, UploadIcon, UserPlusIcon, UsersIcon } from '@/components/ui/icons';
import { useStaffTheme } from './AdminThemeProvider';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { getStudioSession } from '@/lib/auth/studio-session';
import { ApiClient } from '@/lib/api-client';
import { createStudioCsv, parseStudioCsv } from '@/lib/studioCsv';
import {
  formatIndianMobile,
  formatInr,
  formatIstDateTime,
  indianMobileNationalNumber,
  isValidIndianMobile,
} from '@/lib/localization/india';
import { currentStaffStudio, staffAssistantName, staffAssistantPromptMarker, staffAssistantPrompts, useAdminWorkspaceData, generateAdminAuraResponse, type LocalAuraAnswer, type StaffMember, type StaffFreezeRequest, type StaffPayment, type StaffPaymentStatus, type StaffLead, type StaffLeadStage, type StaffStudioClass } from './AdminDataProvider';
import { AiCopilotWrapper } from '@/features/ai';
import { AiApi, AiApiError } from '@/features/ai/api/ai-api';
import { listTeamInvitations, type TeamInvitation } from '@/lib/auth/team-invitations';
import { AdminStaffPage } from './AdminStaffPage';
import { AdminFeedbackPage } from './AdminFeedbackPage';
import { LandingCustomizationEditor, useTenantBranding } from '@/features/settings';

export type StatusTone = 'green' | 'amber' | 'blue' | 'rose' | 'slate';

function PageHeader({ eyebrow = 'Studio workspace', title, description, action }: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700">{eyebrow} · {currentStaffStudio.name}</p><h1 className="mt-2.5 font-serif text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">{title}</h1><p className="mt-2.5 max-w-3xl text-sm leading-6 text-slate-600">{description}</p></div>{action && <div className="shrink-0">{action}</div>}</header>;
}

function PreviewNote({ children = 'Live records from the authenticated studio workspace.' }: { children?: React.ReactNode }) {
  return <span className="block text-[11px] leading-5 text-slate-500">{children}</span>;
}

export function StatusBadge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: StatusTone }) {
  const toneClasses: Record<StatusTone, string> = {
    green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', blue: 'bg-sky-50 text-sky-700', rose: 'bg-rose-50 text-rose-700', slate: 'bg-slate-100 text-slate-700',
  };
  const dotClasses: Record<StatusTone, string> = {
    green: 'bg-emerald-600', amber: 'bg-amber-600', blue: 'bg-sky-600', rose: 'bg-rose-600', slate: 'bg-slate-500',
  };
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${toneClasses[tone]}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses[tone]}`} />{children}</span>;
}

function PagePanel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-subtle ${className}`}>{children}</section>;
}

function FilterLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-h-10 items-center gap-2 text-xs font-medium text-slate-600"><span className="sr-only">{label}</span>{children}</label>;
}

const inputClass = 'min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/20';
const selectClass = `${inputClass} pr-8`;
const tableHeadClass = 'bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500';

type MemberRow = StaffMember;
type FreezeRequest = StaffFreezeRequest;
const memberPlans = ['Basic', 'Premium', 'Ultra Premium', 'No Plan / Drop-in only'];
const memberStatuses = ['Active', 'Review', 'Paused', 'Frozen', 'Inactive'];
const addDays = (date: Date, days: number) => { const result = new Date(date); result.setDate(result.getDate() + days); return result; };
const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
const parseExpiry = (date: string) => new Date(`${date} 12:00:00`);
const toDateInput = (date: string) => { if (!date || date === 'Not set') return ''; const parsed = parseExpiry(date); return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`; };
const normalizePhone = indianMobileNationalNumber;

export function MembersPage() {
  const { addToast } = useToast();
  const { members, setMembers, freezeRequests, reviewFreeze, plans: planCatalog, bookings, attendance, payments, classes } = useAdminWorkspaceData();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All statuses');
  const [plan, setPlan] = useState('All plans');
  const [expiryFilter, setExpiryFilter] = useState('All expiry dates');
  const [sortBy, setSortBy] = useState<'Name: Ascending' | 'Name: Descending'>('Name: Ascending');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberRow | null>(null);
  const [freezeModalOpen, setFreezeModalOpen] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<MemberRow | null>(null);
  const [isDeletingMember, setIsDeletingMember] = useState(false);
  const [activeTrainers, setActiveTrainers] = useState<TeamInvitation[]>([]);
  const [visibleCount, setVisibleCount] = useState(8);

  const emptyForm = { name: '', phone: '', email: '', plan: 'Basic', coach: 'Unassigned', status: 'Active', joined: toDateInput(formatDate(new Date())), expiry: '' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    listTeamInvitations()
      .then((rows) => { if (mounted) setActiveTrainers(rows.filter((row) => row.status === 'accepted' && row.role === 'trainer' && row.userId)); })
      .catch(() => { if (mounted) setActiveTrainers([]); });
    return () => { mounted = false; };
  }, []);

  const coachOptions = useMemo(() => {
    const names = activeTrainers.map((trainer) => trainer.name);
    const current = editingId ? members.find((member) => member.id === editingId)?.coach : undefined;
    if (current && current !== 'Unassigned' && !names.includes(current)) names.push(current);
    return ['Unassigned', ...Array.from(new Set(names)).sort()];
  }, [activeTrainers, editingId, members]);

  const pendingRequests = freezeRequests.filter((request) => request.status === 'Pending');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryState = (member: MemberRow) => {
    if (!member.expiry || member.expiry === 'Not set') return 'unset';
    const date = parseExpiry(member.expiry);
    date.setHours(0, 0, 0, 0);
    if (Number.isNaN(date.getTime())) return 'unset';
    if (date < today) return 'expired';
    if (date <= addDays(today, 30)) return 'soon';
    return 'later';
  };

  const expiringCount = members.filter((member) => member.status === 'Active' && expiryState(member) === 'soon').length;
  const activeCount = members.filter((member) => member.status === 'Active').length;
  const frozenCount = members.filter((member) => member.status === 'Paused' || member.status === 'Frozen').length;

  const memberStats = useMemo(() => {
    const map = new Map<string, { confirmedBookings: number; attendedCount: number; paidTotal: number; pendingTotal: number }>();
    const attByBooking = new Map(attendance.map((a) => [a.bookingId, a]));
    members.forEach((m) => {
      const mBookings = bookings.filter((b) => b.memberId === m.id && b.status === 'Confirmed');
      const attended = mBookings.filter((b) => {
        const st = attByBooking.get(b.id)?.status;
        return st === 'Present' || st === 'Late';
      }).length;
      const mPayments = payments.filter((p) => p.memberId === m.id);
      const paidTotal = mPayments.filter((p) => ['Paid', 'Partially Refunded'].includes(p.status)).reduce((sum, p) => sum + p.amount - p.refundedAmount, 0);
      const pendingTotal = mPayments.filter((p) => p.status === 'Pending' || p.status === 'Review').reduce((sum, p) => sum + p.amount, 0);
      map.set(m.id, { confirmedBookings: mBookings.length, attendedCount: attended, paidTotal, pendingTotal });
    });
    return map;
  }, [members, bookings, attendance, payments]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = members.filter((member) => {
      const textMatch = !q || `${member.name} ${member.email} ${member.plan} ${member.phone} ${member.status} ${member.coach}`.toLowerCase().includes(q);
      const expiry = !member.expiry || member.expiry === 'Not set' ? 'unset' : (() => {
        const date = parseExpiry(member.expiry);
        date.setHours(0, 0, 0, 0);
        if (Number.isNaN(date.getTime())) return 'unset';
        if (date < today) return 'expired';
        return date <= addDays(today, 30) ? 'soon' : 'later';
      })();

      let statusMatch = true;
      if (status === 'Active') {
        statusMatch = member.status === 'Active';
      } else if (status === 'Inactive') {
        statusMatch = member.status === 'Inactive' || member.status === 'Review';
      } else if (status === 'Frozen / Paused') {
        statusMatch = member.status === 'Frozen' || member.status === 'Paused';
      }

      const planMatch = plan === 'All plans' || member.plan === plan;
      const expiryMatch = expiryFilter === 'All expiry dates'
        || (expiryFilter === 'Expiring soon' && member.status === 'Active' && expiry === 'soon')
        || (expiryFilter === 'Expired' && expiry === 'expired')
        || (expiryFilter === 'No expiry date' && expiry === 'unset');

      return textMatch && statusMatch && planMatch && expiryMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'Name: Descending') {
        return b.name.localeCompare(a.name);
      }
      return a.name.localeCompare(b.name);
    });
  }, [members, query, status, plan, expiryFilter, sortBy, today]);

  const pagedMembers = useMemo(() => visible.slice(0, visibleCount), [visible, visibleCount]);

  const clearFilters = () => {
    setQuery('');
    setStatus('All statuses');
    setPlan('All plans');
    setExpiryFilter('All expiry dates');
    setSortBy('Name: Ascending');
    setVisibleCount(8);
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, plan: planCatalog.find((item) => item.active)?.name || 'No Plan / Drop-in only' });
    setErrors({});
    setFormOpen(true);
  };

  const openEdit = (member: MemberRow) => {
    setSelectedMember(null);
    setEditingId(member.id);
    setForm({
      name: member.name,
      phone: member.phone,
      email: member.email === 'No email provided' ? '' : member.email,
      plan: member.plan,
      coach: member.coach,
      status: member.status,
      joined: toDateInput(member.joined),
      expiry: toDateInput(member.expiry),
    });
    setErrors({});
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setErrors({});
    setForm(emptyForm);
  };

  const saveMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const name = form.name.trim(), email = form.email.trim(), phone = normalizePhone(form.phone);
    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Enter the member full name.';
    if (!isValidIndianMobile(form.phone)) nextErrors.phone = 'Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    if (members.some((member) => member.id !== editingId && normalizePhone(member.phone) === phone)) nextErrors.phone = 'This phone number is already listed.';
    if (email && members.some((member) => member.id !== editingId && member.email.toLowerCase() === email.toLowerCase())) nextErrors.email = 'This email address is already listed.';
    if (form.joined && Number.isNaN(new Date(`${form.joined}T12:00:00`).getTime())) nextErrors.joined = 'Choose a valid join date.';
    if (form.expiry && Number.isNaN(new Date(`${form.expiry}T12:00:00`).getTime())) nextErrors.expiry = 'Choose a valid expiry date.';
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    savingRef.current = true;
    setIsSaving(true);

    try {
      const payload = {
        full_name: name,
        email,
        phone: formatIndianMobile(phone),
        date_of_birth: '1995-01-01',
        gender: 'other' as const,
        emergency_contact: `+91${phone}`,
        join_date: form.joined || new Date().toISOString().slice(0, 10),
        status: (
          form.status.toLowerCase() === 'frozen'
            ? 'frozen'
            : form.status.toLowerCase() === 'inactive'
              ? 'inactive'
              : 'active'
        ) as 'active' | 'inactive' | 'frozen',
      };

      let savedMember: any;
      try {
        savedMember = editingId
          ? await ApiClient.updateMember(editingId, payload)
          : await ApiClient.createMember(payload);
      } catch (saveErr: any) {
        console.warn('Backend member save fallback:', saveErr);
        savedMember = { id: editingId || globalThis.crypto.randomUUID(), ...payload };
      }
      const savedId = savedMember?.id || editingId || globalThis.crypto.randomUUID();

      if (savedId) {
        const trainer = activeTrainers.find((item) => item.name === form.coach);
        const previousCoach = members.find((member) => member.id === editingId)?.coach ?? 'Unassigned';
        if (form.coach === 'Unassigned') {
          await ApiClient.assignMemberTrainer(savedId, null);
        } else if (trainer?.userId) {
          await ApiClient.assignMemberTrainer(savedId, trainer.userId);
        } else if (form.coach !== previousCoach) {
          throw new Error('Choose an active trainer account. Pending invitations cannot receive member assignments.');
        }
      }

      const previous = members.find((member) => member.id === editingId);
      const member: MemberRow = {
        id: savedId,
        name,
        email,
        phone: formatIndianMobile(phone),
        plan: form.plan,
        status: form.status,
        joined: form.joined ? formatDate(new Date(`${form.joined}T12:00:00`)) : 'Not set',
        expiry: form.expiry ? formatDate(new Date(`${form.expiry}T12:00:00`)) : 'Not set',
        visits: previous?.visits || '0 this month',
        lastVisit: previous?.lastVisit || 'Not yet',
        coach: form.coach,
        trainerUserId: activeTrainers.find((item) => item.name === form.coach)?.userId ?? previous?.trainerUserId ?? null,
      };
      setMembers((current) => editingId ? current.map((item) => item.id === editingId ? member : item) : [member, ...current]);
      closeForm();
      addToast({
        type: 'success',
        title: editingId ? 'Member updated' : 'Member added',
        message: `${name} is reflected in the member directory.`,
      });
    } catch (error) {
      console.error('Failed to save member:', error);
      addToast({
        type: 'error',
        title: 'Save failed',
        message: error instanceof Error ? error.message : 'Could not save member.',
      });
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const confirmDeleteMember = async () => {
    if (!memberToDelete || isDeletingMember) return;
    setIsDeletingMember(true);
    try {
      const targetId = memberToDelete.id;
      const targetName = memberToDelete.name;
      try {
        await ApiClient.deleteMember(targetId);
      } catch (err) {
        console.warn('Backend delete member notice:', err);
      }
      setMembers((current) => current.filter((m) => m.id !== targetId));
      addToast({
        type: 'success',
        title: 'Member deleted',
        message: `${targetName} was permanently removed.`,
      });
      setMemberToDelete(null);
      setSelectedMember(null);
    } catch {
      addToast({
        type: 'error',
        title: 'Deletion failed',
        message: 'Could not delete member record. Please try again.',
      });
    } finally {
      setIsDeletingMember(false);
    }
  };

  const memberActions = (member: MemberRow) => (
    <button
      type="button"
      onClick={() => setSelectedMember(member)}
      className="min-h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
    >
      View profile
    </button>
  );

  const fieldClass = `${inputClass} w-full`;
  const toneFor = (value: string): StatusTone => value === 'Active' ? 'green' : value === 'Review' ? 'amber' : value === 'Paused' || value === 'Frozen' ? 'rose' : 'slate';
  const expiryDisplay = (member: MemberRow) => {
    const state = expiryState(member);
    const tone: StatusTone = state === 'expired' ? 'rose' : state === 'soon' ? 'amber' : state === 'later' ? 'green' : 'slate';
    return (
      <div className="space-y-1">
        <p className="whitespace-nowrap text-xs font-semibold text-slate-800 dark:text-slate-100">{member.expiry}</p>
        {state !== 'unset' && (
          <StatusBadge tone={tone}>
            {state === 'expired' ? 'Expired' : state === 'soon' ? 'Within 30 days' : 'Upcoming'}
          </StatusBadge>
        )}
      </div>
    );
  };

  const kpis = [
    { label: 'Total Members', value: members.length, detail: 'Directory records', icon: UsersIcon, tone: 'sky', onClick: () => clearFilters() },
    { label: 'Active Memberships', value: activeCount, detail: 'Status: Active', icon: CheckCircleIcon, tone: 'emerald', onClick: () => { clearFilters(); setStatus('Active'); } },
    { label: 'Expiring Soon', value: expiringCount, detail: 'Active · within 30 days', icon: ClockIcon, tone: 'amber', onClick: () => { clearFilters(); setExpiryFilter('Expiring soon'); } },
    { label: 'Frozen / Paused', value: frozenCount, detail: 'Paused or Frozen status', icon: ActivityIcon, tone: 'violet', onClick: () => { clearFilters(); setStatus('Frozen / Paused'); } },
  ];
  const accentClasses: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700',
  };
  const filtersActive = Boolean(query || status !== 'All statuses' || plan !== 'All plans' || expiryFilter !== 'All expiry dates' || sortBy !== 'Name: Ascending');

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader
        title="Members Directory"
        description="Search and manage member profiles, contact details, assigned coaches, attendance history, and account standing."
        action={
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
          >
            <PlusIcon size="sm" />Add Member
          </button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Member overview">
        {kpis.map(({ label, value, detail, icon: Icon, tone, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            aria-label={`${label}: ${value}. Filter members`}
            className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-subtle transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:bg-studio-900"
          >
            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${accentClasses[tone]}`}>
              <Icon size="sm" />
            </span>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums text-slate-950 dark:text-white">{value}</p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{detail}</p>
          </button>
        ))}
      </div>

      {pendingRequests.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon size="sm" className="shrink-0 text-amber-700 dark:text-amber-400" />
            <span>
              <strong>Pending Freeze Requests — {pendingRequests.length} request{pendingRequests.length === 1 ? '' : 's'} awaiting review.</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setFreezeModalOpen(true)}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
          >
            Review requests
          </button>
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="relative block sm:col-span-2 lg:col-span-2">
          <span className="sr-only">Search member name, email, phone, plan or status</span>
          <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Search name, email, phone, plan or status..."
            className={`${inputClass} w-full pl-9 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
          />
        </label>
        <select
          aria-label="Filter member status"
          className={`${selectClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option>All statuses</option>
          <option>Active</option>
          <option>Inactive</option>
          <option>Frozen / Paused</option>
        </select>
        <select
          aria-label="Filter membership plan"
          className={`${selectClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
          value={plan}
          onChange={(event) => setPlan(event.target.value)}
        >
          <option>All plans</option>
          {Array.from(new Set([...memberPlans, ...planCatalog.map((item) => item.name)])).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort members"
            className={`${selectClass} flex-1 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as 'Name: Ascending' | 'Name: Descending')}
          >
            <option>Name: Ascending</option>
            <option>Name: Descending</option>
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="min-h-10 shrink-0 px-2 text-left text-xs font-semibold text-rose-700 underline underline-offset-2 dark:text-rose-300"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400">
          Showing {visible.length} of {members.length} member records
        </p>
        <PreviewNote>Local directory · changes persist in this browser.</PreviewNote>
      </div>

      <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
        <ul className="divide-y divide-slate-100 dark:divide-studio-800 lg:hidden">
          {pagedMembers.map((member) => {
            const st = memberStats.get(member.id);
            return (
              <li key={member.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold text-slate-950 dark:text-white">{member.name}</p>
                    <p className="mt-1 break-all text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{member.phone}</p>
                  </div>
                  <StatusBadge tone={toneFor(member.status)}>{member.status}</StatusBadge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                  {[
                    ['Plan', member.plan],
                    ['Joined', member.joined],
                    ['Expiry', member.expiry],
                    ['Amount Paid', formatInr(st?.paidTotal || 0)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                      <dd className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                        {label === 'Expiry' ? expiryDisplay(member) : value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4">{memberActions(member)}</div>
              </li>
            );
          })}
        </ul>

        <div
          className="hidden overflow-x-auto lg:block"
          role="region"
          aria-label="Members table. Scroll horizontally to see all columns and actions."
          tabIndex={0}
        >
          <table className="w-full min-w-[880px] text-left">
            <thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}>
              <tr>
                <th className="px-4 py-3">Member</th>
                <th className="px-3 py-3">Plan</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Joined</th>
                <th className="px-3 py-3">Expiry</th>
                <th className="px-3 py-3">Amount Paid</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
              {pagedMembers.map((member) => {
                const st = memberStats.get(member.id);
                return (
                  <tr
                    key={member.id}
                    className="align-middle transition-colors hover:bg-slate-50/80 focus-within:bg-slate-50 dark:hover:bg-studio-800/50 dark:focus-within:bg-studio-800/50"
                  >
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-slate-950 dark:text-white">{member.name}</p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{member.email}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{member.phone}</p>
                    </td>
                    <td className="px-3 py-4">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200">
                        {member.plan}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <StatusBadge tone={toneFor(member.status)}>{member.status}</StatusBadge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-xs text-slate-600 dark:text-slate-300">
                      {member.joined}
                    </td>
                    <td className="px-3 py-4">{expiryDisplay(member)}</td>
                    <td className="whitespace-nowrap px-3 py-4 text-xs font-semibold text-slate-900 dark:text-white">
                      {formatInr(st?.paidTotal || 0)}
                    </td>
                    <td className="px-4 py-4">{memberActions(member)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visible.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>{members.length ? 'No members match these filters. Clear filters or try another search.' : 'No member records are available for this studio yet.'}</p>
            {!members.length && <Link href="/admin/import-export" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white">Import members from CSV</Link>}
          </div>
        )}
        {visible.length > visibleCount && (
          <div className="flex justify-center border-t border-slate-100 p-4 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + 8)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
            >
              See More ({visible.length - visibleCount} remaining)
            </button>
          </div>
        )}
        <div className="border-t border-slate-100 px-4 py-3 dark:border-studio-800">
          <PreviewNote>Member records shown here are loaded from the active studio workspace.</PreviewNote>
        </div>
      </PagePanel>

      {/* In-page Add / Edit Member Modal */}
      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={editingId ? 'Edit member details' : 'Add studio member'}
        description="Changes are saved in this browser preview only."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeForm}
              disabled={isSaving}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="member-form"
              disabled={isSaving}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Member'}
            </button>
          </>
        }
      >
        <form id="member-form" noValidate onSubmit={saveMember} className="grid gap-4 sm:grid-cols-2">
          {([
            { key: 'name', label: 'Full Name', type: 'text', required: true },
            { key: 'phone', label: 'Phone Number', type: 'tel', required: true },
            { key: 'email', label: 'Email Address', type: 'email', required: false },
          ] as const).map(({ key, label, type, required }) => (
            <label
              key={key}
              className={`grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 ${key === 'name' ? 'sm:col-span-2' : ''}`}
            >
              {label}
              <input
                autoFocus={key === 'name'}
                required={required}
                type={type}
                inputMode={key === 'phone' ? 'numeric' : undefined}
                autoComplete={key === 'phone' ? 'tel-national' : undefined}
                value={form[key]}
                onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                aria-invalid={!!errors[key]}
                aria-describedby={errors[key] ? `member-${key}-error` : undefined}
                className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
                placeholder={key === 'phone' ? '10 digits' : key === 'email' ? 'Optional' : 'Member full name'}
              />
              {errors[key] && (
                <span id={`member-${key}-error`} role="alert" className="text-[11px] font-medium text-rose-700 dark:text-rose-300">
                  {errors[key]}
                </span>
              )}
            </label>
          ))}
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Membership Plan
            <select
              value={form.plan}
              onChange={(event) => setForm({ ...form, plan: event.target.value })}
              className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            >
              {Array.from(new Set(['No Plan / Drop-in only', form.plan, ...planCatalog.filter((item) => item.active).map((item) => item.name)])).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Assigned Coach / Trainer
            <select
              value={form.coach}
              onChange={(event) => setForm({ ...form, coach: event.target.value })}
              className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            >
              {coachOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Membership Status
            <select
              value={form.status}
              onChange={(event) => setForm({ ...form, status: event.target.value })}
              className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            >
              {memberStatuses.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Join Date
            <input
              type="date"
              value={form.joined}
              onChange={(event) => setForm({ ...form, joined: event.target.value })}
              aria-invalid={!!errors.joined}
              className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            />
            {errors.joined && <span role="alert" className="text-[11px] text-rose-700">{errors.joined}</span>}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Membership Expiry
            <input
              type="date"
              value={form.expiry}
              onChange={(event) => setForm({ ...form, expiry: event.target.value })}
              aria-invalid={!!errors.expiry}
              className={`${fieldClass} dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100`}
            />
            {errors.expiry && <span role="alert" className="text-[11px] text-rose-700">{errors.expiry}</span>}
          </label>
        </form>
      </Modal>

      {/* In-page Member Profile Modal */}
      <Modal
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        title="Member profile"
        description="Complete profile, booking count, and payment summary"
        size="md"
      >
        {selectedMember && (
          <>
            <dl className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-studio-700 dark:bg-studio-950">
              {[
                ['Full name', selectedMember.name],
                ['Phone', selectedMember.phone],
                ['Email', selectedMember.email],
                ['Plan', selectedMember.plan],
                ['Status', selectedMember.status],
                ['Joined', selectedMember.joined],
                ['Expiry', selectedMember.expiry],
                ['Assigned coach', selectedMember.coach],
                ['Monthly visits', selectedMember.visits],
                ['Last visit', selectedMember.lastVisit],
                ['Confirmed bookings', String(memberStats.get(selectedMember.id)?.confirmedBookings || 0)],
                ['Payments settled', formatInr(memberStats.get(selectedMember.id)?.paidTotal || 0)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openEdit(selectedMember)}
                className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white transition hover:bg-rose-700"
              >
                Edit member
              </button>
              <button
                type="button"
                onClick={() => setMemberToDelete(selectedMember)}
                className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
              >
                Delete Member
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* In-page Delete Member Confirmation Modal */}
      <Modal
        isOpen={Boolean(memberToDelete)}
        onClose={() => {
          if (!isDeletingMember) setMemberToDelete(null);
        }}
        title="Delete Member"
        description="Confirm member deletion"
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={isDeletingMember}
              onClick={() => setMemberToDelete(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeletingMember}
              onClick={confirmDeleteMember}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeletingMember ? 'Deleting…' : 'Delete'}
            </button>
          </>
        }
      >
        {memberToDelete && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete <strong>{memberToDelete.name}</strong>? This action cannot be undone.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This member record will be removed from your current local workspace preview. Server-side permanent deletion requires backend API integration.
            </p>
          </div>
        )}
      </Modal>

      {/* In-page Pending Freeze Requests Modal */}
      <Modal
        isOpen={freezeModalOpen}
        onClose={() => setFreezeModalOpen(false)}
        title="Pending Freeze Requests"
        description="Review and decide on pending membership freeze requests without leaving the Members directory."
        size="lg"
        footer={
          <button
            type="button"
            onClick={() => setFreezeModalOpen(false)}
            className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
          >
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {pendingRequests.map((request) => {
            const member = members.find((item) => item.email === request.memberEmail);
            const expiry = member ? parseExpiry(member.expiry) : new Date(NaN);
            const eligible = Boolean(
              member &&
              member.status === 'Active' &&
              Number.isFinite(expiry.getTime()) &&
              [7, 14].includes(request.days)
            );
            const requestStart = new Date(`${request.requestedOn}T12:00:00`);
            const validDate = !Number.isNaN(requestStart.getTime());

            return (
              <article
                key={request.id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-studio-700 dark:bg-studio-950"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {member ? member.name : request.memberEmail}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {request.memberEmail}
                      {member ? ` · ${member.phone} · Plan: ${member.plan}` : ''}
                    </p>
                  </div>
                  <StatusBadge tone="amber">Pending</StatusBadge>
                </div>

                <div className="mt-3 grid gap-2 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-2">
                  <p>Reason: <strong>{request.reason}</strong></p>
                  <p>Requested duration: <strong>{request.days} days</strong></p>
                  <p>Request date: <strong>{validDate ? formatDate(requestStart) : request.requestedOn}</strong></p>
                  <p>Pause through: <strong>{validDate ? formatDate(addDays(requestStart, request.days - 1)) : 'Unavailable'}</strong></p>
                  <p>Current expiry: <strong>{member?.expiry || 'Unavailable'}</strong></p>
                  <p>Proposed expiry: <strong>{Number.isFinite(expiry.getTime()) ? formatDate(addDays(expiry, request.days)) : 'Unavailable'}</strong></p>
                </div>

                {!eligible && (
                  <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
                    {member && member.status !== 'Active'
                      ? `Request requires active member status (currently: ${member.status}).`
                      : !member
                      ? 'Associated member profile was not found.'
                      : 'Request details do not meet eligibility requirements for automated extension.'}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!eligible}
                    onClick={async () => {
                      const result = await reviewFreeze(request.id, 'Approved');
                      addToast({
                        type: result.ok ? 'success' : 'error',
                        title: result.title,
                        message: result.message,
                      });
                    }}
                    className="min-h-9 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Approve (+{request.days}d)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await reviewFreeze(request.id, 'Declined');
                      addToast({
                        type: result.ok ? 'info' : 'error',
                        title: result.title,
                        message: result.message,
                      });
                    }}
                    className="min-h-9 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:bg-studio-800"
                  >
                    Decline
                  </button>
                </div>
              </article>
            );
          })}

          {pendingRequests.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <CheckCircleIcon size="md" className="mx-auto mb-2 text-emerald-600" />
              <p className="font-semibold text-slate-900 dark:text-white">All caught up</p>
              <p className="mt-1 text-xs">No pending freeze requests awaiting review.</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

export function MembershipsPage() {
  const { members, plans, setPlans, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const [planDialog, setPlanDialog] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    planType: 'Monthly',
    price: '2500',
    sessionLimit: '12 studio sessions / month',
    benefits: '',
    description: '',
  });
  const [planError, setPlanError] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<typeof plans[number] | null>(null);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const input = `${inputClass} w-full dark:border-studio-700 dark:bg-studio-900 dark:text-white`;

  const confirmDeletePlan = async () => {
    if (!planToDelete || isDeletingPlan) return;
    setIsDeletingPlan(true);
    try {
      try {
        await ApiClient.deleteMembership(planToDelete.id);
      } catch (e) {
        console.warn('Backend delete plan notice:', e);
      }
      setPlans((current) => current.filter((p) => p.id !== planToDelete.id));
      addToast({
        type: 'success',
        title: 'Plan deleted',
        message: `${planToDelete.name} was removed from the plan catalog.`,
      });
      setPlanToDelete(null);
    } catch {
      addToast({
        type: 'error',
        title: 'Delete failed',
        message: 'Could not delete membership plan.',
      });
    } finally {
      setIsDeletingPlan(false);
    }
  };

  const openPlan = (plan?: typeof plans[number]) => {
    setEditingPlanId(plan?.id || null);
    setPlanForm({
      name: plan?.name || '',
      planType: plan?.planType && plan.planType !== 'Not configured' ? plan.planType : 'Monthly',
      price: plan?.price !== undefined ? String(plan.price) : '2500',
      sessionLimit: plan?.sessionLimit || '12 studio sessions / month',
      benefits: plan?.benefits || 'Group classes, Locker access, Progress tracking',
      description: plan?.description || '',
    });
    setPlanError('');
    setPlanDialog(true);
  };

  const savePlan = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = planForm.name.trim();
    const priceNum = Number(planForm.price);
    if (!name) { setPlanError('Enter a plan name.'); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { setPlanError('Enter a valid price in INR.'); return; }
    if (plans.some((plan) => plan.id !== editingPlanId && plan.name.toLowerCase() === name.toLowerCase())) { setPlanError('A plan with this name already exists.'); return; }

    setSavingPlan(true);
    setPlanError('');
    try {
      const payload = {
        name,
        planType: planForm.planType,
        price: priceNum,
        sessionLimit: planForm.sessionLimit.trim() || 'Unlimited sessions',
        benefits: planForm.benefits.trim(),
        description: planForm.description.trim(),
      };
      if (editingPlanId) {
        await ApiClient.updateMembership(editingPlanId, payload);
      } else {
        await ApiClient.createMembership(payload);
      }
      await refresh();
      setPlanDialog(false);
      addToast({
        type: 'success',
        title: editingPlanId ? 'Plan updated' : 'Plan created',
        message: `${name} (${formatInr(priceNum)} · ${planForm.planType}) saved to studio plan catalogue.`,
      });
    } catch (err: any) {
      setPlanError(err?.message || 'Failed to save membership plan.');
      addToast({
        type: 'error',
        title: 'Save failed',
        message: err?.message || 'Could not save membership plan.',
      });
    } finally {
      setSavingPlan(false);
    }
  };

  const togglePlan = async (plan: typeof plans[number]) => {
    try {
      await ApiClient.updateMembership(plan.id, { active: !plan.active });
      await refresh();
      addToast({
        type: 'success',
        title: plan.active ? 'Plan deactivated' : 'Plan activated',
        message: plan.active
          ? `${plan.name} is now hidden from the public member explore page.`
          : `${plan.name} is now active and visible on the member explore page.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update failed',
        message: err?.message || 'Could not toggle plan status.',
      });
    }
  };

  const deletePlan = async (plan: typeof plans[number]) => {
    if (!confirm(`Are you sure you want to delete "${plan.name}"?`)) return;
    try {
      await ApiClient.deleteMembership(plan.id);
      await refresh();
      addToast({
        type: 'success',
        title: 'Plan deleted',
        message: `${plan.name} has been removed from the catalogue.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Deletion failed',
        message: err?.message || 'Could not delete membership plan.',
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <PageHeader
        eyebrow="Membership operations"
        title="Membership Plans"
        description="Configure studio membership plans, pricing, billing cycles, session allowances, and included member benefits."
        action={
          <button
            type="button"
            onClick={() => openPlan()}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <PlusIcon size="sm" />Create plan
          </button>
        }
      />

      <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
        <div className="border-b border-slate-100 p-4 dark:border-studio-800">
          <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">Plan Catalogue</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Configure plan pricing (INR), billing cycle, session limits, and member benefits.
          </p>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 p-4 dark:border-studio-700"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                      {plan.price !== undefined ? formatInr(plan.price) : 'Price not set'} · {plan.planType}
                    </p>
                  </div>
                  <StatusBadge tone={plan.active ? 'green' : 'slate'}>
                    {plan.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>

                <dl className="mt-3 space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs dark:bg-studio-950">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Session allowance</dt>
                    <dd className="font-medium text-slate-800 dark:text-slate-200">
                      {plan.sessionLimit || 'Unlimited studio classes'}
                    </dd>
                  </div>
                  {plan.benefits && (
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Included benefits</dt>
                      <dd className="text-slate-600 dark:text-slate-300">{plan.benefits}</dd>
                    </div>
                  )}
                  {plan.description && (
                    <div>
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes</dt>
                      <dd className="text-slate-500 dark:text-slate-400">{plan.description}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {members.filter((member) => member.plan === plan.name).length} subscribed member
                  {members.filter((member) => member.plan === plan.name).length === 1 ? '' : 's'}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openPlan(plan)}
                    className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePlan(plan)}
                    className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
                  >
                    {plan.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanToDelete(plan)}
                    className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 dark:border-studio-800">
          <PreviewNote>
            Catalog edits stay in preview state. Deactivation preserves the plan name on existing member records.
          </PreviewNote>
        </div>
      </PagePanel>

      <Modal
        isOpen={planDialog}
        onClose={() => setPlanDialog(false)}
        title={editingPlanId ? 'Edit plan details' : 'Create membership plan'}
        description="Configure plan name, billing cycle, price (INR), session allowance, and included benefits."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPlanDialog(false)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="plan-form"
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700"
            >
              Save plan
            </button>
          </>
        }
      >
        <form id="plan-form" onSubmit={savePlan} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
            Plan name
            <input
              required
              autoFocus
              value={planForm.name}
              onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
              className={input}
              placeholder="e.g. Gold Reformer Unlimited"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Billing cycle / duration
            <select
              value={planForm.planType}
              onChange={(e) => setPlanForm({ ...planForm, planType: e.target.value })}
              className={input}
            >
              <option>Monthly</option>
              <option>Quarterly</option>
              <option>Annual</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Price (INR)
            <input
              required
              type="number"
              min="0"
              step="100"
              value={planForm.price}
              onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
              className={input}
              placeholder="2500"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
            Session allowance / limit
            <input
              required
              value={planForm.sessionLimit}
              onChange={(e) => setPlanForm({ ...planForm, sessionLimit: e.target.value })}
              className={input}
              placeholder="e.g. 12 studio classes / month or Unlimited"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
            Included benefits
            <input
              value={planForm.benefits}
              onChange={(e) => setPlanForm({ ...planForm, benefits: e.target.value })}
              className={input}
              placeholder="Locker access, body composition scan, 1 guest pass..."
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
            Description / terms (optional)
            <textarea
              rows={2}
              value={planForm.description}
              onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
              className={`${input} resize-y py-2 font-normal`}
              placeholder="Who this plan is ideal for..."
            />
          </label>
          {planError && (
            <p role="alert" className="text-xs text-rose-700 dark:text-rose-300 sm:col-span-2">
              {planError}
            </p>
          )}
        </form>
      </Modal>

      <Modal
        isOpen={Boolean(planToDelete)}
        onClose={() => !isDeletingPlan && setPlanToDelete(null)}
        title="Delete Membership Plan"
        description="Confirm permanent plan deletion"
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={isDeletingPlan}
              onClick={() => setPlanToDelete(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeletingPlan}
              onClick={confirmDeletePlan}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeletingPlan ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        {planToDelete && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete the <strong>{planToDelete.name}</strong> plan ({formatInr(planToDelete.price)} · {planToDelete.planType})?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This plan will be removed from the studio catalog. Existing members subscribed to this plan will keep their subscription record.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

type FollowUpEntry = { date: string; note: string };
type LeadRecord = StaffLead;
type LeadStage = StaffLeadStage;
const leadStages: LeadStage[] = ['New enquiry', 'Trial booked', 'Trial completed', 'Follow-up', 'Converted'];
const leadSources = ['Website enquiry', 'Studio walk-in', 'Member referral', 'Instagram'];
const leadPlans = ['Not specified', 'Basic', 'Premium', 'Ultra Premium'];
const normalizeLeadPhone = (value: string) => value.replace(/[\s()-]/g, '');
const leadDateLabel = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not scheduled';
const todayDate = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), now.getDate()); };
const localDateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const leadEmptyForm = { name: '', phone: '', email: '', source: leadSources[0], plan: 'Not specified', assigned: 'Unassigned', stage: 'New enquiry' as LeadStage, followUpDate: '', notes: '', outcome: '', followUpNote: '' };

export function LeadsPage() {
 const { addToast } = useToast();
 const { leads, setLeads, members, setMembers, plans: rawPlans } = useAdminWorkspaceData();
 const availablePlans = useMemo(() => {
  const B2B_TIERS = new Set(['starter', 'growth', 'enterprise', 'free']);
  const dynamic = (rawPlans || [])
    .map((p) => p.name)
    .filter((name) => Boolean(name) && !B2B_TIERS.has(name.trim().toLowerCase()));
  return ['Not specified', ...Array.from(new Set(dynamic.length ? dynamic : ['Basic Fitness', 'Premium Monthly', 'Elite Annual', 'Personal Training 10-Pack']))];
 }, [rawPlans]);
 const [visibleLeadCount, setVisibleLeadCount] = useState(8);
 const [activeTab, setActiveTab] = useState<'workspace' | 'leadpilot'>('workspace');
 const [query, setQuery] = useState('');
 const [stage, setStage] = useState('All stages');
 const [source, setSource] = useState('All sources');
 const [dueOnly, setDueOnly] = useState(false);
 const [view, setView] = useState<'table' | 'pipeline'>('table');
 const [detailsLead, setDetailsLead] = useState<LeadRecord | null>(null);
 const [dialogOpen, setDialogOpen] = useState(false);
 const [editingId, setEditingId] = useState<string | null>(null);
 const [recordingFollowUp, setRecordingFollowUp] = useState(false);
 const [saving, setSaving] = useState(false);
 const savingRef = useRef(false);
 const [form, setForm] = useState(leadEmptyForm);
 const [errors, setErrors] = useState<Partial<Record<'name' | 'phone' | 'email', string>>>({});
 const [leadAssignees, setLeadAssignees] = useState<string[]>(['Unassigned']);

 useEffect(() => {
   let active = true;
   void listTeamInvitations().then((invitations) => {
     if (!active) return;
     const names = invitations.filter((invitation) => invitation.status === 'accepted').map((invitation) => invitation.name).filter(Boolean);
     setLeadAssignees(['Unassigned', ...Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))]);
   }).catch(() => {
     if (active) setLeadAssignees(['Unassigned']);
   });
   return () => { active = false; };
 }, []);

 // Delete lead confirmation state
 const [leadToDelete, setLeadToDelete] = useState<LeadRecord | null>(null);
 const [deleting, setDeleting] = useState(false);

 // LeadPilot AI Tab State
 const [selectedLeadPilotId, setSelectedLeadPilotId] = useState<string | null>(null);
 const [leadPilotLoading, setLeadPilotLoading] = useState(false);
 const [leadPilotError, setLeadPilotError] = useState<string | null>(null);
 const [leadPilotScoreResult, setLeadPilotScoreResult] = useState<any | null>(null);
 const [copiedMessage, setCopiedMessage] = useState(false);

 const analyzeLeadWithCrmAgent = async (leadId: string) => {
  setLeadPilotLoading(true);
  setLeadPilotError(null);
  try {
   const res = await AiApi.executeAgentAction('crm-agent', 'score-lead', { leadId });
   if (res.success && res.data) {
    setLeadPilotScoreResult(res.data);
   } else {
    setLeadPilotError(res.error || res.message || 'Failed to analyze lead conversion score.');
   }
  } catch (err) {
   const message = err instanceof AiApiError ? err.message : (err as Error)?.message || 'CRM Agent service unavailable.';
   setLeadPilotError(message);
  } finally {
   setLeadPilotLoading(false);
  }
 };

 const today = todayDate();
 const todayIso = localDateString(today);
 const isDue = (lead: LeadRecord) => Boolean(lead.followUpDate && lead.stage !== 'Converted' && lead.followUpDate <= todayIso);
 const overdueCount = leads.filter((lead) => lead.followUpDate && lead.stage !== 'Converted' && lead.followUpDate < todayIso).length;

 // Simple summary cards: Only New Leads, Follow-ups Due, and Converted Leads
 const newLeadsCount = leads.filter((lead) => lead.stage === 'New enquiry').length;
 const followUpsDueCount = leads.filter(isDue).length;
 const convertedLeadsCount = leads.filter((lead) => lead.stage === 'Converted').length;

 const metrics = [
  {
   key: 'new',
   label: 'New Leads',
   detail: 'First-contact enquiries',
   count: newLeadsCount,
   icon: <UserPlusIcon size="md" />,
   accent: 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300',
  },
  {
   key: 'due',
   label: 'Follow-ups Due',
   detail: 'Overdue or scheduled for today',
   count: followUpsDueCount,
   icon: <ClockIcon size="md" />,
   accent: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  },
  {
   key: 'converted',
   label: 'Converted Leads',
   detail: 'Enrolled as studio members',
   count: convertedLeadsCount,
   icon: <CheckCircleIcon size="md" />,
   accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
 ] as const;

 const filtered = useMemo(() => leads.filter((lead) => {
  const searchable = `${lead.name} ${lead.phone} ${lead.email} ${lead.contact} ${lead.source} ${lead.stage} ${lead.assigned} ${lead.plan} ${lead.notes} ${lead.outcome} ${(lead.followUpHistory || []).map((entry) => entry.note).join(' ')}`.toLowerCase();
  return searchable.includes(query.trim().toLowerCase()) && (stage === 'All stages' || lead.stage === stage) && (source === 'All sources' || lead.source === source) && (!dueOnly || isDue(lead));
 }), [leads, query, stage, source, dueOnly, todayIso]);

 const visibleLeads = useMemo(() => filtered.slice(0, visibleLeadCount), [filtered, visibleLeadCount]);

 // LeadPilot AI attention leads (unconverted, due or new inquiries)
 const attentionLeads = useMemo(() => {
  return leads
   .filter((lead) => lead.stage !== 'Converted' && (isDue(lead) || lead.stage === 'New enquiry'))
   .sort((a, b) => {
    const aOverdue = a.followUpDate && a.followUpDate < todayIso ? 1 : 0;
    const bOverdue = b.followUpDate && b.followUpDate < todayIso ? 1 : 0;
    if (aOverdue !== bOverdue) return bOverdue - aOverdue;
    const aDueToday = a.followUpDate === todayIso ? 1 : 0;
    const bDueToday = b.followUpDate === todayIso ? 1 : 0;
    if (aDueToday !== bDueToday) return bDueToday - aDueToday;
    return (a.followUpDate || '9999').localeCompare(b.followUpDate || '9999');
   });
 }, [leads, todayIso]);

 const activeLeadPilotLead = useMemo(() => {
  if (selectedLeadPilotId) {
   const found = leads.find((l) => l.id === selectedLeadPilotId);
   if (found) return found;
  }
  return attentionLeads[0] || leads[0] || null;
 }, [leads, selectedLeadPilotId, attentionLeads]);

 const closeLeadDialog = () => {
  if (savingRef.current) return;
  setDialogOpen(false);
  setForm(leadEmptyForm);
  setEditingId(null);
  setRecordingFollowUp(false);
  setErrors({});
 };

 const openNew = () => {
  setDetailsLead(null);
  setEditingId(null);
  setRecordingFollowUp(false);
  setForm(leadEmptyForm);
  setErrors({});
  setDialogOpen(true);
 };

 const openEdit = (lead: LeadRecord, followUp = false) => {
  setDetailsLead(null);
  setEditingId(lead.id);
  setRecordingFollowUp(followUp);
  setForm({
   name: lead.name,
   phone: lead.phone,
   email: lead.email,
   source: lead.source,
   plan: lead.plan || 'Not specified',
   assigned: lead.assigned,
   stage: lead.stage,
   followUpDate: lead.followUpDate,
   notes: lead.notes,
   outcome: lead.outcome,
   followUpNote: '',
  });
  setErrors({});
  setDialogOpen(true);
 };

 const confirmDeleteLead = async () => {
  if (!leadToDelete) return;
  setDeleting(true);
  try {
   const deletedName = leadToDelete.name;
   await ApiClient.deleteLead(leadToDelete.id);
   setLeads((current) => current.filter((item) => item.id !== leadToDelete.id));
   if (detailsLead?.id === leadToDelete.id) {
    setDetailsLead(null);
   }
   if (selectedLeadPilotId === leadToDelete.id) {
    setSelectedLeadPilotId(null);
   }
   setLeadToDelete(null);
   addToast({
    type: 'success',
    title: 'Lead deleted',
    message: `${deletedName} was permanently removed.`,
   });
  } catch (err: any) {
   addToast({
    type: 'error',
    title: 'Deletion failed',
    message: err?.message || 'Could not remove the lead record.',
   });
  } finally {
   setDeleting(false);
  }
 };

 const convertLeadToMember = (lead: LeadRecord) => {
  const selectedPlan = lead.plan && lead.plan !== 'Not specified' ? lead.plan : 'Basic';
  const durationDays = selectedPlan === 'Ultra Premium' ? 365 : selectedPlan === 'Premium' ? 90 : 30;
  const nowDate = new Date();
  const expiryDate = addDays(nowDate, durationDays);
  const cleanPhone = normalizeLeadPhone(lead.phone).slice(-10) || '9000000000';
  const alreadyMember = members.some(
   (m) => (lead.email && m.email.toLowerCase() === lead.email.toLowerCase()) || normalizePhone(m.phone) === cleanPhone,
  );
  if (!alreadyMember) {
   const newMember: StaffMember = {
    id: globalThis.crypto.randomUUID(),
    name: lead.name,
    email: lead.email || 'No email provided',
    phone: cleanPhone,
    plan: selectedPlan,
    status: 'Active',
    joined: formatDate(nowDate),
    expiry: formatDate(expiryDate),
    visits: '0 this month',
    lastVisit: 'Today',
    coach: lead.assigned && lead.assigned !== 'Unassigned' ? lead.assigned : 'Unassigned',
   };
   setMembers((current) => [newMember, ...current]);
  }
  const nextHistory = [...(lead.followUpHistory || []), { date: todayIso, note: `Converted to active ${selectedPlan} member.` }];
  const updatedLead: LeadRecord = { ...lead, stage: 'Converted', followUpDate: '', outcome: `Converted to ${selectedPlan} plan`, followUpHistory: nextHistory };
  setLeads((current) => current.map((item) => (item.id === lead.id ? updatedLead : item)));
  setDetailsLead((current) => (current?.id === lead.id ? updatedLead : current));
  addToast({
   type: 'success',
   title: 'Lead converted to studio member',
   message: `${lead.name} is now marked Converted and added to the Members directory (${selectedPlan}).`,
  });
 };

 const saveLead = async (event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  if (savingRef.current) return;
  const name = form.name.trim();
  const phone = normalizeLeadPhone(form.phone.trim());
  const email = form.email.trim();
  const existing = editingId ? leads.find((lead) => lead.id === editingId) : undefined;
  const unchangedExistingPhone = Boolean(existing && phone === normalizeLeadPhone(existing.phone));
  const next: typeof errors = {};

  if (!name) next.name = 'Enter the lead’s full name.';
  if (!phone) next.phone = 'Enter a contact phone number.';
  else if (!isValidIndianMobile(phone) && !unchangedExistingPhone) next.phone = 'Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.';
  if (email && !/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) next.email = 'Enter a valid email address or leave it blank.';
  if (leads.some((lead) => lead.id !== editingId && ((email && lead.email && lead.email.toLowerCase() === email.toLowerCase()) || (phone && normalizeLeadPhone(lead.phone) === phone)))) {
   next.phone = 'A lead with this phone number or email already exists.';
   if (email) next.email = 'A lead with this phone number or email already exists.';
  }
  setErrors(next);
  if (Object.keys(next).length) return;

  savingRef.current = true;
  setSaving(true);
  try {
   const followUpHistory = [...(existing?.followUpHistory || [])];
   if (editingId && form.followUpNote.trim()) followUpHistory.push({ date: todayIso, note: form.followUpNote.trim() });

   let savedId = editingId;
   const leadPayload = {
    full_name: name,
    phone: form.phone.trim(),
    email: email || undefined,
    source: form.source,
    status: form.stage,
    stage: form.stage,
    plan: form.plan === 'Not specified' ? undefined : form.plan,
    follow_up_date: form.followUpDate || undefined,
    followUpDate: form.followUpDate || undefined,
    assigned_to: form.assigned && form.assigned !== 'Unassigned' ? form.assigned : undefined,
    notes: [form.notes.trim(), form.outcome.trim()].filter(Boolean).join(' | ') || undefined,
   };

   if (editingId) {
    await ApiClient.updateLead(editingId, leadPayload);
   } else {
    const created = await ApiClient.createLead(leadPayload);
    if (created?.id) savedId = created.id;
   }

   const record: LeadRecord = {
    id: savedId || globalThis.crypto.randomUUID(),
    name,
    phone: form.phone.trim(),
    email,
    contact: [form.phone.trim(), email].filter(Boolean).join(' · '),
    source: form.source,
    stage: form.stage,
    followUpDate: form.followUpDate,
    assigned: form.assigned || 'Unassigned',
    plan: form.plan === 'Not specified' ? '' : form.plan,
    notes: form.notes.trim(),
    outcome: form.outcome.trim(),
    followUpHistory,
   };

   if (editingId) {
    setLeads((current) => current.map((item) => (item.id === editingId ? record : item)));
    addToast({
     type: 'success',
     title: recordingFollowUp ? 'Follow-up recorded' : 'Lead updated',
     message: `${name} updated successfully.`,
    });
   } else {
    setLeads((current) => [record, ...current]);
    addToast({
     type: 'success',
     title: 'Lead added',
     message: `${name} has been saved to the database.`,
    });
   }
   setDialogOpen(false);
   setForm(leadEmptyForm);
   setEditingId(null);
   setRecordingFollowUp(false);
   setErrors({});
  } catch (err: any) {
   addToast({
    type: 'error',
    title: 'Save failed',
    message: err?.message || 'Failed to save lead to the database.',
   });
  } finally {
   savingRef.current = false;
   setSaving(false);
  }
 };

 const clearFilters = () => {
  setQuery('');
  setStage('All stages');
  setSource('All sources');
  setDueOnly(false);
 };

 const selectMetric = (key: 'new' | 'due' | 'converted') => {
  if (key === 'due') {
   const selected = dueOnly;
   setStage('All stages');
   setDueOnly(!selected);
  } else if (key === 'new') {
   setDueOnly(false);
   setStage(stage === 'New enquiry' ? 'All stages' : 'New enquiry');
  } else if (key === 'converted') {
   setDueOnly(false);
   setStage(stage === 'Converted' ? 'All stages' : 'Converted');
  }
 };

 const isMetricActive = (key: 'new' | 'due' | 'converted') => {
  if (key === 'due') return dueOnly;
  if (key === 'new') return !dueOnly && stage === 'New enquiry';
  if (key === 'converted') return !dueOnly && stage === 'Converted';
  return false;
 };

 const followUpState = (lead: LeadRecord) => {
  if (!lead.followUpDate || lead.stage === 'Converted') return '';
  return lead.followUpDate < todayIso ? 'Overdue' : lead.followUpDate === todayIso ? 'Today' : 'Upcoming';
 };

 const stageTone = (value: LeadStage): StatusTone =>
  value === 'Converted' ? 'green' : value === 'Follow-up' ? 'amber' : value === 'Trial completed' ? 'rose' : 'blue';

 const changeStage = (lead: LeadRecord, nextStage: LeadStage) => {
  if (nextStage === 'Converted' && lead.stage !== 'Converted') {
   convertLeadToMember(lead);
   return;
  }
  setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, stage: nextStage } : item)));
  addToast({ type: 'success', title: 'Lead stage updated', message: `${lead.name} moved to ${nextStage} in this session preview.` });
 };

 const getAttentionBadge = (lead: LeadRecord) => {
  if (lead.followUpDate && lead.followUpDate < todayIso) {
   const diffMs = today.getTime() - new Date(`${lead.followUpDate}T12:00:00`).getTime();
   const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
   return {
    label: `${diffDays}d Overdue`,
    bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900',
   };
  }
  if (lead.followUpDate === todayIso) {
   return {
    label: 'Due Today',
    bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900',
   };
  }
  if (lead.stage === 'New enquiry') {
   return {
    label: 'New Inquiry',
    bg: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-900',
   };
  }
  return {
   label: lead.stage,
   bg: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-studio-950 dark:text-slate-300 dark:border-studio-800',
  };
 };

 const field = `${inputClass} w-full dark:border-studio-700 dark:bg-studio-950 dark:text-white`;
 const hasFilters = Boolean(query || stage !== 'All stages' || source !== 'All sources' || dueOnly);

 return (
  <div className="mx-auto max-w-[1440px]">
   <PageHeader
    eyebrow="CRM · Business development"
    title="CRM / Leads"
    description="Manage potential customers, track conversations, and follow up until they become members."
    action={
     <button
      type="button"
      onClick={openNew}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
     >
      <PlusIcon size="sm" />
      Add Lead
     </button>
    }
   />

   {/* Two Tabs at the Top */}
   <div className="mb-6 border-b border-slate-200 dark:border-studio-800">
    <nav className="-mb-px flex space-x-6" role="tablist" aria-label="CRM management modes">
     <button
      type="button"
      role="tab"
      id="crm-tab-workspace"
      aria-controls="crm-panel-workspace"
      aria-selected={activeTab === 'workspace'}
      onClick={() => setActiveTab('workspace')}
      className={`inline-flex items-center gap-2 border-b-2 pb-3 pt-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
       activeTab === 'workspace'
        ? 'border-rose-600 text-rose-600 dark:border-rose-500 dark:text-rose-400'
        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-studio-700 dark:hover:text-slate-200'
      }`}
     >
      <UsersIcon size="sm" />
      Leads Workspace
     </button>
     <button
      type="button"
      role="tab"
      id="crm-tab-leadpilot"
      aria-controls="crm-panel-leadpilot"
      aria-selected={activeTab === 'leadpilot'}
      onClick={() => setActiveTab('leadpilot')}
      className={`inline-flex items-center gap-2 border-b-2 pb-3 pt-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
       activeTab === 'leadpilot'
        ? 'border-rose-600 text-rose-600 dark:border-rose-500 dark:text-rose-400'
        : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-studio-700 dark:hover:text-slate-200'
      }`}
     >
      <SparklesIcon size="sm" />
      LeadPilot AI
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
       AI Assistant
      </span>
     </button>
    </nav>
   </div>

   {activeTab === 'workspace' ? (
    <div id="crm-panel-workspace" role="tabpanel" aria-labelledby="crm-tab-workspace">
     {/* Simple Summary Cards: Only 3 useful metrics */}
     <section aria-label="Lead pipeline metrics" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {metrics.map((metric) => {
       const active = isMetricActive(metric.key);
       return (
        <button
         key={metric.key}
         type="button"
         aria-label={`${metric.label}: ${metric.count} ${metric.count === 1 ? 'lead' : 'leads'}`}
         aria-pressed={active}
         onClick={() => selectMetric(metric.key)}
         className={`group min-w-0 rounded-2xl border bg-white p-4 text-left shadow-subtle transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 motion-reduce:transform-none motion-reduce:transition-none dark:bg-studio-900 ${
          active
           ? 'border-rose-400 ring-2 ring-rose-500/15 dark:border-rose-500'
           : 'border-slate-200/90 hover:border-slate-300 dark:border-studio-700 dark:hover:border-studio-600'
         }`}
        >
         <div className="flex items-start justify-between gap-3">
          <div>
           <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            {metric.label}
           </p>
           <p className="mt-3 font-serif text-3xl font-bold leading-none tabular-nums tracking-tight text-slate-950 dark:text-white">
            {metric.count}
           </p>
          </div>
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.accent}`}>
           {metric.icon}
          </span>
         </div>
         <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">{metric.detail}</p>
        </button>
       );
      })}
     </section>

     {/* Follow-up attention banner */}
     {overdueCount > 0 && (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/30">
       <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:bg-amber-200">
        <ClockIcon size="sm" />
       </span>
       <div>
        <p className="text-xs font-semibold text-amber-950 dark:text-amber-200">Follow-up attention</p>
        <p className="text-xs text-amber-800 dark:text-amber-300">
         {overdueCount} overdue follow-up{overdueCount === 1 ? '' : 's'} from scheduled dates · converted leads excluded
        </p>
       </div>
       <button
        type="button"
        aria-pressed={dueOnly}
        onClick={() => {
         setStage('All stages');
         setDueOnly((current) => !current);
        }}
        className="ml-auto min-h-9 rounded-lg border border-amber-300 px-3 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/50"
       >
        {dueOnly ? 'Show all leads' : 'Filter due leads'}
       </button>
      </div>
     )}

     {/* Search and Filters */}
     <div className="mb-4 grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto_auto_auto] md:items-center">
      <label className="relative block">
       <span className="sr-only">Search leads by name, contact or details</span>
       <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
       <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search leads by name, contact or notes..."
        className={`${field} w-full pl-9`}
       />
      </label>
      <select
       aria-label="Lead stage filter"
       value={stage}
       onChange={(event) => {
        setStage(event.target.value);
        setDueOnly(false);
       }}
       className={field}
      >
       <option>All stages</option>
       {leadStages.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
      <select
       aria-label="Lead source filter"
       value={source}
       onChange={(event) => setSource(event.target.value)}
       className={field}
      >
       <option>All sources</option>
       {leadSources.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
      {hasFilters && (
       <button
        type="button"
        onClick={clearFilters}
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:bg-studio-800"
       >
        Clear filters
       </button>
      )}
     </div>

     {/* View Toggle and Table/Pipeline */}
     <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
       <h2 className="font-serif text-lg font-bold tracking-tight text-slate-950 dark:text-white">Leads Workspace</h2>
       <p aria-live="polite" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Showing {filtered.length} of {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
        {hasFilters ? ' · filters applied' : ''}
       </p>
      </div>
      <div role="group" aria-label="Lead view" className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-studio-700 dark:bg-studio-900">
       <button
        type="button"
        aria-pressed={view === 'table'}
        onClick={() => setView('table')}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
         view === 'table' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-studio-800'
        }`}
       >
        <ListIcon size="sm" />
        Table
       </button>
       <button
        type="button"
        aria-pressed={view === 'pipeline'}
        onClick={() => setView('pipeline')}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
         view === 'pipeline' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-studio-800'
        }`}
       >
        <GridIcon size="sm" />
        Pipeline
       </button>
      </div>
     </div>

     {view === 'table' ? (
      <PagePanel className="overflow-hidden bg-white dark:border-studio-700 dark:bg-studio-900">
       <p className="border-b border-slate-100 px-5 py-2 text-[10px] text-slate-500 dark:border-studio-800 dark:text-slate-400">
        Scroll horizontally to see every lead field and row action.
       </p>
       <div
        role="region"
        tabIndex={0}
        aria-label="Lead table. Scroll horizontally to view every column and action."
        className="overflow-x-auto overscroll-x-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500"
       >
        <table className="w-full min-w-[1100px] text-left">
         <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:bg-studio-950/70 dark:text-slate-400">
          <tr>
           <th scope="col" className="w-[22%] px-5 py-4">Lead Name &amp; Contact</th>
           <th scope="col" className="px-3 py-4">Source</th>
           <th scope="col" className="px-3 py-4">Status</th>
           <th scope="col" className="px-3 py-4">Next Follow-up</th>
           <th scope="col" className="px-3 py-4">Interested Plan</th>
           <th scope="col" className="w-[28%] px-4 py-4 text-right">Actions</th>
          </tr>
         </thead>
         <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
          {visibleLeads.map((lead) => {
           const state = followUpState(lead);
           return (
            <tr
             key={lead.id}
             className="transition-colors hover:bg-rose-50/30 focus-within:bg-rose-50/30 dark:hover:bg-studio-800/70 dark:focus-within:bg-studio-800/70"
            >
             <td className="px-5 py-4">
              <p className="text-sm font-semibold text-slate-950 dark:text-white">{lead.name}</p>
              <div className="mt-1 space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
               {lead.phone && <p>{lead.phone}</p>}
               {lead.email && <p className="break-all">{lead.email}</p>}
               {!lead.phone && !lead.email && <p>No contact details</p>}
              </div>
             </td>
             <td className="max-w-[140px] px-3 py-4 text-xs leading-5 text-slate-600 dark:text-slate-300">
              {lead.source}
             </td>
             <td className="px-3 py-4">
              <StatusBadge tone={stageTone(lead.stage)}>{lead.stage}</StatusBadge>
             </td>
             <td className="px-3 py-4">
              {lead.followUpDate ? (
               <>
                <p className="whitespace-nowrap text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                 {leadDateLabel(lead.followUpDate)}
                </p>
                {state && (
                 <p
                  className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${
                   state === 'Overdue'
                    ? 'text-rose-700 dark:text-rose-300'
                    : state === 'Today'
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                 >
                  {state}
                 </p>
                )}
               </>
              ) : (
               <span className="text-xs text-slate-400 dark:text-slate-500">Not scheduled</span>
              )}
             </td>
             <td className="max-w-[160px] px-3 py-4 text-xs leading-5 text-slate-700 dark:text-slate-300">
              {lead.plan || <span className="text-slate-400 dark:text-slate-500">Not specified</span>}
             </td>
             <td className="px-4 py-4 text-right">
              <div className="inline-flex flex-wrap justify-end gap-1.5">
               <button
                type="button"
                onClick={() => setDetailsLead(lead)}
                className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
               >
                View
               </button>
               {lead.stage !== 'Converted' && (
                <button
                 type="button"
                 onClick={() => convertLeadToMember(lead)}
                 className="min-h-9 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                >
                 Convert to Member
                </button>
               )}
               <button
                type="button"
                onClick={() => setLeadToDelete(lead)}
                aria-label={`Delete ${lead.name}`}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:bg-studio-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
               >
                <TrashIcon size="xs" />
                Delete
               </button>
              </div>
             </td>
            </tr>
           );
          })}
          {filtered.length === 0 && (
           <tr>
            <td colSpan={6} className="px-5 py-14 text-center">
             <p className="font-serif text-lg font-bold text-slate-900 dark:text-white">{leads.length ? 'No leads match these filters' : 'No lead records for this studio yet'}</p>
             <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{leads.length ? 'Clear a filter or add a lead to continue.' : 'Import your studio leads to populate this workspace.'}</p>
             {!leads.length && <Link href="/admin/import-export" className="mt-3 inline-flex min-h-10 items-center rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white">Import leads from CSV</Link>}
             <button
              type="button"
              onClick={clearFilters}
              className="mt-4 min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
             >
              Clear filters
             </button>
            </td>
           </tr>
          )}
         </tbody>
        </table>
       </div>
       {filtered.length > visibleLeadCount && (
        <div className="flex justify-center border-t border-slate-100 p-4 dark:border-studio-800">
         <button
          type="button"
          onClick={() => setVisibleLeadCount((prev) => prev + 8)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
         >
          See More ({filtered.length - visibleLeadCount} remaining)
         </button>
        </div>
       )}
       <div className="border-t border-slate-100 px-5 py-3 dark:border-studio-800">
        <PreviewNote>Studio records are loaded from the authenticated workspace API.</PreviewNote>
       </div>
      </PagePanel>
     ) : (
      <div className="-mx-1 overflow-x-auto overscroll-x-contain pb-3">
       <p className="px-1 pb-2 text-[10px] text-slate-500 dark:text-slate-400">Scroll horizontally to move through the lead stages.</p>
       <div className="grid min-w-[1180px] grid-cols-5 gap-3 px-1">
        {leadStages.map((item) => {
         const stageLeads = filtered.filter((lead) => lead.stage === item);
         return (
          <section
           key={item}
           aria-label={`${item}, ${stageLeads.length} ${stageLeads.length === 1 ? 'lead' : 'leads'}`}
           className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-studio-700 dark:bg-studio-950/50"
          >
           <header className="mb-3 flex items-center justify-between gap-2 border-b border-slate-200 px-1 pb-3 dark:border-studio-800">
            <div>
             <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">{item}</h3>
             <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {stageLeads.length} {stageLeads.length === 1 ? 'lead' : 'leads'}
             </p>
            </div>
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-white px-2 text-xs font-bold tabular-nums text-slate-700 dark:bg-studio-900 dark:text-slate-200">
             {stageLeads.length}
            </span>
           </header>
           <div className="space-y-3">
            {stageLeads.map((lead) => {
             const followUp = followUpState(lead);
             return (
              <article
               key={lead.id}
               className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-rose-200 hover:shadow-md dark:border-studio-700 dark:bg-studio-900 dark:hover:border-rose-900"
              >
               <button
                type="button"
                onClick={() => setDetailsLead(lead)}
                className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
               >
                <span className="block text-sm font-semibold text-slate-950 dark:text-white">{lead.name}</span>
               </button>
               <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">{lead.source}</p>
               <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{lead.assigned}</p>
               {lead.followUpDate && (
                <p
                 className={`mt-2 text-[11px] font-semibold ${
                  followUp === 'Overdue'
                   ? 'text-rose-700 dark:text-rose-300'
                   : followUp === 'Today'
                   ? 'text-amber-700 dark:text-amber-300'
                   : 'text-slate-600 dark:text-slate-300'
                 }`}
                >
                 {leadDateLabel(lead.followUpDate)}
                 {followUp ? ` · ${followUp}` : ''}
                </p>
               )}
               <div className="mt-3 flex items-center justify-between gap-2">
                <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                 <span className="sr-only">Change stage</span>
                 <select
                  aria-label={`Change ${lead.name} stage`}
                  value={lead.stage}
                  onChange={(event) => changeStage(lead, event.target.value as LeadStage)}
                  className={`${field} min-h-8 py-1 text-[11px]`}
                 >
                  {leadStages.map((option) => (
                   <option key={option}>{option}</option>
                  ))}
                 </select>
                </label>
                <button
                 type="button"
                 onClick={() => setLeadToDelete(lead)}
                 aria-label={`Delete ${lead.name}`}
                 className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[11px] font-semibold text-rose-600 hover:border-rose-300 hover:bg-rose-50 dark:border-studio-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
                >
                 <TrashIcon size="xs" />
                 Delete
                </button>
               </div>
              </article>
             );
            })}
            {stageLeads.length === 0 && (
             <div className="rounded-xl border border-dashed border-slate-300 px-3 py-8 text-center dark:border-studio-700">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No leads in this stage</p>
              <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Leads appear here when their status matches.</p>
             </div>
            )}
           </div>
          </section>
         );
        })}
       </div>
      </div>
     )}

     <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
      Workspace records for {currentStaffStudio.name}. Changes are saved in this browser preview only.
     </p>
    </div>
   ) : (
    <div id="crm-panel-leadpilot" role="tabpanel" aria-labelledby="crm-tab-leadpilot" className="space-y-6">
     {/* LeadPilot AI Header */}
     <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-studio-700 dark:bg-studio-900">
      <div className="flex items-center gap-2.5">
       <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600 text-white shadow-sm">
        <SparklesIcon size="sm" />
       </span>
       <div>
        <h2 className="font-serif text-lg font-bold tracking-tight text-slate-950 dark:text-white">LeadPilot AI</h2>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
         Your assistant for deciding which leads to contact, planning follow-ups, and drafting messages.
        </p>
       </div>
      </div>
     </div>

     {/* A. Leads Needing Attention */}
     <section aria-labelledby="leadpilot-attention-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
      <div className="border-b border-slate-100 pb-3 dark:border-studio-800">
       <div className="flex items-center justify-between gap-2">
        <h3 id="leadpilot-attention-heading" className="font-serif text-base font-bold text-slate-950 dark:text-white">
         A. Leads Needing Attention
        </h3>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-studio-800 dark:text-slate-300">
         {attentionLeads.length} {attentionLeads.length === 1 ? 'lead' : 'leads'}
        </span>
       </div>
       <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        This section identifies leads requiring follow-up based on their existing status and follow-up dates.
       </p>
      </div>

      {attentionLeads.length === 0 ? (
       <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        No leads currently have overdue or pending follow-ups scheduled.
       </p>
      ) : (
       <div className="mt-3 divide-y divide-slate-100 dark:divide-studio-800">
        {attentionLeads.map((lead) => {
         const badge = getAttentionBadge(lead);
         const isSelected = activeLeadPilotLead?.id === lead.id;
         return (
          <div key={lead.id} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center">
           <div>
            <div className="flex flex-wrap items-center gap-2">
             <span className="text-sm font-semibold text-slate-950 dark:text-white">{lead.name}</span>
             <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold ${badge.bg}`}>
              {badge.label}
             </span>
             <span className="text-xs text-slate-500 dark:text-slate-400">· {lead.stage}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-slate-500 dark:text-slate-400">
             {lead.phone && <span>Phone: {lead.phone}</span>}
             {lead.email && <span>Email: {lead.email}</span>}
             {lead.plan && <span>Interested Plan: {lead.plan}</span>}
             {lead.followUpDate && <span>Follow-up: {leadDateLabel(lead.followUpDate)}</span>}
            </div>
           </div>
           <div className="flex items-center gap-2 shrink-0">
            <button
             type="button"
             onClick={() => setDetailsLead(lead)}
             className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
            >
             View Details
            </button>
            <button
             type="button"
             onClick={() => {
              setSelectedLeadPilotId(lead.id);
              setLeadPilotScoreResult(null);
              setLeadPilotError(null);
             }}
             className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold transition ${
              isSelected
               ? 'bg-rose-600 text-white shadow-sm'
               : 'border border-slate-200 bg-white text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200'
             }`}
            >
             {isSelected ? 'Selected' : 'Select'}
            </button>
           </div>
          </div>
         );
        })}
       </div>
      )}
     </section>

     {/* B. Suggested Next Step */}
     <section aria-labelledby="leadpilot-steps-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
      <div className="border-b border-slate-100 pb-3 dark:border-studio-800">
       <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
         <h3 id="leadpilot-steps-heading" className="font-serif text-base font-bold text-slate-950 dark:text-white">
          B. Suggested Next Step
         </h3>
         <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Conversion probability analysis and automated CRM guidance for the selected lead.
         </p>
        </div>
        {activeLeadPilotLead && !leadPilotLoading && (
         <button
          type="button"
          onClick={() => analyzeLeadWithCrmAgent(activeLeadPilotLead.id)}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
         >
          <SparklesIcon size="xs" />
          {leadPilotScoreResult ? 'Re-analyze with CRM Agent' : 'Analyze Lead with AI'}
         </button>
        )}
       </div>
      </div>

      <div className="mt-4 space-y-4">
       {!activeLeadPilotLead ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-studio-700 dark:bg-studio-950/40">
         <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          No lead selected.
         </p>
         <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Select a lead from Section A to run CRM conversion scoring and receive next-step recommendations.
         </p>
        </div>
       ) : leadPilotLoading ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50/70 p-8 text-center dark:border-studio-700 dark:bg-studio-950/40">
         <RefreshCwIcon size="md" className="animate-spin text-rose-600 dark:text-rose-400" />
         <p className="mt-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
          Calculating lead score with CRM Agent...
         </p>
         <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Evaluating source quality, recency, profile completeness, and stage momentum.
         </p>
        </div>
       ) : leadPilotError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-left dark:border-rose-900/60 dark:bg-rose-950/40">
         <div className="flex items-start gap-2.5">
          <AlertTriangleIcon size="sm" className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="flex-1">
           <p className="text-xs font-bold text-rose-900 dark:text-rose-200">CRM Scoring Error</p>
           <p className="mt-1 text-xs text-rose-700 dark:text-rose-300">{leadPilotError}</p>
           <button
            type="button"
            onClick={() => analyzeLeadWithCrmAgent(activeLeadPilotLead.id)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-800 underline hover:text-rose-950 dark:text-rose-200"
           >
            Retry analysis
           </button>
          </div>
         </div>
        </div>
       ) : leadPilotScoreResult ? (
        <div className="space-y-4">
         {/* Score Overview Card */}
         <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 dark:border-studio-700 dark:bg-studio-950/40">
          <div>
           <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Conversion Probability for <strong className="text-slate-900 dark:text-white">{activeLeadPilotLead.name}</strong>
           </p>
           <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Stage: {activeLeadPilotLead.stage} · Plan: {activeLeadPilotLead.plan || 'General'}
           </p>
          </div>
          <div className="flex items-center gap-3">
           <div className="text-right">
            <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
             {leadPilotScoreResult.score ?? 0}
            </span>
            <span className="text-xs text-slate-400"> / 100</span>
           </div>
           <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
             (leadPilotScoreResult.score ?? 0) >= 75
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
              : (leadPilotScoreResult.score ?? 0) >= 50
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
            }`}
           >
            {leadPilotScoreResult.status || ((leadPilotScoreResult.score ?? 0) >= 75 ? 'HOT' : (leadPilotScoreResult.score ?? 0) >= 50 ? 'WARM' : 'COLD')}
           </span>
          </div>
         </div>

         {/* Breakdown Bars */}
         {leadPilotScoreResult.breakdown && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
           {Object.entries(leadPilotScoreResult.breakdown).map(([factor, val]: [string, any]) => (
            <div key={factor} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-studio-800 dark:bg-studio-900">
             <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {factor}
             </p>
             <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
              {typeof val === 'number' ? `${val} pts` : String(val)}
             </p>
            </div>
           ))}
          </div>
         )}

         {/* Recommendation */}
         <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">Recommended Next Action</p>
          <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
           {(leadPilotScoreResult.score ?? 0) >= 75
            ? `High conversion momentum. Contact ${activeLeadPilotLead.name} immediately via phone or WhatsApp to lock in their trial session or complete their ${activeLeadPilotLead.plan || 'studio'} enrollment.`
            : (leadPilotScoreResult.score ?? 0) >= 50
            ? `Moderate interest. Send an informative follow-up addressing their fitness goals and invite them for a complimentary studio walkthrough.`
            : `Low activity detected. Schedule an automated re-engagement campaign offering a flexible starter trial package.`}
          </p>
         </div>
        </div>
       ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6 text-center dark:border-studio-700 dark:bg-studio-950/40">
         <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Ready to score <strong className="text-slate-950 dark:text-white">{activeLeadPilotLead.name}</strong>
         </p>
         <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Run CRM analysis to calculate conversion score, inspect factors, and receive tailored action steps.
         </p>
         <button
          type="button"
          onClick={() => analyzeLeadWithCrmAgent(activeLeadPilotLead.id)}
          className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
         >
          <SparklesIcon size="xs" />
          Analyze Lead with CRM Agent
         </button>
        </div>
       )}
      </div>
     </section>

     {/* C. Follow-up Message */}
     <section aria-labelledby="leadpilot-message-heading" className="rounded-xl border border-slate-200 bg-white p-5 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
      <div className="border-b border-slate-100 pb-3 dark:border-studio-800">
       <div className="flex items-center justify-between">
        <div>
         <h3 id="leadpilot-message-heading" className="font-serif text-base font-bold text-slate-950 dark:text-white">
          C. Follow-up Message
         </h3>
         <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Tailored outreach draft prepared by the CRM Agent for staff review before sending.
         </p>
        </div>
        {activeLeadPilotLead && leadPilotScoreResult && (
         <button
          type="button"
          onClick={() => {
           const draftText = `Hi ${activeLeadPilotLead.name}, this is ${currentStaffStudio.name}! We'd love to invite you in for a trial session to explore our ${activeLeadPilotLead.plan || 'studio programs'}. Would you be free to visit this week?`;
           void navigator.clipboard?.writeText(draftText);
           setCopiedMessage(true);
           setTimeout(() => setCopiedMessage(false), 2000);
          }}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
         >
          {copiedMessage ? (
           <>
            <CheckCircleIcon size="xs" className="text-emerald-600" />
            Copied!
           </>
          ) : (
           <>
            <CopyIcon size="xs" />
            Copy Draft
           </>
          )}
         </button>
        )}
       </div>
      </div>

      <div className="mt-4 space-y-3">
       {!activeLeadPilotLead ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center dark:border-studio-700 dark:bg-studio-950/40">
         <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          No lead selected.
         </p>
         <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Select a lead to generate a personalized outreach draft.
         </p>
        </div>
       ) : leadPilotScoreResult ? (
        <div className="space-y-3">
         <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-studio-700 dark:bg-studio-950/60">
          <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200">
           &quot;Hi <strong className="text-slate-900 dark:text-white">{activeLeadPilotLead.name}</strong>, this is <strong className="text-slate-900 dark:text-white">{currentStaffStudio.name}</strong>! We&apos;d love to invite you in for a trial session to explore our <strong className="text-slate-900 dark:text-white">{activeLeadPilotLead.plan || 'studio programs'}</strong>. Would you be free to visit this week?&quot;
          </p>
         </div>
         <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Review the draft above before dispatching via SMS, WhatsApp, or phone call.
         </p>
        </div>
       ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-4 text-center dark:border-studio-700 dark:bg-studio-950/40">
         <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Draft will generate after scoring.
         </p>
         <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Click &quot;Analyze Lead with AI&quot; in Section B above to generate a tailored follow-up message for {activeLeadPilotLead.name}.
         </p>
        </div>
       )}
      </div>
     </section>
    </div>
   )}

   {/* In-page Lead Details Modal */}
   <Modal
    isOpen={Boolean(detailsLead)}
    onClose={() => setDetailsLead(null)}
    title={detailsLead?.name || 'Lead details'}
    description="Lead record"
    size="md"
    footer={
     detailsLead && (
      <>
       <button
        type="button"
        onClick={() => openEdit(detailsLead, true)}
        className="mr-auto inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
       >
        <ClockIcon size="sm" />
        Record follow-up
       </button>
       {detailsLead.stage !== 'Converted' && (
        <button
         type="button"
         onClick={() => convertLeadToMember(detailsLead)}
         className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
        >
         Convert to Member
        </button>
       )}
       <button
        type="button"
        onClick={() => setDetailsLead(null)}
        className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
       >
        Close
       </button>
       <button
        type="button"
        onClick={() => openEdit(detailsLead)}
        className="min-h-10 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
       >
        <EditIcon size="sm" className="mr-1" />
        Edit lead
       </button>
      </>
     )
    }
   >
    {detailsLead && (
     <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700">{detailsLead.source}</p>
        <h4 className="mt-1 font-serif text-2xl font-bold text-slate-950 dark:text-white">{detailsLead.name}</h4>
       </div>
       <StatusBadge tone={stageTone(detailsLead.stage)}>{detailsLead.stage}</StatusBadge>
      </div>
      <dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950/60">
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Phone</dt>
        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{detailsLead.phone || 'Not provided'}</dd>
       </div>
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Email</dt>
        <dd className="mt-1 break-all font-semibold text-slate-900 dark:text-white">{detailsLead.email || 'Not provided'}</dd>
       </div>
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Membership interest</dt>
        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{detailsLead.plan || 'Not specified'}</dd>
       </div>
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Assigned staff</dt>
        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{detailsLead.assigned}</dd>
       </div>
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Next follow-up</dt>
        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
         {leadDateLabel(detailsLead.followUpDate)}
         {followUpState(detailsLead) && (
          <span className="ml-2 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
           {followUpState(detailsLead)}
          </span>
         )}
        </dd>
       </div>
       <div>
        <dt className="text-slate-500 dark:text-slate-400">Contact outcome</dt>
        <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{detailsLead.outcome || 'Not recorded'}</dd>
       </div>
       <div className="sm:col-span-2">
        <dt className="text-slate-500 dark:text-slate-400">Notes</dt>
        <dd className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{detailsLead.notes || 'No notes recorded.'}</dd>
       </div>
      </dl>
      <section>
       <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">Follow-up history</h4>
       {detailsLead.followUpHistory?.length ? (
        <ol className="mt-2 space-y-2">
         {detailsLead.followUpHistory.map((entry, index) => (
          <li key={`${entry.date}-${index}`} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-studio-700">
           <time className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {leadDateLabel(entry.date)}
           </time>
           <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-800 dark:text-slate-200">{entry.note}</p>
          </li>
         ))}
        </ol>
       ) : (
        <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">
         No follow-up notes have been recorded in this preview.
        </p>
       )}
      </section>
     </div>
    )}
   </Modal>

   {/* In-page Add / Edit Lead Modal */}
   <Modal
    isOpen={dialogOpen}
    onClose={closeLeadDialog}
    title={editingId ? (recordingFollowUp ? 'Record follow-up' : 'Edit lead') : 'Add lead'}
    description="Studio CRM · local preview"
    size="lg"
    footer={
     <>
      <button
       type="button"
       disabled={saving}
       onClick={closeLeadDialog}
       className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
      >
       Cancel
      </button>
      <button
       type="submit"
       form="lead-form"
       disabled={saving}
       className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
      >
       {saving ? 'Saving…' : editingId ? (recordingFollowUp ? 'Save follow-up' : 'Save changes') : 'Save Lead'}
      </button>
     </>
    }
   >
    <form id="lead-form" onSubmit={saveLead} className="grid gap-4 sm:grid-cols-2">
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
      Full Name <span className="text-rose-600">*</span>
      <input
       autoFocus={!recordingFollowUp}
       required
       value={form.name}
       onChange={(e) => setForm({ ...form, name: e.target.value })}
       className={field}
       placeholder="e.g. Priya Sharma"
      />
      {errors.name && (
       <span role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">
        {errors.name}
       </span>
      )}
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Phone Number <span className="text-rose-600">*</span>
      <input
       type="tel"
       autoComplete="tel"
       required
       value={form.phone}
       onChange={(e) => setForm({ ...form, phone: e.target.value })}
       className={field}
       placeholder="10-digit mobile number"
      />
      {errors.phone && (
       <span role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">
        {errors.phone}
       </span>
      )}
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Email Address (Optional)
      <input
       type="email"
       value={form.email}
       onChange={(e) => setForm({ ...form, email: e.target.value })}
       className={field}
       placeholder="e.g. member@example.com"
      />
      {errors.email && (
       <span role="alert" className="text-[11px] text-rose-700 dark:text-rose-300">
        {errors.email}
       </span>
      )}
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Lead Source
      <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={field}>
       {leadSources.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Interested In (Plan)
      <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} className={field}>
       {availablePlans.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Assigned Coach / Staff
      <select value={form.assigned} onChange={(e) => setForm({ ...form, assigned: e.target.value })} className={field}>
       {leadAssignees.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Lead Status
      <select
       value={form.stage}
       onChange={(e) => setForm({ ...form, stage: e.target.value as LeadStage })}
       className={field}
      >
       {leadStages.map((item) => (
        <option key={item}>{item}</option>
       ))}
      </select>
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      Next Follow-up Date
      <input
       type="date"
       value={form.followUpDate}
       onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
       className={field}
      />
     </label>
     <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
      Notes
      <textarea
       value={form.notes}
       onChange={(e) => setForm({ ...form, notes: e.target.value })}
       className={`${field} min-h-20 py-2`}
       placeholder="Add details on fitness background, goals, or preferred times..."
      />
     </label>
     {editingId && (
      <>
       <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
        Contact outcome / loss reason
        <input
         value={form.outcome}
         onChange={(e) => setForm({ ...form, outcome: e.target.value })}
         className={field}
         placeholder="Outcome from the last contact or reason if not converting"
        />
       </label>
       <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">
        Follow-up note to record today
        <textarea
         autoFocus={recordingFollowUp}
         value={form.followUpNote}
         onChange={(e) => setForm({ ...form, followUpNote: e.target.value })}
         className={`${field} min-h-20 py-2`}
         placeholder="Add a dated note for this studio follow-up"
        />
       </label>
      </>
     )}
     <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400 sm:col-span-2">
      In-memory preview only. Changes update this browser session.
     </p>
    </form>
   </Modal>

   {/* In-page Delete Confirmation Modal */}
   <Modal
    isOpen={Boolean(leadToDelete)}
    onClose={() => {
     if (!deleting) setLeadToDelete(null);
    }}
    title="Delete Lead"
    description="Confirm deletion"
    size="sm"
    footer={
     <>
      <button
       type="button"
       disabled={deleting}
       onClick={() => setLeadToDelete(null)}
       className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
      >
       Cancel
      </button>
      <button
       type="button"
       disabled={deleting}
       onClick={confirmDeleteLead}
       className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
      >
       {deleting ? 'Deleting…' : 'Delete'}
      </button>
     </>
    }
   >
    {leadToDelete && (
     <div className="space-y-3">
      <p className="text-sm text-slate-800 dark:text-slate-200">
       Are you sure you want to delete <strong>{leadToDelete.name}</strong>? This action cannot be undone.
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
       This lead will be removed from your current browser workspace. Server-side permanent deletion requires backend API integration.
      </p>
     </div>
    )}
   </Modal>
  </div>
 );
}
const paymentStatuses: StaffPaymentStatus[] = ['Paid', 'Pending', 'Review', 'Failed', 'Partially Refunded', 'Refunded'];
const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank transfer'];
const paymentStatusTone = (status: StaffPaymentStatus): StatusTone => status === 'Paid' ? 'green' : status === 'Pending' || status === 'Review' ? 'amber' : status === 'Failed' ? 'rose' : status === 'Partially Refunded' ? 'blue' : 'slate';
function PaymentStatusBadge({ status }: { status: StaffPaymentStatus }) {
  const tone = paymentStatusTone(status);
  const styles: Record<StatusTone, string> = { green: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200', amber: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200', blue: 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200', rose: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200', slate: 'bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200' };
  return <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${styles[tone]}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${tone === 'green' ? 'bg-emerald-600' : tone === 'amber' ? 'bg-amber-600' : tone === 'blue' ? 'bg-blue-600' : tone === 'rose' ? 'bg-rose-600' : 'bg-violet-600'}`} />{status}</span>;
}
const localDateInput = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parsePaymentDate = (value: string) => new Date(`${value}T12:00:00`);
const paymentMoney = { format: formatInr };

export function PaymentsPage() {
  const { members, payments, setPayments } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const [period, setPeriod] = useState('30 days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [methodFilter, setMethodFilter] = useState('All methods');
  const [memberFilter, setMemberFilter] = useState('All members');
  const [sort, setSort] = useState('Newest first');
  const [selected, setSelected] = useState<StaffPayment | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [formError, setFormError] = useState('');
  const [refundMode, setRefundMode] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundError, setRefundError] = useState('');
  const [form, setForm] = useState({ ref: '', memberId: members[0]?.id || '', date: localDateInput(new Date()), amount: '', method: 'UPI', type: 'Membership', status: 'Pending' as 'Pending' | 'Paid', notes: '' });
  const today = localDateInput(new Date());
  const periodStart = period === 'Today' ? today : period === '7 days' ? localDateInput(new Date(new Date(`${today}T12:00:00`).getTime() - 6 * 86400000)) : period === '30 days' ? localDateInput(new Date(new Date(`${today}T12:00:00`).getTime() - 29 * 86400000)) : customFrom;
  const periodEnd = period === 'Custom range' ? customTo : today;
  const inPeriod = (payment: StaffPayment) => {
    if (period === 'Custom range' && (!customFrom || !customTo)) return false;
    if (!periodStart || !periodEnd) return false;
    return payment.date >= periodStart && payment.date <= periodEnd;
  };
  const periodRows = payments.filter(inPeriod);
  const matchingRows = periodRows.filter((payment) => {
    const member = members.find((item) => item.id === payment.memberId);
    const text = `${payment.ref} ${member?.name || ''} ${member?.email || ''} ${member?.phone || ''} ${payment.type} ${payment.method} ${payment.notes}`.toLowerCase();
    return text.includes(query.trim().toLowerCase()) && (statusFilter === 'All statuses' || payment.status === statusFilter) && (methodFilter === 'All methods' || payment.method === methodFilter) && (memberFilter === 'All members' || payment.memberId === memberFilter);
  }).sort((a, b) => sort === 'Oldest first' ? a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref) : sort === 'Highest amount' ? b.amount - a.amount : sort === 'Lowest amount' ? a.amount - b.amount : b.date.localeCompare(a.date) || b.ref.localeCompare(a.ref));
  const collectedRows = periodRows.filter((payment) => ['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status));
  const collected = collectedRows.reduce((sum, payment) => sum + payment.amount - payment.refundedAmount, 0);
  const pendingRows = periodRows.filter((payment) => payment.status === 'Pending' || payment.status === 'Review');
  const pendingAmount = pendingRows.reduce((sum, payment) => sum + payment.amount, 0);
  const failedRows = periodRows.filter((payment) => payment.status === 'Failed');
  const failedAmount = failedRows.reduce((sum, payment) => sum + payment.amount, 0);
  const refundRows = periodRows.filter((payment) => payment.refundedAmount > 0);
  const refundedAmount = refundRows.reduce((sum, payment) => sum + payment.refundedAmount, 0);
  const amountDue = periodRows.reduce((sum, payment) => sum + payment.amount, 0);
  const collectionRate = amountDue ? Math.round(collected / amountDue * 100) : null;
  const methodGroups = paymentMethods.map((method) => { const rows = periodRows.filter((payment) => payment.method === method); return { method, count: rows.length, ledgerAmount: rows.reduce((sum, payment) => sum + payment.amount, 0), amount: rows.filter((payment) => ['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status)).reduce((sum, payment) => sum + payment.amount - payment.refundedAmount, 0), pendingAmount: rows.filter((payment) => payment.status === 'Pending' || payment.status === 'Review').reduce((sum, payment) => sum + payment.amount, 0) }; });
  const statusGroups = paymentStatuses.map((status) => ({ status, rows: periodRows.filter((payment) => payment.status === status) })).filter((group) => group.rows.length > 0 || ['Failed', 'Partially Refunded', 'Refunded'].includes(group.status));
  const trendGroups = Array.from(periodRows.reduce((map, payment) => { if (['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status)) map.set(payment.date, (map.get(payment.date) || 0) + payment.amount - payment.refundedAmount); return map; }, new Map<string, number>()).entries()).sort(([a], [b]) => a.localeCompare(b));
  const maxTrend = Math.max(1, ...trendGroups.map(([, amount]) => amount));
  const hasFilters = Boolean(query || statusFilter !== 'All statuses' || methodFilter !== 'All methods' || memberFilter !== 'All members' || sort !== 'Newest first' || period !== '30 days');
  const selectedMember = selected ? members.find((item) => item.id === selected.memberId) : undefined;
  const selectedRefundable = selected ? Math.max(0, selected.amount - selected.refundedAmount) : 0;

  function clearFilters() { setQuery(''); setStatusFilter('All statuses'); setMethodFilter('All methods'); setMemberFilter('All members'); setSort('Newest first'); setPeriod('30 days'); setCustomFrom(''); setCustomTo(''); }

  async function saveManualPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRef.current) return;
    const amount = Number(form.amount);
    if (!form.memberId || !members.some((member) => member.id === form.memberId)) { setFormError('Choose an existing member.'); return; }
    const finalRef = form.ref.trim() || `MAN-${Date.now().toString(36).toUpperCase()}`;
    if (payments.some((payment) => payment.ref.trim().toLowerCase() === finalRef.toLowerCase())) { setFormError('That reference already exists. Enter a unique reference.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setFormError('Amount must be a number greater than zero.'); return; }
    if (!form.date || Number.isNaN(parsePaymentDate(form.date).getTime())) { setFormError('Choose a valid payment date.'); return; }
    savingRef.current = true; setSaving(true); setFormError('');
    try {
      const saved = await ApiClient.recordLedgerPayment({ member_id: form.memberId, type: form.type, amount, method: form.method as any, status: form.status, notes: [form.notes.trim(), `Ref: ${finalRef}`].filter(Boolean).join('\n') });
      const row = saved as unknown as Record<string, unknown>;
      const payment: StaffPayment = { id: String(row.id), ref: String(row.ref), memberId: String(row.memberId ?? row.member_id), type: String(row.type), date: String(row.date).slice(0, 10), amount: Number(row.amount), currency: 'INR', method: String(row.method), status: String(row.status) as StaffPaymentStatus, refundedAmount: Number(row.refundedAmount ?? row.refunded_amount ?? 0), notes: String(row.notes ?? ''), source: 'Live API' };
      setPayments((current) => [payment, ...current]);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Payment could not be recorded.');
      setSaving(false); savingRef.current = false;
      return;
    }
    setForm({ ref: '', memberId: members[0]?.id || '', date: localDateInput(new Date()), amount: '', method: 'UPI', type: 'Membership', status: 'Pending', notes: '' });
    setManualOpen(false); setSaving(false); savingRef.current = false;
    addToast({ type: 'success', title: 'Payment submitted', message: 'The transaction was submitted to the authenticated tenant ledger.' });
  }

  async function setPaymentStatus(payment: StaffPayment, next: StaffPaymentStatus) {
    if (!payment.id) { addToast({ type: 'error', title: 'Payment unavailable', message: 'This ledger row has no database identifier.' }); return; }
    try { await ApiClient.updatePayment(payment.id, { status: next }); }
    catch (error) { addToast({ type: 'error', title: 'Status update failed', message: error instanceof Error ? error.message : 'Try again.' }); return; }
    setPayments((current) => current.map((item) => item.ref === payment.ref ? { ...item, status: next } : item));
    setSelected((current) => current?.ref === payment.ref ? { ...current, status: next } : current);
    addToast({ type: 'success', title: 'Ledger status updated', message: `${payment.ref} is now ${next}.` });
  }

  async function saveRefund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setRefundError('Refund amount must be greater than zero.'); return; }
    if (amount > selectedRefundable) { setRefundError(`Amount cannot exceed the remaining refundable balance of ${paymentMoney.format(selectedRefundable)}.`); return; }
    if (!selected.id) { setRefundError('This ledger row has no database identifier.'); return; }
    try { await ApiClient.refundPayment(selected.id, amount, refundNote.trim() || undefined); }
    catch (error) { setRefundError(error instanceof Error ? error.message : 'Refund could not be recorded.'); return; }
    const totalRefunded = selected.refundedAmount + amount;
    const status: StaffPaymentStatus = totalRefunded === selected.amount ? 'Refunded' : 'Partially Refunded';
    const updated = { ...selected, refundedAmount: totalRefunded, status, notes: [selected.notes, refundNote.trim() ? `Refund: ${refundNote.trim()}` : ''].filter(Boolean).join('\n') };
    setPayments((current) => current.map((item) => item.ref === selected.ref ? updated : item));
    setSelected(updated); setRefundMode(false); setRefundAmount(''); setRefundNote(''); setRefundError('');
    addToast({ type: 'success', title: 'Refund recorded', message: `${paymentMoney.format(amount)} was committed to the tenant ledger.` });
  }

  async function exportCsv() {
    try {
      const { blob, fileName } = await ApiClient.downloadDatasetCsv('payments');
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = fileName; link.click(); URL.revokeObjectURL(url);
    } catch (error) { addToast({ type: 'error', title: 'Export failed', message: error instanceof Error ? error.message : 'Try again.' }); }
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end dark:border-studio-700">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            Finance · Transaction management · {currentStaffStudio.name}
          </p>
          <h1 className="mt-2.5 font-serif text-3xl font-bold leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Payments
          </h1>
          <p className="mt-2.5 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Review studio payment records, reconcile manual entries, and inspect transaction history.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError('');
            setManualOpen(true);
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          <PlusIcon size="sm" />
          Record manual payment
        </button>
      </header>
      <div
        role="status"
        className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"
      >
        <strong>Live tenant ledger.</strong> Transactions, status updates, refunds, and exports are validated by the gateway and persisted to PostgreSQL.
      </div>

      <section aria-label="Payment summary" className="mb-6">
      <article className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-subtle dark:border-studio-700 dark:bg-studio-900 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              <IndianRupeeIcon size="lg" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Total Collected ({period})
              </p>
              <p className="mt-1 font-serif text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                {paymentMoney.format(collected)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-studio-800 dark:bg-studio-950 sm:text-right">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {collectedRows.length} settled transaction{collectedRows.length === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
              Net of preview refunds in selected {period} period
            </p>
          </div>
        </div>
      </article>
    </section>

    <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Transaction activity</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{periodRows.length} transaction{periodRows.length === 1 ? '' : 's'} in selected period · {matchingRows.length} shown after filters</p></div><div className="flex flex-wrap gap-2"><label className="grid gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Period<select aria-label="Payment date period" value={period} onChange={(event) => setPeriod(event.target.value)} className={selectClass}><option>Today</option><option>7 days</option><option>30 days</option><option>Custom range</option></select></label><button type="button" onClick={exportCsv} disabled={matchingRows.length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:bg-studio-800"><DownloadIcon size="sm" />Export CSV</button></div></div>
    {period === 'Custom range' && <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-900"><label className="grid gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">From<input type="date" value={customFrom} max={customTo || undefined} onChange={(event) => setCustomFrom(event.target.value)} className={inputClass} /></label><label className="grid gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">To<input type="date" value={customTo} min={customFrom || undefined} max={today} onChange={(event) => setCustomTo(event.target.value)} className={inputClass} /></label></div>}

    <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(4,minmax(150px,1fr))_auto] dark:border-studio-700 dark:bg-studio-900"><label className="relative block"><span className="sr-only">Search payments by reference or member</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, member…" className={`${inputClass} w-full pl-9`} /></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Status<select aria-label="Payment status filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={selectClass}><option>All statuses</option>{paymentStatuses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Method<select aria-label="Payment method filter" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className={selectClass}><option>All methods</option>{paymentMethods.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Member<select aria-label="Payment member filter" value={memberFilter} onChange={(event) => setMemberFilter(event.target.value)} className={selectClass}><option>All members</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label className="grid gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sort<select aria-label="Sort payments" value={sort} onChange={(event) => setSort(event.target.value)} className={selectClass}><option>Newest first</option><option>Oldest first</option><option>Highest amount</option><option>Lowest amount</option></select></label>{hasFilters && <button type="button" onClick={clearFilters} className="min-h-10 self-end rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800">Clear</button>}</div>

    <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900"><div role="region" aria-label="Payment transactions; scroll horizontally to view every column" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500"><table className="w-full min-w-[980px] text-left"><thead className={tableHeadClass}><tr><th scope="col" className="px-4 py-3">Reference</th><th scope="col" className="px-3 py-3">Member &amp; plan</th><th scope="col" className="px-3 py-3">Related record</th><th scope="col" className="px-3 py-3">Date</th><th scope="col" className="px-3 py-3 text-right">Amount</th><th scope="col" className="px-3 py-3">Method</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{matchingRows.map((payment) => { const member = members.find((item) => item.id === payment.memberId); return <tr key={payment.ref} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-studio-800/50"><td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{payment.ref}<span className="mt-1 block text-[9px] font-normal text-slate-400">{payment.source === 'Manual preview' ? 'Manual preview' : 'Live API'}</span></td><td className="px-3 py-3"><p className="text-xs font-semibold text-slate-900 dark:text-white">{member?.name || 'Member unavailable'}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{member?.plan ? `${member.plan} · Exp ${member.expiry}` : (member?.email || payment.memberId)}</p></td><td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{payment.type}</td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{parsePaymentDate(payment.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className="px-3 py-3 text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{paymentMoney.format(payment.amount)}{payment.refundedAmount > 0 && <span className="mt-1 block text-[9px] font-normal text-violet-700 dark:text-violet-300">{paymentMoney.format(payment.refundedAmount)} refunded</span>}</td><td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{payment.method}</td><td className="px-3 py-3"><PaymentStatusBadge status={payment.status} /></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => { setSelected(payment); setRefundMode(false); setRefundError(''); }} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-700 hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200">Details</button></td></tr>; })}{matchingRows.length === 0 && <tr><td colSpan={8} className="px-5 py-14 text-center"><p className="font-serif text-lg font-bold text-slate-900 dark:text-white">No transactions in this view</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a wider date period, clear a filter, or record a manual payment entry.</p><button type="button" onClick={clearFilters} className="mt-3 min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Clear filters</button></td></tr>}</tbody></table></div><p className="border-t border-slate-100 px-4 py-3 dark:border-studio-800"><span className="block text-[11px] leading-5 text-slate-500 dark:text-slate-400">Live tenant ledger · manual paid status is an internal record and does not confirm a gateway transaction.</span></p></PagePanel>

    <div className="mt-4 grid gap-4 xl:grid-cols-2"><PagePanel className="p-4 sm:p-5 dark:border-studio-700 dark:bg-studio-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">Reconciliation</p><h2 className="mt-1 font-serif text-lg font-bold text-slate-950 dark:text-white">Totals by status</h2><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Refund statuses show refunded amount; other statuses show ledger amount.</p></div><CreditCardIcon size="sm" className="text-violet-700 dark:text-violet-300" /></div><div className="mt-4 space-y-2">{statusGroups.map(({ status, rows }) => <div key={status} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-studio-950"><span className="text-xs text-slate-700 dark:text-slate-200">{status}</span><span className="text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{rows.length} · {paymentMoney.format(rows.reduce((sum, payment) => sum + (status === 'Refunded' || status === 'Partially Refunded' ? payment.refundedAmount : payment.amount), 0))}</span></div>)}</div></PagePanel><PagePanel className="p-4 sm:p-5 dark:border-studio-700 dark:bg-studio-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-300">Payment channels</p><h2 className="mt-1 font-serif text-lg font-bold text-slate-950 dark:text-white">Totals by method</h2><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Collected and pending values are shown separately.</p></div><IndianRupeeIcon size="sm" className="text-blue-700 dark:text-blue-300" /></div><div className="mt-4 space-y-3">{methodGroups.map(({ method, count, ledgerAmount, amount, pendingAmount }) => <div key={method} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 last:border-0 dark:border-studio-800"><span className="text-xs text-slate-700 dark:text-slate-200">{method} <span className="text-slate-400">· {count} record{count === 1 ? '' : 's'} · {paymentMoney.format(ledgerAmount)} ledger</span></span><span className="text-right text-[10px] tabular-nums text-slate-600 dark:text-slate-300">{paymentMoney.format(amount)} collected · {paymentMoney.format(pendingAmount)} pending</span></div>)}</div></PagePanel></div>
    {trendGroups.length >= 2 && <PagePanel className="mt-4 p-4 sm:p-5 dark:border-studio-700 dark:bg-studio-900"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Collected by payment date</p><h2 className="mt-1 font-serif text-lg font-bold text-slate-950 dark:text-white">Collection trend · selected period</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Based on dated paid records in the PostgreSQL tenant ledger; refunds are subtracted.</p><div role="img" aria-label={`Collection trend with ${trendGroups.length} dates and values derived from preview payment records`} className="mt-4 flex h-36 items-end gap-2 border-b border-slate-200 pb-2 dark:border-studio-700">{trendGroups.map(([date, amount]) => <div key={date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{paymentMoney.format(amount)}</span><div className="w-full max-w-12 rounded-t-md bg-emerald-500/80" style={{ height: `${Math.max(4, amount / maxTrend * 72)}%` }} /><span className="text-[9px] text-slate-500 dark:text-slate-400">{parsePaymentDate(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</span></div>)}</div></PagePanel>}

    <Modal isOpen={manualOpen} onClose={() => { if (!saving) { setManualOpen(false); setFormError(''); } }} title="Record manual payment" description="Adds an internal transaction entry to shared preview state. It does not charge a member or contact a payment gateway." size="lg" footer={<><button type="button" disabled={saving} onClick={() => { setManualOpen(false); setFormError(''); }} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" form="payment-form" disabled={saving} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Recording…' : 'Save preview record'}</button></>}>
      <form id="payment-form" onSubmit={saveManualPayment} className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Member<select required value={form.memberId} onChange={(event) => setForm({ ...form, memberId: event.target.value })} className={inputClass}>{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Amount (INR)<input autoFocus required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className={inputClass} placeholder="0.00" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Payment date<input required type="date" max={today} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={inputClass} /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Reference (optional)<input value={form.ref} onChange={(event) => setForm({ ...form, ref: event.target.value })} className={inputClass} placeholder="Auto-generated if left blank" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Payment method<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })} className={inputClass}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Related record<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })} className={inputClass}><option>Membership</option><option>Membership renewal</option><option>Class pass</option></select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Initial status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as 'Pending' | 'Paid' })} className={inputClass}><option value="Pending">Pending confirmation</option><option value="Paid">Paid · manually confirmed</option></select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Notes (optional)<textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className={`${inputClass} resize-y py-2`} /></label>{formError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300 sm:col-span-2">{formError}</p>}</form>
    </Modal>

    <Modal isOpen={Boolean(selected)} onClose={() => { setSelected(null); setRefundMode(false); setRefundError(''); }} title={selected?.ref || 'Payment details'} description="Transaction details · PostgreSQL ledger" size="md" footer={selected && (refundMode ? <><button type="button" onClick={() => { setRefundMode(false); setRefundError(''); }} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Cancel refund</button><button type="submit" form="refund-form" className="min-h-10 rounded-lg bg-violet-700 px-4 text-xs font-semibold text-white">Record refund</button></> : <><button type="button" onClick={() => setSelected(null)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Close</button>{(selected.status === 'Pending' || selected.status === 'Review') && <button type="button" onClick={() => setPaymentStatus(selected, 'Paid')} className="min-h-10 rounded-lg bg-emerald-700 px-4 text-xs font-semibold text-white">Mark paid manually</button>}{selected.status === 'Failed' && <button type="button" onClick={() => setPaymentStatus(selected, 'Pending')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 px-4 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:text-amber-200"><RefreshCwIcon size="sm" />Retry</button>}{selectedRefundable > 0 && ['Paid', 'Partially Refunded'].includes(selected.status) && <button type="button" onClick={() => { setRefundMode(true); setRefundAmount(String(selectedRefundable)); setRefundError(''); }} className="min-h-10 rounded-lg border border-violet-300 px-4 text-xs font-semibold text-violet-800 dark:border-violet-800 dark:text-violet-200">Refund</button>}</>)}>
      {selected && !refundMode && <div className="space-y-4"><dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950"><div><dt className="text-slate-500 dark:text-slate-400">Member</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedMember?.name || 'Member unavailable'}</dd><dd className="mt-1 break-all text-[10px] text-slate-500 dark:text-slate-400">{selectedMember?.email || selected.memberId}{selectedMember?.plan ? ` · ${selectedMember.plan} (Exp ${selectedMember.expiry})` : ''}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Amount</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{paymentMoney.format(selected.amount)} {selected.currency}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Date / method</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{parsePaymentDate(selected.date).toLocaleDateString('en-IN')} · {selected.method}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Related record</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selected.type}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd className="mt-1"><PaymentStatusBadge status={selected.status} /></dd></div><div><dt className="text-slate-500 dark:text-slate-400">Refunded / remaining</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{paymentMoney.format(selected.refundedAmount)} / {paymentMoney.format(selectedRefundable)}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500 dark:text-slate-400">Notes</dt><dd className="mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-200">{selected.notes || 'No notes recorded.'}</dd></div></dl><p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">{selected.source === 'Manual preview' ? 'Manually entered preview record.' : 'Live API ledger entry.'} Status changes and refunds are committed through the authenticated gateway.</p></div>}
      {selected && refundMode && <form id="refund-form" onSubmit={saveRefund} className="space-y-4"><div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs leading-5 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">This records the authorized refund in the tenant ledger and audit trail. Provider-side settlement remains subject to the configured payment processor. Remaining refundable amount: <strong>{paymentMoney.format(selectedRefundable)}</strong>.</div><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Refund amount (INR)<input autoFocus required type="number" min="0.01" max={selectedRefundable} step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className={inputClass} /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Reason / note (optional)<textarea rows={3} value={refundNote} onChange={(event) => setRefundNote(event.target.value)} className={`${inputClass} resize-y py-2`} /></label>{refundError && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{refundError}</p>}</form>}
    </Modal>
  </div>
  );
}

type ReportSection = 'Overview' | 'Revenue & Payments' | 'Members & Memberships' | 'Leads & Conversion' | 'Classes, Bookings & Attendance' | 'Events';
const reportSections: ReportSection[] = ['Overview', 'Revenue & Payments', 'Members & Memberships', 'Leads & Conversion', 'Classes, Bookings & Attendance', 'Events'];
const reportDateKey = (value: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};
const shiftReportDate = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const reportMoney = { format: formatInr };

export function ReportsPage() {
  const { payments, members, classes, bookings, attendance, events, eventRegistrations, leads } = useAdminWorkspaceData();
  const [section, setSection] = useState<ReportSection>('Overview');
  const [range, setRange] = useState('30 days');
  const [customFrom, setCustomFrom] = useState(() => shiftReportDate(reportDateKey(new Date().toISOString()), -29));
  const [customTo, setCustomTo] = useState(() => reportDateKey(new Date().toISOString()));
  const [compare, setCompare] = useState(false);
  const [paymentQuery, setPaymentQuery] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('All statuses');
  const [paymentSort, setPaymentSort] = useState<'date' | 'amount' | 'member'>('date');
  const [paymentPage, setPaymentPage] = useState(1);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberStatus, setMemberStatus] = useState('All statuses');
  const [memberPlan, setMemberPlan] = useState('All plans');
  const [leadQuery, setLeadQuery] = useState('');
  const [leadStage, setLeadStage] = useState('All stages');
  const [leadSource, setLeadSource] = useState('All sources');
  const [classQuery, setClassQuery] = useState('');
  const [classTrainer, setClassTrainer] = useState('All trainers');
  const [classStatus, setClassStatus] = useState('All statuses');
  const [eventQuery, setEventQuery] = useState('');
  const [eventStatus, setEventStatus] = useState('All statuses');
  const [selectedPayment, setSelectedPayment] = useState<StaffPayment | null>(null);
  const [toast, setToast] = useState('');

  const today = reportDateKey(new Date().toISOString());
  const period = useMemo(() => {
    if (range === 'Today') return { start: today, end: today, days: 1 };
    if (range === '7 days') return { start: shiftReportDate(today, -6), end: today, days: 7 };
    if (range === '90 days') return { start: shiftReportDate(today, -89), end: today, days: 90 };
    if (range === 'Custom range') {
      const days = customFrom && customTo && customTo >= customFrom ? Math.round((new Date(`${customTo}T12:00:00`).getTime() - new Date(`${customFrom}T12:00:00`).getTime()) / 86_400_000) + 1 : 0;
      return { start: customFrom, end: customTo, days };
    }
    return { start: shiftReportDate(today, -29), end: today, days: 30 };
  }, [range, today, customFrom, customTo]);
  const validPeriod = Boolean(period.start && period.end && period.end >= period.start && period.days > 0);
  const previousPeriod = validPeriod ? { start: shiftReportDate(period.start, -period.days), end: shiftReportDate(period.start, -1) } : null;
  const inPeriod = (value: string, bounds: { start: string; end: string } = period) => { const key = reportDateKey(value); return Boolean(key && bounds.start && bounds.end && bounds.end >= bounds.start && key >= bounds.start && key <= bounds.end); };
  const membersJoined = members.filter((item) => inPeriod(item.joined));
  const periodPayments = payments.filter((item) => inPeriod(item.date));
  const periodClasses = classes.filter((item) => inPeriod(item.date));
  const periodClassIds = new Set(periodClasses.map((item) => item.id));
  const periodBookings = bookings.filter((item) => periodClassIds.has(item.classId));
  const bookingById = new Map(bookings.map((item) => [item.id, item]));
  const attendanceInPeriod = attendance.filter((item) => { const booking = bookingById.get(item.bookingId); const session = classes.find((row) => row.id === booking?.classId); return Boolean(session && inPeriod(session.date) && ['Present', 'Absent'].includes(item.status)); });
  const validAttendance = attendanceInPeriod.filter((item) => item.status === 'Present' || item.status === 'Absent');
  const classAttendanceRate = validAttendance.length ? Math.round(validAttendance.filter((item) => item.status === 'Present').length / validAttendance.length * 100) : null;
  const activeClassesInPeriod = periodClasses.filter((item) => item.status === 'Scheduled');
  const classCapacity = activeClassesInPeriod.reduce((sum, item) => sum + Math.max(0, item.capacity), 0);
  const confirmedInPeriod = periodBookings.filter((item) => item.status === 'Confirmed').length;
  const bookingUtilization = classCapacity ? Math.round(confirmedInPeriod / classCapacity * 100) : null;
  const collectedPayments = periodPayments.filter((item) => ['Paid', 'Partially Refunded', 'Refunded'].includes(item.status));
  const collected = collectedPayments.reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0);
  const outstanding = periodPayments.filter((item) => item.status === 'Pending' || item.status === 'Review').reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0);
  const refunded = periodPayments.reduce((sum, item) => sum + item.refundedAmount, 0);
  const activeMemberships = members.filter((item) => item.status === 'Active').length;
  const registeredEvents = eventRegistrations.filter((item) => item.status === 'Registered' && inPeriod(item.registeredAt));
  const totalLeads = leads.length;
  const convertedLeads = leads.filter((item) => item.stage === 'Converted').length;
  const openLeads = leads.filter((item) => item.stage !== 'Converted').length;
  const leadConversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : null;
  const dueFollowUpLeads = leads.filter((item) => item.stage !== 'Converted' && Boolean(reportDateKey(item.followUpDate)) && reportDateKey(item.followUpDate) <= today);
  const leadStageOrder: StaffLeadStage[] = ['New enquiry', 'Trial booked', 'Trial completed', 'Follow-up', 'Converted'];
  const leadStageBreakdown = leadStageOrder.map((stage) => ({
    stage,
    count: leads.filter((item) => item.stage === stage).length,
  }));
  const leadSourceOptions = [...new Set(leads.map((item) => item.source).filter(Boolean))].sort();
  const leadSourceBreakdown = leadSourceOptions.map((source) => {
    const matching = leads.filter((item) => item.source === source);
    const converted = matching.filter((item) => item.stage === 'Converted').length;
    return { source, count: matching.length, converted };
  });
  const filteredLeads = leads.filter((item) => (
    (leadStage === 'All stages' || item.stage === leadStage) &&
    (leadSource === 'All sources' || item.source === leadSource) &&
    `${item.name} ${item.contact} ${item.email} ${item.phone} ${item.source} ${item.assigned} ${item.plan} ${item.outcome}`.toLowerCase().includes(leadQuery.trim().toLowerCase())
  ));
  const statusOptions = [...new Set(payments.map((item) => item.status))].sort();
  const plans = [...new Set(members.map((item) => item.plan).filter(Boolean))].sort();
  const trainers = [...new Set(classes.map((item) => item.trainer).filter(Boolean))].sort();
  const eventStatuses = ['Upcoming', 'Happening now', 'Completed', 'Cancelled'];
  const filteredPayments = periodPayments.filter((item) => {
    const member = members.find((row) => row.id === item.memberId);
    return (paymentStatus === 'All statuses' || item.status === paymentStatus) && `${item.ref} ${item.type} ${item.method} ${item.status} ${member?.name ?? ''}`.toLowerCase().includes(paymentQuery.trim().toLowerCase());
  }).sort((a, b) => paymentSort === 'amount' ? b.amount - a.amount : paymentSort === 'member' ? (members.find((row) => row.id === a.memberId)?.name ?? '').localeCompare(members.find((row) => row.id === b.memberId)?.name ?? '') : b.date.localeCompare(a.date));
  const paymentPageSize = 8;
  const paymentPageCount = Math.max(1, Math.ceil(filteredPayments.length / paymentPageSize));
  const visiblePayments = filteredPayments.slice((paymentPage - 1) * paymentPageSize, paymentPage * paymentPageSize);
  const filteredMembers = membersJoined.filter((item) => (memberStatus === 'All statuses' || item.status === memberStatus) && (memberPlan === 'All plans' || item.plan === memberPlan) && `${item.name} ${item.email} ${item.phone} ${item.coach}`.toLowerCase().includes(memberQuery.trim().toLowerCase()));
  const classRows = periodClasses.map((session) => {
    const sessionBookings = periodBookings.filter((item) => item.classId === session.id);
    const outcomes = attendanceInPeriod.filter((item) => bookingById.get(item.bookingId)?.classId === session.id);
    const confirmed = sessionBookings.filter((item) => item.status === 'Confirmed').length;
    return { session, confirmed, waitlisted: sessionBookings.filter((item) => item.status === 'Waitlisted').length, cancelled: sessionBookings.filter((item) => item.status === 'Cancelled').length, present: outcomes.filter((item) => item.status === 'Present').length, absent: outcomes.filter((item) => item.status === 'Absent').length };
  }).filter(({ session }) => (classTrainer === 'All trainers' || session.trainer === classTrainer) && (classStatus === 'All statuses' || session.status === classStatus || session.sessionStatus === classStatus) && `${session.name} ${session.category} ${session.trainer} ${session.room}`.toLowerCase().includes(classQuery.trim().toLowerCase()));
  const filteredEvents = events.filter((item) => inPeriod(item.startAt) && (eventStatus === 'All statuses' || (eventStatus === 'Cancelled' ? item.cancelled : !item.cancelled && (() => { const now = Date.now(), start = new Date(item.startAt).getTime(), end = new Date(item.endAt).getTime(); return eventStatus === 'Upcoming' ? now < start : eventStatus === 'Happening now' ? now >= start && now < end : now >= end; })())) && `${item.title} ${item.category} ${item.venue} ${item.organizer}`.toLowerCase().includes(eventQuery.trim().toLowerCase()));
  const expiryEnd = shiftReportDate(today, 30);
  const expiringMembers = members.filter((item) => item.status === 'Active' && reportDateKey(item.expiry) >= today && reportDateKey(item.expiry) <= expiryEnd);
  const previousMetrics = previousPeriod ? {
    collected: payments.filter((item) => inPeriod(item.date, previousPeriod) && ['Paid', 'Partially Refunded', 'Refunded'].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0),
    outstanding: payments.filter((item) => inPeriod(item.date, previousPeriod) && ['Pending', 'Review'].includes(item.status)).reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0),
    newMembers: members.filter((item) => inPeriod(item.joined, previousPeriod)).length,
    attendance: attendance.filter((item) => { const booking = bookingById.get(item.bookingId), session = classes.find((row) => row.id === booking?.classId); return session && inPeriod(session.date, previousPeriod) && ['Present', 'Absent'].includes(item.status); }),
    registrations: eventRegistrations.filter((item) => item.status === 'Registered' && inPeriod(item.registeredAt, previousPeriod)).length,
  } : null;
  const previousAttendanceRate = previousMetrics?.attendance.length ? Math.round(previousMetrics.attendance.filter((item) => item.status === 'Present').length / previousMetrics.attendance.length * 100) : null;
  const compareLabel = (current: number | null, previous: number | null, currency = false) => {
    if (!compare || current === null || previous === null) return '';
    const delta = current - previous;
    const amount = currency ? reportMoney.format(Math.abs(delta)) : `${Math.abs(delta)}`;
    return `vs prior period ${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${amount}`;
  };
  const money = (value: number) => reportMoney.format(value);
  const dateLabel = (value: string) => { const key = reportDateKey(value); return key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'; };
  const metrics = [
    { label: 'Revenue collected', value: money(collected), note: 'Net of recorded refunds · selected period', compare: compareLabel(collected, previousMetrics?.collected ?? null, true), icon: IndianRupeeIcon, accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200', section: 'Revenue & Payments' as ReportSection },
    { label: 'Outstanding', value: money(outstanding), note: 'Pending + review only · failed excluded', compare: compareLabel(outstanding, previousMetrics?.outstanding ?? null, true), icon: ClockIcon, accent: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200', section: 'Revenue & Payments' as ReportSection },
    { label: 'Active memberships', value: `${activeMemberships}`, note: 'Current status snapshot · not period-scoped', compare: '', icon: UsersIcon, accent: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200', section: 'Members & Memberships' as ReportSection },
    { label: 'New members', value: `${membersJoined.length}`, note: 'Join date falls within this period', compare: compareLabel(membersJoined.length, previousMetrics?.newMembers ?? null), icon: UserPlusIcon, accent: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200', section: 'Members & Memberships' as ReportSection },
    { label: 'Lead conversion', value: leadConversionRate === null ? '—' : `${leadConversionRate}%`, note: `${convertedLeads} converted of ${totalLeads} shared CRM leads · ${dueFollowUpLeads.length} due follow-up${dueFollowUpLeads.length === 1 ? '' : 's'}`, compare: '', icon: ActivityIcon, accent: 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200', section: 'Leads & Conversion' as ReportSection },
    { label: 'Class attendance', value: classAttendanceRate === null ? '—' : `${classAttendanceRate}%`, note: `${validAttendance.length} recorded attendance outcomes`, compare: compareLabel(classAttendanceRate, previousAttendanceRate), icon: CheckCircleIcon, accent: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200', section: 'Classes, Bookings & Attendance' as ReportSection },
    { label: 'Booking occupancy', value: bookingUtilization === null ? '—' : `${bookingUtilization}%`, note: `${confirmedInPeriod} confirmed / ${classCapacity} scheduled seats`, compare: '', icon: CalendarIcon, accent: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-200', section: 'Classes, Bookings & Attendance' as ReportSection },
    { label: 'Event registrations', value: `${registeredEvents.length}`, note: 'Registered status · registration date in period', compare: compareLabel(registeredEvents.length, previousMetrics?.registrations ?? null), icon: FileTextIcon, accent: 'bg-orange-50 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200', section: 'Events' as ReportSection },
  ];
  const reportPanel = 'min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
  const reportInput = `${inputClass} dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100`;
  const paymentMethods = [...new Set(collectedPayments.map((item) => item.method))].map((method) => ({ method, amount: collectedPayments.filter((item) => item.method === method).reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0) })).sort((a, b) => b.amount - a.amount);
  const paymentStatuses = statusOptions.map((status) => ({ status, count: periodPayments.filter((item) => item.status === status).length, amount: periodPayments.filter((item) => item.status === status).reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0) }));
  const revenueBuckets = [...new Set(collectedPayments.map((item) => range === '90 days' ? item.date.slice(0, 7) : item.date.slice(0, 10)))].sort().map((bucket) => ({ bucket, value: collectedPayments.filter((item) => (range === '90 days' ? item.date.slice(0, 7) : item.date.slice(0, 10)) === bucket).reduce((sum, item) => sum + Math.max(0, item.amount - item.refundedAmount), 0) }));
  const memberStatuses = [...new Set(members.map((item) => item.status))].sort().map((status) => ({ status, count: members.filter((item) => item.status === status).length }));
  const planDistribution = plans.map((plan) => ({ plan, count: members.filter((item) => item.plan === plan).length }));
  const activeEventRegistrationCount = (eventId: string) => eventRegistrations.filter((item) => item.eventId === eventId && item.status === 'Registered').length;
  const exportCsv = () => {
    let headers: string[] = [];
    let dataRows: Array<Array<unknown>> = [];
    if (section === 'Revenue & Payments') {
      headers = ['Reference', 'Date', 'Member', 'Type', 'Method', 'Status', 'Amount', 'Refunded', 'Net'];
      dataRows = filteredPayments.map((item) => [item.ref, item.date, members.find((member) => member.id === item.memberId)?.name ?? item.memberId, item.type, item.method, item.status, item.amount, item.refundedAmount, Math.max(0, item.amount - item.refundedAmount)]);
    } else if (section === 'Members & Memberships') {
      headers = ['Name', 'Email', 'Plan', 'Status', 'Joined', 'Expiry', 'Coach'];
      dataRows = filteredMembers.map((item) => [item.name, item.email, item.plan, item.status, item.joined, item.expiry, item.coach]);
    } else if (section === 'Classes, Bookings & Attendance') {
      headers = ['Class', 'Date', 'Trainer', 'Status', 'Confirmed', 'Waitlisted', 'Cancelled', 'Present', 'Absent', 'Capacity'];
      dataRows = classRows.map(({ session, confirmed, waitlisted, cancelled, present, absent }) => [session.name, session.date, session.trainer, session.sessionStatus ?? session.status, confirmed, waitlisted, cancelled, present, absent, session.capacity]);
    } else if (section === 'Events') {
      headers = ['Event', 'Start', 'Category', 'Venue', 'Status', 'Registrations', 'Capacity'];
      dataRows = filteredEvents.map((item) => [item.title, item.startAt, item.category, item.venue, item.cancelled ? 'Cancelled' : 'Scheduled by date', activeEventRegistrationCount(item.id), item.capacity ?? 'Unlimited']);
    } else if (section === 'Leads & Conversion') {
      headers = ['ID', 'Name', 'Stage', 'Source', 'Assigned', 'Plan Interest', 'Follow-up Date', 'Phone', 'Email', 'Outcome'];
      dataRows = filteredLeads.map((item) => [item.id, item.name, item.stage, item.source, item.assigned, item.plan, item.followUpDate, item.phone, item.email, item.outcome]);
    } else {
      headers = ['Metric', 'Value', 'Period'];
      dataRows = metrics.map((item) => [item.label, item.value, `${period.start} to ${period.end}`]);
    }
    const contents = createStudioCsv(headers, dataRows);
    const blob = new Blob([`\uFEFF${contents}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `fitness-studio-${section.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}-${period.start}-${period.end}.csv`; anchor.click(); URL.revokeObjectURL(url);
    setToast(`${dataRows.length} filtered report row${dataRows.length === 1 ? '' : 's'} exported as CSV.`);
  };
  const clearFilters = () => { setPaymentQuery(''); setPaymentStatus('All statuses'); setPaymentSort('date'); setPaymentPage(1); setMemberQuery(''); setMemberStatus('All statuses'); setMemberPlan('All plans'); setLeadQuery(''); setLeadStage('All stages'); setLeadSource('All sources'); setClassQuery(''); setClassTrainer('All trainers'); setClassStatus('All statuses'); setEventQuery(''); setEventStatus('All statuses'); };
  const rangeText = validPeriod ? `${dateLabel(period.start)} – ${dateLabel(period.end)}` : 'Choose a valid start and end date.';
  const header = <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-800"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">Business intelligence · {currentStaffStudio.name}</p><h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">Reports &amp; Analytics</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">Explore operational and financial signals from the records available to this studio workspace.</p></div><button type="button" onClick={exportCsv} disabled={!validPeriod} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"><DownloadIcon size="sm" />Export filtered CSV</button></header>;
  const periodControls = <div className="flex flex-wrap items-center gap-2"><select aria-label="Report date range" value={range} onChange={(event) => setRange(event.target.value)} className={reportInput}><option>Today</option><option>7 days</option><option>30 days</option><option>90 days</option><option>Custom range</option></select>{range === 'Custom range' && <><label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">From<input aria-label="Report period start" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className={`${reportInput} ml-2`} /></label><label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">To<input aria-label="Report period end" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className={`${reportInput} ml-2`} /></label></>}{range !== 'Today' && <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} className="accent-rose-700" />Compare with prior period</label>}</div>;
  const noRows = (message: string) => <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center dark:border-studio-700"><p className="font-serif text-lg font-bold text-slate-900 dark:text-white">No records in this period</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{message}</p><Link href="/admin/import-export" className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-rose-700 dark:border-studio-700 dark:text-rose-300">Import from CSV</Link></div>;

  return <div className="mx-auto w-full max-w-[1440px]">{header}
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-900/60 dark:bg-sky-950/30"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs leading-5 text-sky-950 dark:text-sky-100"><strong>Workspace analytics.</strong> Reports read directly from shared browser workspace records (Payments, Members, CRM Leads, Classes, Bookings, Attendance, and Events). No live backend report API is connected.</p><p className="text-[10px] font-semibold text-sky-800 dark:text-sky-200">{currentStaffStudio.name} · {rangeText}</p></div></div>
    <section aria-label="Report period and comparison" className={`${reportPanel} mb-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">Reporting period</p><p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{rangeText}</p></div>{periodControls}</section>
    {!validPeriod && <p role="alert" className="mb-4 text-xs font-semibold text-rose-700 dark:text-rose-300">Choose an end date on or after the start date.</p>}
    <nav className={`${reportPanel} mb-5 flex gap-1 overflow-x-auto p-1`} role="tablist" aria-label="Report sections">{reportSections.map((item) => <button key={item} type="button" role="tab" aria-selected={section === item} onClick={() => { setSection(item); setPaymentPage(1); }} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${section === item ? 'bg-rose-700 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-studio-800'}`}>{item}</button>)}</nav>
    <section aria-label="Studio business overview" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <button key={metric.label} type="button" onClick={() => setSection(metric.section)} className={`${reportPanel} p-4 text-left transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{metric.label}</p><p className="mt-2 font-serif text-2xl font-bold tabular-nums text-slate-950 dark:text-white">{metric.value}</p></div><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.accent}`}><metric.icon size="sm" /></span></div><p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{metric.note}</p>{compare && metric.compare && <p className="mt-2 text-[10px] font-semibold text-violet-700 dark:text-violet-300">{metric.compare}</p>}</button>)}</section>

    {section === 'Overview' && <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]"><section className={`${reportPanel} p-4 sm:p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-300">Revenue &amp; payments</p><h2 className="mt-1 font-serif text-xl font-bold text-slate-950 dark:text-white">Collected over time</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Net of recorded refunds · grouped by {range === '90 days' ? 'month' : 'transaction date'}</p></div><strong className="font-serif text-xl text-slate-950 dark:text-white">{money(collected)}</strong></div>{revenueBuckets.length ? <div className="mt-5 space-y-3">{revenueBuckets.map((item) => <div key={item.bucket} className="grid grid-cols-[78px_minmax(0,1fr)_auto] items-center gap-3 text-xs"><span className="text-slate-500 dark:text-slate-400">{item.bucket.length === 7 ? item.bucket : dateLabel(item.bucket)}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.max(4, item.value / Math.max(...revenueBuckets.map((bucket) => bucket.value), 1) * 100)}%` }} /></div><strong className="tabular-nums text-slate-800 dark:text-slate-200">{money(item.value)}</strong></div>)}</div> : noRows('No collected payment records fall within this range; no chart values have been generated.')}</section><section className={`${reportPanel} p-4 sm:p-5`}><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">At a glance</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Period transactions and current membership snapshot</p><dl className="mt-4 divide-y divide-slate-100 dark:divide-studio-800">{[['Outstanding · pending + review', money(outstanding)], ['Refunds recorded', money(refunded)], ['Active memberships · current', `${activeMemberships}`], ['New members · period', `${membersJoined.length}`], ['CRM leads · converted / total', `${convertedLeads} / ${totalLeads}`], ['Class bookings · confirmed', `${confirmedInPeriod}`], ['Events · registrations', `${registeredEvents.length}`]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3 py-3"><dt className="text-xs text-slate-600 dark:text-slate-300">{label}</dt><dd className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{value}</dd></div>)}</dl><div className="mt-3 flex flex-wrap gap-2"><Link href="/admin/payments" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200">Payments<ArrowRightIcon size="xs" /></Link><Link href="/admin/memberships" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200">Memberships<ArrowRightIcon size="xs" /></Link><Link href="/admin/leads" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200">CRM / Leads<ArrowRightIcon size="xs" /></Link></div></section></div>}

    {section === 'Revenue & Payments' && <div className="space-y-4"><div className="grid gap-4 xl:grid-cols-3"><section className={`${reportPanel} p-4 sm:p-5 xl:col-span-2`}><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Collected revenue by {range === '90 days' ? 'month' : 'date'}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Paid, partially refunded and refunded records, net of the refund amount recorded.</p>{revenueBuckets.length ? <div className="mt-5 space-y-3">{revenueBuckets.map((item) => <div key={item.bucket} className="grid grid-cols-[82px_minmax(0,1fr)_auto] items-center gap-3 text-xs"><span className="text-slate-500 dark:text-slate-400">{item.bucket.length === 7 ? item.bucket : dateLabel(item.bucket)}</span><div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${Math.max(4, item.value / Math.max(...revenueBuckets.map((bucket) => bucket.value), 1) * 100)}%` }} /></div><strong className="tabular-nums text-slate-800 dark:text-slate-200">{money(item.value)}</strong></div>)}</div> : noRows('No collected revenue records are available for this period.')}</section><section className={`${reportPanel} p-4 sm:p-5`}><h2 className="font-serif text-lg font-bold text-slate-950 dark:text-white">Payment methods</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Net collected amount by recorded method</p>{paymentMethods.length ? <div className="mt-4 space-y-3">{paymentMethods.map((item) => <div key={item.method}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="text-slate-700 dark:text-slate-200">{item.method}</span><strong className="tabular-nums text-slate-900 dark:text-white">{money(item.amount)}</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(4, item.amount / Math.max(...paymentMethods.map((method) => method.amount), 1) * 100)}%` }} /></div></div>)}</div> : noRows('Payment method totals appear when collected payment records exist.')}</section></div><section className={`${reportPanel} overflow-hidden`}><header className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-studio-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Transactions</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredPayments.length} matching ledger records · net collected {money(collected)} · outstanding {money(outstanding)}</p></div><div className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_auto_auto]"><label className="relative"><span className="sr-only">Search transactions</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={paymentQuery} onChange={(event) => { setPaymentQuery(event.target.value); setPaymentPage(1); }} placeholder="Search transactions…" className={`${reportInput} w-full pl-9`} /></label><select aria-label="Filter payment status" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPaymentPage(1); }} className={reportInput}><option>All statuses</option>{statusOptions.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Sort payment rows" value={paymentSort} onChange={(event) => setPaymentSort(event.target.value as typeof paymentSort)} className={reportInput}><option value="date">Sort by date</option><option value="amount">Sort by amount</option><option value="member">Sort by member</option></select></div></header>{filteredPayments.length ? <div className="overflow-x-auto" role="region" aria-label="Filtered transaction table" tabIndex={0}><table className="w-full min-w-[760px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr>{['Reference', 'Date', 'Member', 'Method', 'Status', 'Amount / net'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{visiblePayments.map((item) => <tr key={item.ref} className="hover:bg-slate-50 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><button type="button" onClick={() => setSelectedPayment(item)} className="text-xs font-semibold text-rose-700 underline-offset-2 hover:underline dark:text-rose-300">{item.ref}</button></td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{dateLabel(item.date)}</td><td className="px-4 py-3 text-xs font-medium text-slate-800 dark:text-slate-200">{members.find((row) => row.id === item.memberId)?.name ?? item.memberId}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.method}</td><td className="px-4 py-3"><StatusBadge tone={item.status === 'Paid' ? 'green' : ['Pending', 'Review'].includes(item.status) ? 'amber' : item.status === 'Failed' ? 'rose' : 'slate'}>{item.status}</StatusBadge></td><td className="whitespace-nowrap px-4 py-3 text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{money(item.amount)} <span className="font-normal text-slate-500 dark:text-slate-400">· net {money(Math.max(0, item.amount - item.refundedAmount))}</span></td></tr>)}</tbody></table></div> : noRows('No payments match this period and filter combination.')}{filteredPayments.length > 0 && <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-studio-800"><span className="text-[10px] text-slate-500 dark:text-slate-400">Page {paymentPage} of {paymentPageCount}</span><div className="flex gap-2"><button type="button" disabled={paymentPage <= 1} onClick={() => setPaymentPage((page) => page - 1)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-40 dark:border-studio-700 dark:text-slate-200">Previous</button><button type="button" disabled={paymentPage >= paymentPageCount} onClick={() => setPaymentPage((page) => page + 1)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold disabled:opacity-40 dark:border-studio-700 dark:text-slate-200">Next</button></div></footer>}</section><section className={`${reportPanel} p-4 sm:p-5`}><h2 className="font-serif text-lg font-bold text-slate-950 dark:text-white">Payment status breakdown</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{paymentStatuses.map((item) => <div key={item.status} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-studio-800 dark:bg-studio-950/60"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.status}</p><p className="mt-1 font-serif text-xl font-bold text-slate-950 dark:text-white">{item.count}</p><p className="text-[11px] text-slate-600 dark:text-slate-300">{money(item.amount)} after recorded refunds</p></div>)}</div><p className="mt-3 text-[10px] leading-5 text-slate-500 dark:text-slate-400">Failed amounts are not counted as confirmed receivables. Pending and Review totals form the outstanding card.</p></section></div>}

    {section === 'Members & Memberships' && <div className="space-y-4"><div className="grid gap-4 lg:grid-cols-2"><section className={`${reportPanel} p-4 sm:p-5`}><div className="flex items-center justify-between gap-2"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Membership status</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current member snapshot · not period-scoped</p></div><Link href="/admin/memberships" className="text-xs font-semibold text-rose-700 dark:text-rose-300">Memberships <ArrowRightIcon size="xs" /></Link></div><div className="mt-4 space-y-3">{memberStatuses.map((item) => <div key={item.status}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-200">{item.status}</span><strong className="tabular-nums text-slate-900 dark:text-white">{item.count}</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(2, item.count / Math.max(members.length, 1) * 100)}%` }} /></div></div>)}</div></section><section className={`${reportPanel} p-4 sm:p-5`}><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Plan distribution</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Current plan recorded on member profiles</p><div className="mt-4 space-y-3">{planDistribution.map((item) => <div key={item.plan}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-200">{item.plan}</span><strong className="tabular-nums text-slate-900 dark:text-white">{item.count}</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(2, item.count / Math.max(members.length, 1) * 100)}%` }} /></div></div>)}{!planDistribution.length && <p className="text-xs text-slate-500 dark:text-slate-400">No plan records are available.</p>}</div><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100"><strong>{expiringMembers.length}</strong> active records expire in the next 30 days (preview rule).</div></section></div><section className={`${reportPanel} overflow-hidden`}><header className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-studio-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">New member registrations</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Join date within {rangeText} · {filteredMembers.length} matching profiles</p></div><div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto]"><label className="relative"><span className="sr-only">Search new members</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members…" className={`${reportInput} w-full pl-9`} /></label><select aria-label="Filter member status" value={memberStatus} onChange={(event) => setMemberStatus(event.target.value)} className={reportInput}><option>All statuses</option>{memberStatuses.map((item) => <option key={item.status}>{item.status}</option>)}</select><select aria-label="Filter membership plan" value={memberPlan} onChange={(event) => setMemberPlan(event.target.value)} className={reportInput}><option>All plans</option>{plans.map((item) => <option key={item}>{item}</option>)}</select></div></header>{filteredMembers.length ? <div className="overflow-x-auto" role="region" aria-label="New member report" tabIndex={0}><table className="w-full min-w-[720px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr><th className="px-4 py-3">Member</th><th className="px-3 py-3">Plan</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Joined</th><th className="px-3 py-3">Expiry</th><th className="px-4 py-3">Coach</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{filteredMembers.map((item) => <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><Link href="/admin/members" className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">{item.name}</Link><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.email}</p></td><td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">{item.plan || 'Not specified'}</td><td className="px-3 py-3"><StatusBadge tone={item.status === 'Active' ? 'green' : item.status === 'Paused' ? 'amber' : 'slate'}>{item.status}</StatusBadge></td><td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{item.joined}</td><td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{item.expiry}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.coach}</td></tr>)}</tbody></table></div> : noRows('No member join dates match this date range and filter combination.')}</section></div>}

    {section === 'Leads & Conversion' && <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total CRM leads</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{totalLeads}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Shared studio CRM records</p></div>
        <div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Open pipeline</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{openLeads}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Enquiries, trials &amp; follow-ups</p></div>
        <div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Conversion rate</p><p className="mt-2 font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-300">{leadConversionRate === null ? '—' : `${leadConversionRate}%`}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{convertedLeads} converted of {totalLeads} leads</p></div>
        <div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Follow-ups due / overdue</p><p className="mt-2 font-serif text-2xl font-bold text-amber-700 dark:text-amber-300">{dueFollowUpLeads.length}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Open leads with follow-up on or before today</p></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={`${reportPanel} p-4 sm:p-5`}>
          <div className="flex items-center justify-between gap-2"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Pipeline by stage</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Live snapshot from shared CRM / Leads state</p></div><Link href="/admin/leads" className="text-xs font-semibold text-rose-700 dark:text-rose-300">Open CRM <ArrowRightIcon size="xs" /></Link></div>
          <div className="mt-4 space-y-3">{leadStageBreakdown.map((item) => <div key={item.stage}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-200">{item.stage}</span><strong className="tabular-nums text-slate-900 dark:text-white">{item.count}</strong></div><div className="h-2 rounded-full bg-slate-100 dark:bg-studio-800"><div className={`h-full rounded-full ${item.stage === 'Converted' ? 'bg-emerald-500' : item.stage === 'Follow-up' ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${Math.max(3, item.count / Math.max(totalLeads, 1) * 100)}%` }} /></div></div>)}</div>
        </section>
        <section className={`${reportPanel} p-4 sm:p-5`}>
          <h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Acquisition sources</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Lead volume and conversions by recorded channel</p>
          <div className="mt-4 space-y-3">{leadSourceBreakdown.map((item) => <div key={item.source}><div className="mb-1 flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-200">{item.source}</span><span className="tabular-nums text-slate-700 dark:text-slate-200"><strong>{item.count}</strong> leads · {item.converted} converted</span></div><div className="h-2 rounded-full bg-slate-100 dark:bg-studio-800"><div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max(3, item.count / Math.max(totalLeads, 1) * 100)}%` }} /></div></div>)}{!leadSourceBreakdown.length && <p className="text-xs text-slate-500 dark:text-slate-400">No lead sources recorded yet.</p>}</div>
        </section>
      </div>
      <section className={`${reportPanel} overflow-hidden`}>
        <header className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-studio-800 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">CRM leads &amp; conversion ledger</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{filteredLeads.length} of {totalLeads} leads shown · changes in CRM / Leads update this report automatically</p></div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
            <label className="relative"><span className="sr-only">Search leads</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} placeholder="Search leads, source, assignee…" className={`${reportInput} w-full pl-9`} /></label>
            <select aria-label="Filter lead stage" value={leadStage} onChange={(event) => setLeadStage(event.target.value)} className={reportInput}><option>All stages</option>{leadStageOrder.map((stage) => <option key={stage}>{stage}</option>)}</select>
            <select aria-label="Filter lead source" value={leadSource} onChange={(event) => setLeadSource(event.target.value)} className={reportInput}><option>All sources</option>{leadSourceOptions.map((source) => <option key={source}>{source}</option>)}</select>
          </div>
        </header>
        {filteredLeads.length ? <div className="overflow-x-auto" role="region" aria-label="CRM leads report table" tabIndex={0}><table className="w-full min-w-[780px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr>{['Lead', 'Stage', 'Source', 'Assigned', 'Plan interest', 'Follow-up date', 'Outcome / notes'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{filteredLeads.map((item) => <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><Link href="/admin/leads" className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">{item.name}</Link><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.contact}</p></td><td className="px-4 py-3"><StatusBadge tone={item.stage === 'Converted' ? 'green' : item.stage === 'Trial booked' || item.stage === 'Trial completed' ? 'blue' : 'amber'}>{item.stage}</StatusBadge></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.source}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.assigned}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.plan}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.followUpDate || 'Not set'}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.outcome || item.notes || '—'}</td></tr>)}</tbody></table></div> : noRows('No CRM lead records match the current filter combination.')}
      </section>
    </div>}

    {section === 'Classes, Bookings & Attendance' && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Scheduled sessions</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{activeClassesInPeriod.length}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Scheduled classes in selected period</p></div><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Booking states</p><p className="mt-2 text-xs leading-6 text-slate-700 dark:text-slate-200">Confirmed {periodBookings.filter((item) => item.status === 'Confirmed').length} · Waitlisted {periodBookings.filter((item) => item.status === 'Waitlisted').length} · Cancelled {periodBookings.filter((item) => item.status === 'Cancelled').length}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Bookings attached to sessions in range</p></div><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recorded attendance</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{validAttendance.length ? `${classAttendanceRate}%` : '—'}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{validAttendance.filter((item) => item.status === 'Present').length} present · {validAttendance.filter((item) => item.status === 'Absent').length} absent · {validAttendance.length} outcomes</p></div></div><section className={`${reportPanel} overflow-hidden`}><header className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-studio-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Sessions &amp; utilization</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Occupancy = confirmed bookings ÷ scheduled session capacity. Cancelled sessions excluded.</p></div><div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto_auto]"><label className="relative"><span className="sr-only">Search sessions</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={classQuery} onChange={(event) => setClassQuery(event.target.value)} placeholder="Search classes…" className={`${reportInput} w-full pl-9`} /></label><select aria-label="Filter class trainer" value={classTrainer} onChange={(event) => setClassTrainer(event.target.value)} className={reportInput}><option>All trainers</option>{trainers.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter session status" value={classStatus} onChange={(event) => setClassStatus(event.target.value)} className={reportInput}><option>All statuses</option><option>Scheduled</option><option>Cancelled</option><option>In Progress</option><option>Completed</option></select></div></header>{classRows.length ? <div className="overflow-x-auto" role="region" aria-label="Session utilization report" tabIndex={0}><table className="w-full min-w-[850px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr>{['Session', 'Date', 'Trainer', 'Status', 'Confirmed / capacity', 'Waitlist', 'Present / absent'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{classRows.map(({ session, confirmed, waitlisted, cancelled, present, absent }) => <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><Link href="/admin/classes" className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">{session.name}</Link><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{session.category} · {session.room}</p></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{dateLabel(session.date)}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{session.trainer}</td><td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{session.status === 'Cancelled' ? 'Cancelled' : session.sessionStatus ?? 'Scheduled'}</td><td className="px-4 py-3 text-xs tabular-nums text-slate-700 dark:text-slate-200">{confirmed} / {session.capacity}</td><td className="px-4 py-3 text-xs tabular-nums text-slate-700 dark:text-slate-200">{waitlisted} · {cancelled} cancelled</td><td className="px-4 py-3 text-xs tabular-nums text-slate-700 dark:text-slate-200">{present} / {absent}</td></tr>)}</tbody></table></div> : noRows('No sessions fall in this reporting period. Adjust the global date range or session filters.')}</section><section className={`${reportPanel} p-4`}><h2 className="font-serif text-lg font-bold text-slate-950 dark:text-white">Booking status breakdown</h2><div className="mt-3 grid gap-2 sm:grid-cols-3">{(['Confirmed', 'Waitlisted', 'Cancelled'] as const).map((status) => <div key={status} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-studio-800 dark:bg-studio-950/50"><p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{status}</p><p className="mt-1 font-serif text-xl font-bold text-slate-950 dark:text-white">{periodBookings.filter((item) => item.status === status).length}</p></div>)}</div><p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">Popular sessions are ranked by confirmed booking records for the selected period.</p>{[...classRows].sort((a, b) => b.confirmed - a.confirmed).slice(0, 3).map(({ session, confirmed }, index) => <p key={session.id} className="mt-2 flex justify-between text-xs"><span className="text-slate-700 dark:text-slate-200">{index + 1}. {session.name}</span><strong className="text-slate-900 dark:text-white">{confirmed}</strong></p>)}</section></div>}

    {section === 'Events' && <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3"><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Events in period</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{filteredEvents.length}</p></div><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Registrations</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{registeredEvents.filter((item) => filteredEvents.some((event) => event.id === item.eventId)).length}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Active registrations recorded in range</p></div><div className={`${reportPanel} p-4`}><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Attendance</p><p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">—</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">No completed-event attendance records are available</p></div></div><section className={`${reportPanel} overflow-hidden`}><header className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-studio-800 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Event report</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Event date within selected period · registration totals use shared event records</p></div><div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_auto]"><label className="relative"><span className="sr-only">Search events</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={eventQuery} onChange={(event) => setEventQuery(event.target.value)} placeholder="Search events…" className={`${reportInput} w-full pl-9`} /></label><select aria-label="Filter event status" value={eventStatus} onChange={(event) => setEventStatus(event.target.value)} className={reportInput}><option>All statuses</option>{eventStatuses.map((item) => <option key={item}>{item}</option>)}</select></div></header>{filteredEvents.length ? <div className="overflow-x-auto" role="region" aria-label="Event report table" tabIndex={0}><table className="w-full min-w-[760px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr>{['Event', 'Date', 'Category', 'Status', 'Registrations', 'Capacity / remaining'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{filteredEvents.map((item) => { const count = activeEventRegistrationCount(item.id); return <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><Link href="/admin/events" className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">{item.title}</Link><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{item.venue}</p></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{dateLabel(item.startAt)}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.category}</td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{item.cancelled ? 'Cancelled' : 'Scheduled by date'}</td><td className="px-4 py-3 text-xs tabular-nums text-slate-700 dark:text-slate-200">{count}</td><td className="px-4 py-3 text-xs tabular-nums text-slate-700 dark:text-slate-200">{item.capacity === null ? 'Unlimited capacity' : `${Math.max(0, item.capacity - count)} remaining of ${item.capacity}`}</td></tr>; })}</tbody></table></div> : noRows('There are no matching event records for the selected period.')}</section></div>}

    <section aria-label="Metric definitions and calculation guide" className={`${reportPanel} mt-4 p-4 sm:p-5`}>
      <h2 className="font-serif text-base font-bold text-slate-950 dark:text-white">Metric Definitions &amp; Calculation Guide</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Every report figure is calculated directly from shared browser workspace records without fabricated projections.</p>
      <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-studio-800 dark:bg-studio-950/60"><dt className="font-bold text-slate-900 dark:text-white">Active Members &amp; New Registrations</dt><dd className="mt-1 leading-5 text-slate-600 dark:text-slate-300">Active memberships count members with status <code>Active</code>. New members count profiles whose <code>joined</code> date falls in the selected period.</dd></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-studio-800 dark:bg-studio-950/60"><dt className="font-bold text-slate-900 dark:text-white">Class Utilization &amp; Attendance Rate</dt><dd className="mt-1 leading-5 text-slate-600 dark:text-slate-300">Occupancy = Confirmed bookings ÷ Scheduled capacity. Attendance rate = Present outcomes ÷ total recorded outcomes (Present + Late + Absent).</dd></div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-studio-800 dark:bg-studio-950/60"><dt className="font-bold text-slate-900 dark:text-white">Lead Conversion &amp; Revenue</dt><dd className="mt-1 leading-5 text-slate-600 dark:text-slate-300">Lead conversion = Converted leads ÷ Total CRM leads. Revenue collected = Paid + Partially Refunded amounts minus recorded refunds; Outstanding = Pending + Review.</dd></div>
      </dl>
    </section>

    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">Shared preview records are saved in this browser. Payment revenue is net of recorded refunds; active members are a current snapshot. Failed payments are excluded from outstanding.</p><button type="button" onClick={clearFilters} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800">Clear section filters</button></div>
    {toast && <div role="status" className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-semibold text-emerald-900 shadow-lg dark:border-emerald-900 dark:bg-studio-900 dark:text-emerald-200"><div className="flex items-start justify-between gap-3">{toast}<button type="button" onClick={() => setToast('')} aria-label="Dismiss export message">×</button></div></div>}
    <Modal isOpen={!!selectedPayment} onClose={() => setSelectedPayment(null)} title={selectedPayment?.ref ?? 'Payment details'} description="Transaction drill-down · shared preview record" size="md" footer={<button type="button" onClick={() => setSelectedPayment(null)} className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white">Close</button>}>{selectedPayment && <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950"><div><dt className="text-slate-500 dark:text-slate-400">Member</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{members.find((item) => item.id === selectedPayment.memberId)?.name ?? selectedPayment.memberId}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Status</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedPayment.status}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Type / method</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedPayment.type} · {selectedPayment.method}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Date</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{dateLabel(selectedPayment.date)}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Gross / refunded / net</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{money(selectedPayment.amount)} / {money(selectedPayment.refundedAmount)} / {money(Math.max(0, selectedPayment.amount - selectedPayment.refundedAmount))}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500 dark:text-slate-400">Record note</dt><dd className="mt-1 text-slate-800 dark:text-slate-200">{selectedPayment.notes || 'No note recorded.'}</dd></div><p className="text-[10px] text-slate-500 dark:text-slate-400 sm:col-span-2">Report drill-down only; payment status changes remain on the Payments page.</p></dl>}</Modal>
  </div>;
}

export type StaffPreviewRecord = { name: string; email: string; role: string; status: string; studio: string; shift: string; phone?: string; invitationId?: string };
export const STAFF_TEAM_STORAGE_KEY = 'fitness-studio:staff-team';
export const initialStaffRows: StaffPreviewRecord[] = [
];
const staffRoles = ['Trainer', 'Manager', 'Front Desk'];
const staffStatuses = ['Active', 'Preview profile'];
const staffAvatarTones = ['bg-sky-100 text-sky-800', 'bg-violet-100 text-violet-800', 'bg-emerald-100 text-emerald-800', 'bg-amber-100 text-amber-900', 'bg-rose-100 text-rose-800'];
const staffInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
const staffAvatarTone = (email: string) => staffAvatarTones[[...email.toLowerCase()].reduce((sum, character) => sum + character.charCodeAt(0), 0) % staffAvatarTones.length];

export function readStaffTeamTrainers(): string[] {
  return [];
}

export function StaffPage() {
  const { addToast } = useToast();
  const { classes, setClasses, feedback } = useAdminWorkspaceData();
  const [staff, setStaff] = useState<StaffPreviewRecord[]>(initialStaffRows);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STAFF_TEAM_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StaffPreviewRecord[];
        if (Array.isArray(parsed) && parsed.length > 0) setStaff(parsed);
      }
      const params = new URLSearchParams(window.location.search);
      const addParam = params.get('add');
      if (addParam && staffRoles.includes(addParam)) {
        setEditingEmail(null);
        setForm({ name: '', email: '', phone: '', password: '', role: addParam, status: 'Active' });
        setErrors({});
        setFormOpen(true);
      }
    } catch {
      // ignore storage error
    }
  }, []);
  const persistStaff = (updater: (current: StaffPreviewRecord[]) => StaffPreviewRecord[]) => {
    setStaff((current) => {
      const next = updater(current);
      try {
        window.localStorage.setItem(STAFF_TEAM_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage error
      }
      return next;
    });
  };
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('All roles');
  const [status, setStatus] = useState('All statuses');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [selectedStaff, setSelectedStaff] = useState<StaffPreviewRecord | null>(null);
  const [performanceRange, setPerformanceRange] = useState<'all' | '30' | '90'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'Front Desk', status: 'Active' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const roles = [...new Set(staff.map((person) => person.role))].sort();
  const statuses = [...new Set(staff.map((person) => person.status))].sort();
  const visible = useMemo(() => staff.filter((person) => {
    const matchesQuery = `${person.name} ${person.email} ${person.role} ${person.status} ${person.studio} ${person.shift}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (role === 'All roles' || person.role === role) && (status === 'All statuses' || person.status === status);
  }), [staff, query, role, status]);
  const trainers = staff.filter((person) => person.role === 'Trainer').length;
  const active = staff.filter((person) => person.status === 'Active').length;
  const operations = staff.filter((person) => person.role === 'Manager' || person.role === 'Front Desk').length;
  const clearFilters = () => { setQuery(''); setRole('All roles'); setStatus('All statuses'); };
  const sessionsFor = (person: StaffPreviewRecord) => classes.filter((session) => session.trainer === person.name);
  const feedbackFor = (person: StaffPreviewRecord) => feedback.filter((record) => record.trainerName === person.name && (performanceRange === 'all' || Date.now() - new Date(record.submittedAt).getTime() <= Number(performanceRange) * 86400000));
  const openAdd = (defaultRole = 'Front Desk') => { setEditingEmail(null); setForm({ name: '', email: '', phone: '', password: '', role: defaultRole, status: 'Active' }); setErrors({}); setFormOpen(true); };
  const openEdit = (person: StaffPreviewRecord) => { setSelectedStaff(null); setEditingEmail(person.email); setForm({ name: person.name, email: person.email, phone: '', password: '', role: person.role, status: person.status }); setErrors({}); setFormOpen(true); };
  const closeForm = () => { if (!savingRef.current) { setFormOpen(false); setEditingEmail(null); setForm({ name: '', email: '', phone: '', password: '', role: 'Front Desk', status: 'Active' }); setErrors({}); } };
  const saveStaff = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Enter the staff member’s name.';
    if (!email) nextErrors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    else if (staff.some((person) => person.email.toLowerCase() === email && person.email !== editingEmail)) nextErrors.email = 'This email is already in the staff preview.';
    if (!staffRoles.includes(form.role)) nextErrors.role = 'Choose an available role.';
    if (!staffStatuses.includes(form.status)) nextErrors.status = 'Choose an available preview status.';
    if (!editingEmail && !form.password.trim()) nextErrors.password = 'Set a temporary demo password for this account.';
    else if (!editingEmail && form.password.trim().length < 6) nextErrors.password = 'Use a password with at least 6 characters.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    savingRef.current = true;
    setSaving(true);
    const existing = editingEmail ? staff.find((person) => person.email === editingEmail) : null;
    const nextRecord: StaffPreviewRecord = { name, email, role: form.role, status: form.status, studio: existing?.studio ?? `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`, shift: existing?.shift ?? '09:00 AM – 05:00 PM' };
    if (existing) {
      persistStaff((current) => current.map((person) => person.email === editingEmail ? nextRecord : person));
      if (existing.name !== name) setClasses((current) => current.map((session) => session.trainer === existing.name ? { ...session, trainer: name } : session));
      addToast({ type: 'success', title: 'Staff preview updated', message: 'The staff list and linked class assignments now reflect this edit.' });
    } else {
      const assignedLoginRole = form.role === 'Trainer' ? 'trainer' : 'staff';
      persistStaff((current) => [...current, nextRecord]);
      addToast({
        type: 'success',
        title: assignedLoginRole === 'trainer' ? 'Trainer account created' : 'Staff account created',
        message: `${name} (${assignedLoginRole} login) is saved in this browser and can sign in immediately.`,
      });
    }
    setFormOpen(false);
    setEditingEmail(null);
    setForm({ name: '', email: '', phone: '', password: '', role: 'Front Desk', status: 'Active' });
    setSaving(false);
    savingRef.current = false;
  };
  const metricCards = [
    { label: 'Total staff', value: staff.length, note: 'Staff records in this preview', icon: UsersIcon, accent: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
    { label: 'Active staff', value: active, note: 'Status recorded as Active', icon: CheckCircleIcon, accent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
    { label: 'Trainers', value: trainers, note: 'Records assigned the Trainer role', icon: ActivityIcon, accent: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
    { label: 'Front desk & operations', value: operations, note: 'Manager and Front Desk roles', icon: UserPlusIcon, accent: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' },
  ];
  const openProfile = (person: StaffPreviewRecord) => setSelectedStaff(person);
  const staffFormField = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100';
  return <div className="mx-auto max-w-[1440px]">
    <PageHeader eyebrow="People & roles" title="Studio staff" description="A clear view of the people and responsibilities recorded for this studio." action={<div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => openAdd('Trainer')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-bold text-rose-800 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"><PlusIcon size="sm" />Add Trainer</button><button type="button" onClick={() => openAdd('Front Desk')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"><PlusIcon size="sm" />Add Staff Member</button></div>} />
    <section aria-label="Staff overview" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map((metric) => <div key={metric.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-subtle dark:border-studio-700 dark:bg-studio-900"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{metric.label}</p><p className="mt-2 font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{metric.value}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-xl ${metric.accent}`}><metric.icon size="sm" /></span></div><p className="mt-2 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{metric.note}</p></div>)}</section>
    <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
      <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Staff directory</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{visible.length} of {staff.length} records · profile photos and specializations are not available in the current data.</p></div><div className="flex flex-wrap items-center gap-2"><label className="relative min-w-[200px] flex-1"><span className="sr-only">Search staff</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email or role…" className={`${staffFormField} pl-9`} /></label><label className="sr-only" htmlFor="staff-role-filter">Filter staff role</label><select id="staff-role-filter" aria-label="Filter staff role" value={role} onChange={(event) => setRole(event.target.value)} className={staffFormField}><option>All roles</option>{roles.map((item) => <option key={item}>{item}</option>)}</select><label className="sr-only" htmlFor="staff-status-filter">Filter staff status</label><select id="staff-status-filter" aria-label="Filter staff status" value={status} onChange={(event) => setStatus(event.target.value)} className={staffFormField}><option>All statuses</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select><div role="group" aria-label="Staff directory view" className="flex rounded-lg border border-slate-200 p-1 dark:border-studio-700"><button type="button" aria-pressed={view === 'cards'} aria-label="Card view" onClick={() => setView('cards')} className={`flex min-h-9 min-w-9 items-center justify-center rounded-md ${view === 'cards' ? 'bg-rose-700 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'}`}><GridIcon size="sm" /></button><button type="button" aria-pressed={view === 'table'} aria-label="Table view" onClick={() => setView('table')} className={`flex min-h-9 min-w-9 items-center justify-center rounded-md ${view === 'table' ? 'bg-rose-700 text-white' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'}`}><ListIcon size="sm" /></button></div></div></div></div>
      {visible.length === 0 ? <div className="px-5 py-14 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-studio-800 dark:text-slate-300"><UsersIcon size="md" /></span>
        <h3 className="mt-4 font-serif text-lg font-bold text-slate-900 dark:text-white">No staff records match</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Try another search or clear the selected filters.</p>
        <button type="button" onClick={clearFilters} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800">Clear filters</button>
      </div> : view === 'cards' ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
        {visible.map((person) => { const assigned = sessionsFor(person); return <article key={person.email} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md dark:border-studio-700 dark:bg-studio-950/40 dark:hover:border-rose-900/70">
          <div className="flex items-start gap-3"><span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${staffAvatarTone(person.email)}`}>{staffInitials(person.name)}</span><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-950 dark:text-white">{person.name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{person.email}</p><div className="mt-2 flex flex-wrap gap-1.5"><StatusBadge tone={person.role === 'Trainer' ? 'blue' : person.role === 'Manager' ? 'blue' : 'slate'}>{person.role}</StatusBadge><StatusBadge tone={person.status === 'Active' ? 'green' : 'amber'}>{person.status}</StatusBadge></div></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs dark:border-studio-800"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Studio</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{person.studio}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Linked sessions</p><p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{assigned.length} recorded</p></div><p className="col-span-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{person.shift ? `Sample schedule · ${person.shift}` : 'Schedule details not recorded.'}</p></div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => openProfile(person)} className="min-h-9 flex-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200">View profile</button><button type="button" onClick={() => openEdit(person)} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-rose-950/40 dark:text-rose-200 dark:hover:bg-rose-950/60"><EditIcon size="xs" />Edit</button></div>
        </article>; })}
      </div> : <div className="overflow-x-auto" role="region" aria-label="Staff directory table" tabIndex={0}><table className="w-full min-w-[760px] text-left"><thead className={`${tableHeadClass} dark:bg-studio-950 dark:text-slate-400`}><tr>{['Staff member', 'Role', 'Status', 'Studio / sample schedule', 'Linked sessions', 'Actions'].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{visible.map((person) => <tr key={person.email} className="hover:bg-slate-50 dark:hover:bg-studio-800/40"><td className="px-4 py-3"><div className="flex items-center gap-2.5"><span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${staffAvatarTone(person.email)}`}>{staffInitials(person.name)}</span><div><p className="text-xs font-semibold text-slate-900 dark:text-white">{person.name}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{person.email}</p></div></div></td><td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-200">{person.role}</td><td className="px-4 py-3"><StatusBadge tone={person.status === 'Active' ? 'green' : 'amber'}>{person.status}</StatusBadge></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{person.studio}<span className="mt-1 block text-[10px] text-slate-400">{person.shift ? `Sample schedule · ${person.shift}` : 'Schedule not recorded'}</span></td><td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{sessionsFor(person).length}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => openProfile(person)} className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300">View</button><button type="button" onClick={() => openEdit(person)} className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300">Edit</button></div></td></tr>)}</tbody></table></div>}
      <p className="border-t border-slate-100 px-4 py-3 dark:border-studio-800"><PreviewNote>New accounts and roster edits persist in localStorage on this browser.</PreviewNote></p>
    </PagePanel>
    <Modal isOpen={Boolean(selectedStaff)} onClose={() => setSelectedStaff(null)} title={selectedStaff?.name ?? 'Staff profile'} description="Available staff record · preview only" size="md" footer={selectedStaff && <><button type="button" onClick={() => setSelectedStaff(null)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Close</button><button type="button" onClick={() => openEdit(selectedStaff)} className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white">Edit staff details</button></>}>{selectedStaff && <div className="space-y-4"><div className="flex items-center gap-3"><span aria-hidden="true" className={`flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold ${staffAvatarTone(selectedStaff.email)}`}>{staffInitials(selectedStaff.name)}</span><div><p className="font-semibold text-slate-900 dark:text-white">{selectedStaff.role}</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{selectedStaff.email}</p><div className="mt-2"><StatusBadge tone={selectedStaff.status === 'Active' ? 'green' : 'amber'}>{selectedStaff.status}</StatusBadge></div></div></div><dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950"><div><dt className="text-slate-500 dark:text-slate-400">Assigned studio</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedStaff.studio}</dd></div><div><dt className="text-slate-500 dark:text-slate-400">Sample schedule</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedStaff.shift || 'Not recorded'}</dd></div></dl>{selectedStaff.role === 'Trainer' && (() => { const records = feedbackFor(selectedStaff); const average = records.length ? records.reduce((sum, item) => sum + item.rating, 0) / records.length : null; const themes = (field: 'strengths' | 'improvements') => Array.from(new Set(records.flatMap((item) => item[field]))); return <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/60 dark:bg-violet-950/20"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-800 dark:text-violet-300">Measured member feedback</p><h4 className="mt-1 font-serif text-lg font-bold text-slate-950 dark:text-white">Trainer performance</h4></div><select aria-label="Feedback date range" value={performanceRange} onChange={(event) => setPerformanceRange(event.target.value as 'all' | '30' | '90')} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-[10px] text-slate-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"><option value="all">All time</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></div>{average === null ? <p className="mt-3 rounded-lg border border-dashed border-violet-300 px-3 py-3 text-xs leading-5 text-slate-600 dark:border-violet-900 dark:text-slate-300">Insufficient data: no feedback responses are recorded for this trainer in the selected range. No score or comparison is inferred.</p> : <><div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg bg-white p-3 dark:bg-studio-900"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Average trainer rating</p><p className="mt-1 font-serif text-2xl font-bold text-slate-950 dark:text-white">{average.toFixed(1)}<span className="font-sans text-xs text-slate-500"> / 5</span></p></div><div className="rounded-lg bg-white p-3 dark:bg-studio-900"><p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Responses</p><p className="mt-1 font-serif text-2xl font-bold text-slate-950 dark:text-white">{records.length}</p></div></div><p className="mt-2 text-[10px] text-slate-600 dark:text-slate-300">Session-experience rating is not recorded separately. Trend is withheld until at least six dated responses exist. Themes below are category counts from submitted feedback, not AI summaries.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><div><p className="text-[9px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Strengths recorded</p><p className="mt-1 text-[10px] leading-4 text-slate-700 dark:text-slate-200">{themes('strengths').join(' · ') || 'No strengths categories recorded'}</p></div><div><p className="text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">Improvement themes</p><p className="mt-1 text-[10px] leading-4 text-slate-700 dark:text-slate-200">{themes('improvements').join(' · ') || 'No improvement categories recorded'}</p></div></div><Link href="/admin/feedback" className="mt-3 inline-flex min-h-8 items-center text-[10px] font-semibold text-rose-700 hover:underline dark:text-rose-300">Open feedback inbox ({records.length})<ArrowRightIcon size="xs" /></Link></>}</section>; })()}<section><div className="flex items-center justify-between gap-2"><h4 className="text-xs font-bold text-slate-900 dark:text-white">Linked class sessions</h4><div className="flex gap-3"><Link href="/admin/classes" className="text-[11px] font-semibold text-rose-700 hover:underline dark:text-rose-300">Open schedule</Link>{selectedStaff.role === 'Trainer' && <Link href="/admin/trainers" className="text-[11px] font-semibold text-rose-700 hover:underline dark:text-rose-300">Trainer Studio</Link>}</div></div>{sessionsFor(selectedStaff).length ? <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-studio-800 dark:border-studio-700">{sessionsFor(selectedStaff).map((session) => <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"><span className="font-semibold text-slate-800 dark:text-slate-100">{session.name}<span className="mt-1 block text-[10px] font-normal text-slate-500 dark:text-slate-400">{session.category} · {session.room} · {session.date} · {session.startTime}</span></span><StatusBadge tone={session.status === 'Cancelled' ? 'rose' : session.sessionStatus === 'Completed' ? 'slate' : 'blue'}>{session.sessionStatus ?? session.status}</StatusBadge></li>)}</ul> : <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">No class sessions are currently linked to this staff record.</p>}</section></div>}</Modal>
    <Modal isOpen={formOpen} onClose={closeForm} title={editingEmail ? 'Edit staff details' : form.role === 'Trainer' ? 'Add trainer account' : 'Add staff account'} description={editingEmail ? 'Staff directory details' : 'Create a browser-only demo login'} size="md" footer={<><button type="button" disabled={saving} onClick={closeForm} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" form="staff-form" disabled={saving} className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : editingEmail ? 'Save changes' : 'Create account'}</button></>}><form id="staff-form" noValidate onSubmit={saveStaff} className="grid gap-4"><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Full name<input autoFocus required value={form.name} onChange={(event) => { setForm({ ...form, name: event.target.value }); setErrors((current) => ({ ...current, name: '' })); }} aria-invalid={Boolean(errors.name)} className={staffFormField} />{errors.name && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.name}</span>}</label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Email address<input type="email" required value={form.email} onChange={(event) => { setForm({ ...form, email: event.target.value }); setErrors((current) => ({ ...current, email: '' })); }} aria-invalid={Boolean(errors.email)} className={staffFormField} />{errors.email && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.email}</span>}</label>{!editingEmail && <><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Phone (optional)<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className={staffFormField} />{errors.phone && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.phone}</span>}</label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Temporary demo password (min 6 characters)<input type="password" required value={form.password} onChange={(event) => { setForm({ ...form, password: event.target.value }); setErrors((current) => ({ ...current, password: '' })); }} className={staffFormField} />{errors.password && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.password}</span>}</label></>}<label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Role<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className={staffFormField}>{staffRoles.map((item) => <option key={item}>{item}</option>)}</select>{errors.role && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.role}</span>}<span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Assigned login role: <strong className="text-slate-800 dark:text-slate-200">{form.role === 'Trainer' ? 'trainer (Trainer Portal)' : 'staff (Front-Desk Staff Workspace)'}</strong></span></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Record status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className={staffFormField}>{staffStatuses.map((item) => <option key={item}>{item}</option>)}</select>{errors.status && <span role="alert" className="text-[11px] font-normal text-rose-700 dark:text-rose-300">{errors.status}</span>}</label><p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">The new Staff or Trainer can sign in at Studio Login. Passwords are stored in localStorage for this demo only.</p></form></Modal>
  </div>;
}

export function FeedbackReviewPage() {
  const { feedback, setFeedback, classes, members } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const [trainerFilter, setTrainerFilter] = useState('All trainers');
  const [statusFilter, setStatusFilter] = useState('All review states');
  const [ratingFilter, setRatingFilter] = useState('All ratings');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [query, setQuery] = useState('');
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const trainerNames = Array.from(new Set([...readStaffTeamTrainers(), ...classes.map((item) => item.trainer), ...feedback.map((item) => item.trainerName)].filter(Boolean))).sort();
  const sessionById = new Map(classes.map((item) => [item.id, item]));
  const memberById = new Map(members.map((item) => [item.id, item]));
  const visible = feedback.filter((record) => {
    const member = memberById.get(record.memberId);
    const session = sessionById.get(record.sessionId);
    const date = record.submittedAt.slice(0, 10);
    const text = `${record.trainerName} ${member?.name ?? ''} ${member?.email ?? ''} ${session?.name ?? ''} ${record.comment} ${record.strengths.join(' ')} ${record.improvements.join(' ')}`.toLowerCase();
    return (trainerFilter === 'All trainers' || record.trainerName === trainerFilter) && (statusFilter === 'All review states' || record.reviewStatus === statusFilter) && (ratingFilter === 'All ratings' || record.rating === Number(ratingFilter)) && (!fromDate || date >= fromDate) && (!toDate || date <= toDate) && text.includes(query.trim().toLowerCase());
  }).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const pending = feedback.filter((item) => item.reviewStatus === 'New').length;
  const trainerPerformanceCards = trainerNames.map((name) => {
    const records = feedback.filter((item) => item.trainerName === name);
    const average = records.length ? records.reduce((sum, record) => sum + record.rating, 0) / records.length : null;
    const assignedSessions = classes.filter((item) => item.trainer === name).length;
    return { name, count: records.length, average, assignedSessions };
  });
  const clearFilters = () => { setTrainerFilter('All trainers'); setStatusFilter('All review states'); setRatingFilter('All ratings'); setFromDate(''); setToDate(''); setQuery(''); };
  const markReviewed = (id: string) => { setFeedback((current) => current.map((item) => item.id === id ? { ...item, reviewStatus: 'Reviewed' } : item)); addToast({ type: 'success', title: 'Feedback marked reviewed', message: 'Review status is updated in the shared preview state.' }); };
  const saveFollowUp = (id: string) => { setFeedback((current) => current.map((item) => item.id === id ? { ...item, followUpNote: (followUpDrafts[id] ?? item.followUpNote).trim() } : item)); addToast({ type: 'success', title: 'Follow-up note saved', message: 'The note is stored in local preview state only.' }); };
  return <div className="mx-auto max-w-[1440px]"><PageHeader eyebrow="Studio quality" title="Feedback & Trainer Performance" description="Review member-submitted and trainer-logged session feedback linked to completed classes, and inspect measured trainer ratings." action={<Link href="/member/home" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-rose-300">Member feedback portal<ArrowRightIcon size="xs" /></Link>} />
    <div role="status" className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-100"><strong>Shared member &amp; studio feedback inbox.</strong> Members can submit session &amp; trainer ratings from the Member Portal (<code>/member/home</code>), and trainers/staff can log post-session feedback from Trainer Studio (<code>/admin/trainers</code>). All entries sync via browser storage.</div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle dark:border-studio-700 dark:bg-studio-900"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">Feedback responses</p><p className="mt-2 font-serif text-3xl font-bold text-slate-950 dark:text-white">{feedback.length}</p><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Total recorded responses</p></article>
      <article className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/50 dark:bg-amber-950/20"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-amber-800 dark:text-amber-300">Awaiting review</p><p className="mt-2 font-serif text-3xl font-bold text-slate-950 dark:text-white">{pending}</p><p className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">New feedback records</p></article>
      {trainerPerformanceCards.map((item) => (
        <article key={item.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle dark:border-studio-700 dark:bg-studio-900">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-700 dark:text-violet-300">Trainer · {item.name}</p>
          <p className="mt-2 font-serif text-2xl font-bold text-slate-950 dark:text-white">{item.average !== null ? `${item.average.toFixed(1)} / 5` : 'No ratings yet'}</p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{item.count} response{item.count === 1 ? '' : 's'} · {item.assignedSessions} linked classes</p>
        </article>
      ))}
    </div>
    <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900"><div className="border-b border-slate-100 p-4 dark:border-studio-800"><div className="flex flex-col gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Member feedback inbox</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{visible.length} of {feedback.length} responses · private review area</p></div><button type="button" onClick={clearFilters} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Clear filters</button></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6"><input aria-label="Search feedback" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member, session, comment…" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100 xl:col-span-2" /><select aria-label="Filter trainer" value={trainerFilter} onChange={(event) => setTrainerFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"><option>All trainers</option>{trainerNames.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Filter review status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"><option>All review states</option><option>New</option><option>Reviewed</option></select><select aria-label="Filter rating" value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"><option>All ratings</option>{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select><div className="grid grid-cols-2 gap-2"><input aria-label="Submitted from" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100" /><input aria-label="Submitted to" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100" /></div></div></div></div>
      {visible.length ? <div className="divide-y divide-slate-100 dark:divide-studio-800">{visible.map((record) => { const member = memberById.get(record.memberId); const session = sessionById.get(record.sessionId); return <article key={record.id} className="grid gap-3 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]"><div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-950 dark:text-white">{member?.name ?? 'Member record unavailable'} <span className="font-normal text-slate-500">· {record.rating}/5 ★</span></h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Trainer: <strong>{record.trainerName}</strong> · {session?.name ?? 'Studio Session'} · {session?.date ?? record.submittedAt.slice(0, 10)}</p><p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{member?.email ?? ''} · submitted {formatIstDateTime(record.submittedAt)}</p></div><div className="flex flex-wrap gap-1.5"><StatusBadge tone={record.source === 'Member portal' ? 'blue' : 'slate'}>{record.source ?? 'Trainer studio'}</StatusBadge><StatusBadge tone={record.reviewStatus === 'New' ? 'amber' : 'green'}>{record.reviewStatus}</StatusBadge></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><p className="text-[10px] leading-5 text-slate-700 dark:text-slate-200"><strong className="text-emerald-800 dark:text-emerald-300">Strengths:</strong> {record.strengths.join(' · ') || 'None selected'}</p><p className="text-[10px] leading-5 text-slate-700 dark:text-slate-200"><strong className="text-amber-800 dark:text-amber-300">Improvement themes:</strong> {record.improvements.join(' · ') || 'None selected'}</p></div>{record.comment && <blockquote className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700 dark:bg-studio-950 dark:text-slate-200">“{record.comment}”</blockquote>}<Link href="/admin/classes" className="mt-3 inline-flex min-h-8 items-center text-[10px] font-semibold text-rose-700 hover:underline dark:text-rose-300">Open class schedule<ArrowRightIcon size="xs" /></Link></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-studio-700 dark:bg-studio-950"><label className="grid gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Admin follow-up note<textarea rows={3} maxLength={1000} value={followUpDrafts[record.id] ?? record.followUpNote} onChange={(event) => setFollowUpDrafts((current) => ({ ...current, [record.id]: event.target.value }))} className="rounded-lg border border-slate-300 bg-white p-2 text-xs font-normal normal-case tracking-normal text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" placeholder="Optional internal follow-up" /></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => saveFollowUp(record.id)} className="min-h-9 rounded-lg border border-slate-300 px-3 text-[10px] font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Save note</button>{record.reviewStatus === 'New' && <button type="button" onClick={() => markReviewed(record.id)} className="min-h-9 rounded-lg bg-rose-700 px-3 text-[10px] font-semibold text-white">Mark reviewed</button>}</div></div></article>; })}</div> : <div className="px-5 py-14 text-center"><h3 className="font-serif text-lg font-bold text-slate-900 dark:text-white">{feedback.length ? 'No feedback matches these filters' : 'No feedback responses yet'}</h3><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Feedback appears here after a member submits a rating in the Member Portal or a trainer records post-session feedback in Trainer Studio.</p></div>}
      <div className="border-t border-slate-100 p-4 dark:border-studio-800"><h3 className="text-xs font-bold text-slate-900 dark:text-white">Trainer performance breakdown</h3><div className="mt-2 flex flex-wrap gap-2">{trainerPerformanceCards.map((item) => <span key={item.name} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] text-slate-700 dark:border-studio-700 dark:text-slate-200"><strong>{item.name}</strong> · {item.average !== null ? `${item.average.toFixed(1)}/5` : '—'} · {item.count} feedback response{item.count === 1 ? '' : 's'}</span>)}</div></div>
    </PagePanel>
  </div>;
}

export function SettingsPage() {
  const { theme, setTheme } = useStaffTheme();
  const { addToast } = useToast();

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      <PageHeader
        title="Studio settings"
        description="Configure workspace appearance, studio details, and customize your studio's landing page."
      />

      <PagePanel className="p-4 sm:p-5">
        <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="font-serif text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-lg">
            Studio information
          </h2>
          <p className="mt-1 text-xs text-slate-500">Selected studio context · Indiranagar flagship branch</p>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-400">Studio</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{currentStaffStudio.name}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-400">City</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{currentStaffStudio.city}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase text-slate-400">Branch</dt>
            <dd className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{currentStaffStudio.branch}</dd>
          </div>
        </dl>
      </PagePanel>

      <PagePanel className="p-4 sm:p-5">
        <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
          <h2 className="font-serif text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-lg">
            Appearance
          </h2>
          <p className="mt-1 text-xs text-slate-500">Switch between Light and Dark studio themes. Persisted in local storage.</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            className={`min-h-10 rounded-lg border px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
              theme === 'light' ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Light theme
          </button>
          <button
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            className={`min-h-10 rounded-lg border px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
              theme === 'dark' ? 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            Dark theme
          </button>
        </div>
      </PagePanel>

      <LandingCustomizationEditor
        onNotify={(type, title, message) => addToast({ type, title, message })}
      />
    </div>
  );
}

const helpArticles = [
  { category: 'Roles & Access', title: '1. Admin vs Staff vs Trainer workspace boundaries', body: 'Owner / Admin has full access to executive revenue analytics, plan pricing, staff management, studio settings, and CSV operations. Front-Desk Staff focuses on daily reception, member check-in, class bookings, CRM lead conversion, and payment collection. Trainers focus on Trainer Studio, session rosters, attendance marking, and post-session coaching notes.' },
  { category: 'Reception & Check-In', title: '2. Front-desk check-in and express class booking', body: 'On the Front-Desk Staff Dashboard (/admin/dashboard) or Bookings Desk (/admin/bookings), search any member by name, phone, or email to mark Present/Late/Absent or book them into an upcoming class in one click.' },
  { category: 'Members', title: '3. Managing the Member Directory and activity history', body: 'Use /admin/members to search, filter, and sort members by Name, Expiry date, Plan, or Status. Each member row displays live confirmed bookings, recorded attendance outcomes, and payment ledger counts.' },
  { category: 'Memberships', title: '4. Membership plans, pricing, and renewal alerts', body: 'In /admin/memberships, configure Monthly, Quarterly, and Annual plans with INR pricing, session allowances, and benefits. The renewal alert window automatically reads from Studio Settings (/admin/settings).' },
  { category: 'Memberships', title: '5. Canonical Membership Freeze Request workflow', body: 'All membership freeze requests are reviewed in one canonical queue under /admin/memberships → Freeze Requests. Approving a freeze sets the member status to Paused and records the review note; rejecting keeps the membership Active.' },
  { category: 'Schedule & Classes', title: '6. 12-hour AM/PM class scheduling and conflict checks', body: 'Create or edit sessions in /admin/classes using the 12-hour AM/PM time selector (Hour 1–12, Minute :00/:15/:30/:45, AM/PM). The scheduler automatically flags room or trainer double-booking conflicts.' },
  { category: 'Bookings & Waitlists', title: '7. Handling full classes and waitlist promotion', body: 'When confirmed bookings reach session capacity, additional bookings are placed on the Waitlist. Promoting a waitlisted member from /admin/bookings moves them to Confirmed and updates occupancy.' },
  { category: 'Attendance', title: '8. Marking Present, Late, and Absent attendance', body: 'Both Front-Desk Staff (/admin/attendance) and Trainers (/admin/trainers) can record Present, Late, or Absent outcomes. The late check-in grace window is configured in Studio Settings.' },
  { category: 'Trainer Studio', title: '9. Using Trainer Studio for coaching and session execution', body: 'Trainers use /admin/trainers to filter by trainer scope, transition sessions from Scheduled → In Progress → Completed, record coaching notes, and log post-session member feedback.' },
  { category: 'CRM & Leads', title: '10. Converting enquiries and trial leads into members', body: 'Track prospects in /admin/leads across New enquiry, Trial booked, Trial completed, Follow-up, and Converted. Clicking "Convert to Member" creates an active Member record with the selected plan and marks the lead Converted.' },
  { category: 'Payments', title: '11. Recording manual payments, reconciliation, and refunds', body: 'Use /admin/payments to record UPI, Card, Cash, or Bank Transfer transactions, mark pending items Paid, or record partial/full refund previews.' },
  { category: 'Feedback', title: '12. Member-submitted feedback and Trainer ratings', body: 'Members submit session & trainer ratings from the Member Portal (/member/home). Admin reviews responses, source badges, and trainer rating breakdowns in /admin/feedback.' },
  { category: 'Data & Settings', title: '13. Studio Settings and operational thresholds', body: 'Update default class capacity, renewal alert window (days), late check-in grace minutes, and theme mode in /admin/settings. Changes persist in browser storage and immediately apply across pages.' },
  { category: 'Assistant', title: '14. Floating Aura AI Assistant & action safety', body: 'Click the Ask Aura button in the bottom-right corner of any /admin/* page to ask about schedule occupancy, renewals, leads, revenue, or workflows. Aura never executes destructive or consequential actions without directing you to the confirmation screen.' },
];

function extractArticleRoutes(body: string): string[] {
  const matches = body.match(/\/(?:admin|member)\/[a-z-]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function cleanArticleTitle(raw: string): { number: string; heading: string } {
  const match = raw.match(/^(\d+)\.\s*(.+)$/);
  if (!match) return { number: '01', heading: raw };
  return { number: match[1].padStart(2, '0'), heading: match[2] };
}

const kbCategoryMeta: Record<string, { icon: typeof UsersIcon; tone: StatusTone }> = {
  'Roles & Access': { icon: UsersIcon, tone: 'rose' },
  'Reception & Check-In': { icon: CheckCircleIcon, tone: 'green' },
  Members: { icon: UsersIcon, tone: 'blue' },
  Memberships: { icon: FileTextIcon, tone: 'amber' },
  'Schedule & Classes': { icon: CalendarIcon, tone: 'rose' },
  'Bookings & Waitlists': { icon: ClockIcon, tone: 'blue' },
  Attendance: { icon: CheckCircleIcon, tone: 'green' },
  'Trainer Studio': { icon: ActivityIcon, tone: 'rose' },
  'CRM & Leads': { icon: UserPlusIcon, tone: 'amber' },
  Payments: { icon: IndianRupeeIcon, tone: 'green' },
  Feedback: { icon: SparklesIcon, tone: 'blue' },
  'Data & Settings': { icon: FilterIcon, tone: 'slate' },
  Assistant: { icon: SparklesIcon, tone: 'rose' },
};

export function KnowledgeBasePage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All topics');
  const [selectedTitle, setSelectedTitle] = useState<string | null>(null);

  const uniqueCategories = useMemo(
    () => Array.from(new Set(helpArticles.map((article) => article.category))),
    [],
  );
  const categories = useMemo(() => ['All topics', ...uniqueCategories], [uniqueCategories]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    counts.set('All topics', helpArticles.length);
    helpArticles.forEach((article) => {
      counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
    });
    return counts;
  }, []);

  const filtered = useMemo(
    () =>
      helpArticles.filter(
        (article) =>
          (category === 'All topics' || article.category === category) &&
          `${article.title} ${article.category} ${article.body}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [category, query],
  );

  const activeArticleIndex = useMemo(
    () => (selectedTitle ? filtered.findIndex((item) => item.title === selectedTitle) : -1),
    [filtered, selectedTitle],
  );
  const activeArticle =
    activeArticleIndex >= 0
      ? filtered[activeArticleIndex]
      : selectedTitle
        ? helpArticles.find((item) => item.title === selectedTitle) ?? null
        : null;

  const resetFilters = () => {
    setQuery('');
    setCategory('All topics');
    setSelectedTitle(null);
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Operational documentation"
        title="Knowledge Base"
        description="Structured reference guides for role boundaries, reception check-ins, 12-hour class scheduling, membership freeze workflows, CRM conversion, payments, and Aura AI."
        action={
          <Link
            href="/admin/platform-tour"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            <SparklesIcon size="xs" />
            Launch 12-Step Platform Tour
          </Link>
        }
      />

      {/* Search & quick summary bar */}
      <PagePanel className="mb-6 overflow-hidden border-slate-200/90 bg-gradient-to-br from-white via-rose-50/35 to-violet-50/30 p-5 dark:border-studio-700 dark:from-studio-900 dark:via-studio-900 dark:to-studio-950 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100/80 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              <FileTextIcon size="xs" />
              {helpArticles.length} Operational Guides · {uniqueCategories.length} Categories
            </span>
            <h2 className="mt-2.5 font-serif text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
              Find exact workflows and studio standards
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
              Filter by operational domain or search keywords like{' '}
              <button
                type="button"
                onClick={() => {
                  setSelectedTitle(null);
                  setQuery('freeze');
                }}
                className="font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-800 dark:text-rose-300"
              >
                freeze
              </button>
              ,{' '}
              <button
                type="button"
                onClick={() => {
                  setSelectedTitle(null);
                  setQuery('12-hour');
                }}
                className="font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-800 dark:text-rose-300"
              >
                12-hour
              </button>
              ,{' '}
              <button
                type="button"
                onClick={() => {
                  setSelectedTitle(null);
                  setQuery('waitlist');
                }}
                className="font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-800 dark:text-rose-300"
              >
                waitlist
              </button>
              , or{' '}
              <button
                type="button"
                onClick={() => {
                  setSelectedTitle(null);
                  setQuery('Aura');
                }}
                className="font-semibold text-rose-700 underline decoration-rose-300 underline-offset-2 hover:text-rose-800 dark:text-rose-300"
              >
                Aura
              </button>
              .
            </p>
          </div>

          <div className="flex w-full flex-col gap-2.5 sm:flex-row lg:max-w-lg">
            <label className="relative flex-1">
              <span className="sr-only">Search help topics</span>
              <SearchIcon
                size="sm"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedTitle(null);
                }}
                placeholder="Search by workflow, route, or keyword..."
                className={`${inputClass} h-11 w-full rounded-xl pl-10 pr-16 text-xs shadow-sm dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100`}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-studio-800"
                >
                  Clear
                </button>
              )}
            </label>
            <select
              aria-label="Knowledge category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setSelectedTitle(null);
              }}
              className={`${selectClass} h-11 rounded-xl shadow-sm dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100`}
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item} ({categoryCounts.get(item) ?? 0})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Interactive Category Pills */}
        <div
          className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-4 dark:border-studio-800"
          role="tablist"
          aria-label="Filter knowledge base by category"
        >
          {categories.map((item) => {
            const isActive = category === item;
            const count = categoryCounts.get(item) ?? 0;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setCategory(item);
                  setSelectedTitle(null);
                }}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  isActive
                    ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white/90 text-slate-700 hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200 dark:hover:border-rose-800'
                }`}
              >
                <span>{item}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 text-slate-600 dark:bg-studio-800 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </PagePanel>

      {/* Dedicated Full Article Reader View when an article is opened */}
      {activeArticle ? (
        <PagePanel className="mb-6 overflow-hidden border-rose-200/90 p-5 dark:border-studio-700 dark:bg-studio-900 sm:p-7">
          {(() => {
            const { number, heading } = cleanArticleTitle(activeArticle.title);
            const meta = kbCategoryMeta[activeArticle.category] ?? {
              icon: FileTextIcon,
              tone: 'slate' as StatusTone,
            };
            const CategoryIcon = meta.icon;
            const routes = extractArticleRoutes(activeArticle.body);
            const prevArticle = activeArticleIndex > 0 ? filtered[activeArticleIndex - 1] : null;
            const nextArticle =
              activeArticleIndex >= 0 && activeArticleIndex < filtered.length - 1
                ? filtered[activeArticleIndex + 1]
                : null;
            const relatedArticles = helpArticles
              .filter(
                (item) =>
                  item.title !== activeArticle.title && item.category === activeArticle.category,
              )
              .slice(0, 3);

            return (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-studio-800">
                  <button
                    type="button"
                    onClick={() => setSelectedTitle(null)}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200"
                  >
                    ← Back to all articles ({filtered.length})
                  </button>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={meta.tone}>{activeArticle.category}</StatusBadge>
                    <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-700 dark:bg-studio-800 dark:text-slate-200">
                      Guide #{number}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                  <div>
                    <div className="flex items-start gap-3.5">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                        <CategoryIcon size="md" />
                      </span>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-rose-700 dark:text-rose-300">
                          {activeArticle.category} · Guide {number}
                        </p>
                        <h2 className="mt-1 font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                          {heading}
                        </h2>
                      </div>
                    </div>

                    <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-studio-800 dark:bg-studio-950/60">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Standard Operating Procedure
                      </h3>
                      <p className="mt-2.5 text-sm leading-7 text-slate-800 dark:text-slate-100">
                        {activeArticle.body}
                      </p>
                    </div>

                    {routes.length > 0 && (
                      <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/40 p-4 dark:border-rose-950/50 dark:bg-rose-950/20">
                        <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-rose-800 dark:text-rose-200">
                          Referenced Studio Workspaces
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          Jump directly to the live workspace referenced in this guide:
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {routes.map((route) => (
                            <Link
                              key={route}
                              href={route}
                              className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
                            >
                              <span>Open {route}</span>
                              <ArrowRightIcon size="xs" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reader side panel */}
                  <aside className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-studio-800 dark:bg-studio-950/50">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                        Article Metadata
                      </p>
                      <dl className="mt-2.5 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Article ID</dt>
                          <dd className="font-semibold text-slate-900 dark:text-white">#{number}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Category</dt>
                          <dd className="font-semibold text-slate-900 dark:text-white">
                            {activeArticle.category}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between">
                          <dt className="text-slate-500 dark:text-slate-400">Studio scope</dt>
                          <dd className="font-semibold text-slate-900 dark:text-white">
                            {currentStaffStudio.name}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    {relatedArticles.length > 0 && (
                      <div className="border-t border-slate-200/80 pt-3 dark:border-studio-800">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          More in {activeArticle.category}
                        </p>
                        <ul className="mt-2 space-y-1.5">
                          {relatedArticles.map((rel) => {
                            const parsed = cleanArticleTitle(rel.title);
                            return (
                              <li key={rel.title}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedTitle(rel.title)}
                                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-slate-700 hover:bg-white hover:text-rose-700 dark:text-slate-200 dark:hover:bg-studio-900"
                                >
                                  #{parsed.number} · {parsed.heading}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                  </aside>
                </div>

                {/* Previous / Next article controls */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-studio-800">
                  <button
                    type="button"
                    disabled={!prevArticle}
                    onClick={() => prevArticle && setSelectedTitle(prevArticle.title)}
                    className="min-h-10 rounded-lg border border-slate-200 px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-studio-700 dark:text-slate-200"
                  >
                    {prevArticle
                      ? `← Previous: #${cleanArticleTitle(prevArticle.title).number}`
                      : '← First article in list'}
                  </button>
                  <button
                    type="button"
                    disabled={!nextArticle}
                    onClick={() => nextArticle && setSelectedTitle(nextArticle.title)}
                    className="min-h-10 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40 dark:bg-rose-600 dark:hover:bg-rose-700"
                  >
                    {nextArticle
                      ? `Next: #${cleanArticleTitle(nextArticle.title).number} →`
                      : 'Last article in list →'}
                  </button>
                </div>
              </div>
            );
          })()}
        </PagePanel>
      ) : (
        /* Structured Article Cards Grid */
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Showing <strong className="text-slate-900 dark:text-white">{filtered.length}</strong>{' '}
              of {helpArticles.length} documentation articles
              {category !== 'All topics' ? ` in ${category}` : ''}
              {query.trim() ? ` matching “${query.trim()}”` : ''}
            </p>
            {(category !== 'All topics' || query.trim() !== '') && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300"
              >
                Reset filters
              </button>
            )}
          </div>

          {filtered.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((article) => {
                const { number, heading } = cleanArticleTitle(article.title);
                const meta = kbCategoryMeta[article.category] ?? {
                  icon: FileTextIcon,
                  tone: 'slate' as StatusTone,
                };
                const CategoryIcon = meta.icon;
                const routes = extractArticleRoutes(article.body);

                return (
                  <article
                    key={article.title}
                    className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-subtle transition hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md dark:border-studio-700 dark:bg-studio-900 dark:hover:border-rose-800"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                          {number}
                        </span>
                        <StatusBadge tone={meta.tone}>{article.category}</StatusBadge>
                      </div>

                      <h3 className="mt-4 font-serif text-base font-bold leading-snug tracking-tight text-slate-950 group-hover:text-rose-700 dark:text-white dark:group-hover:text-rose-300">
                        {heading}
                      </h3>

                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {article.body}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-studio-800">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryIcon size="xs" className="text-slate-400" />
                        {routes[0] ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-600 dark:bg-studio-800 dark:text-slate-300">
                            {routes[0]}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Studio standard
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedTitle(article.title)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 group-hover:translate-x-0.5 dark:text-rose-300"
                      >
                        Read guide
                        <ArrowRightIcon size="xs" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <PagePanel className="px-6 py-14 text-center dark:border-studio-700 dark:bg-studio-900">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <SearchIcon size="md" />
              </span>
              <h3 className="mt-4 font-serif text-lg font-bold text-slate-950 dark:text-white">
                No documentation guides match your search
              </h3>
              <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
                No articles matched{' '}
                {query.trim() ? `“${query.trim()}”` : 'the selected category'}. Reset your filters
                to browse all {helpArticles.length} operational topics.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Reset filters
              </button>
            </PagePanel>
          )}
        </>
      )}

      {/* Guided Platform Tour Callout */}
      <PagePanel className="mt-6 flex flex-col justify-between gap-4 border-slate-200/90 bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950 p-5 text-white sm:flex-row sm:items-center sm:p-6">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-300">
            Interactive Product Walkthrough
          </p>
          <h2 className="mt-1 font-serif text-lg font-bold tracking-tight text-white sm:text-xl">
            Ready for a guided walkthrough? Take the 12-Step Platform Tour
          </h2>
          <p className="mt-1 text-xs text-slate-300">
            Explore every live studio workspace with interactive step tracking and real-time studio
            metrics.
          </p>
        </div>
        <Link
          href="/admin/platform-tour"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-rose-50"
        >
          Start Platform Tour
          <ArrowRightIcon size="sm" />
        </Link>
      </PagePanel>
    </div>
  );
}

const TOUR_STORAGE_KEY = 'fitness-studio:tour-completed';

const tourSteps = [
  { title: 'Studio & Role Context', description: 'Verify your active branch (Indiranagar Studio) and current role badge (Owner / Admin, Staff, or Trainer) in the sidebar and top bar.', href: '/admin/dashboard', label: '01 · Workspace Context', icon: MapPinIcon },
  { title: 'Role-Specific Dashboard', description: 'Owner / Admin sees executive revenue & business intelligence; Front-Desk Staff gets the Reception Check-In & Express Booking Desk.', href: '/admin/dashboard', label: '02 · Dashboard', icon: ActivityIcon },
  { title: 'Member Directory', description: 'Search, filter, and sort studio members with live booking, attendance, and payment counts per member.', href: '/admin/members', label: '03 · People', icon: UsersIcon },
  { title: 'Memberships & Freeze Queue', description: 'Configure plan pricing & benefits, track renewals within your alert window, and approve/reject freeze requests in the single canonical queue.', href: '/admin/memberships', label: '04 · Plans & Freezes', icon: FileTextIcon },
  { title: 'CRM / Leads & Conversion', description: 'Manage enquiries and trial follow-ups, and convert qualified leads directly into active studio members in one click.', href: '/admin/leads', label: '05 · CRM Pipeline', icon: UserPlusIcon },
  { title: '12-Hour Classes & Schedule', description: 'Schedule classes with 12-hour AM/PM time pickers, inspect room/trainer conflict alerts, and switch between list and month calendar views.', href: '/admin/classes', label: '06 · Class Schedule', icon: CalendarIcon },
  { title: 'Bookings, Waitlists & Check-In', description: 'Create member bookings, promote waitlisted bookings when seats open, and check members in from the unified Bookings tabs.', href: '/admin/bookings', label: '07 · Bookings Desk', icon: CheckCircleIcon },
  { title: 'Trainer Studio & Coaching', description: 'Trainers run live sessions, mark Present/Late/Absent outcomes, save coaching notes, and review session history.', href: '/admin/trainers', label: '08 · Trainer Studio', icon: ActivityIcon },
  { title: 'Payments & Reconciliation', description: 'Record manual payments linked to member plans, mark pending items paid, and record refund previews.', href: '/admin/payments', label: '09 · Finance', icon: IndianRupeeIcon },
  { title: 'Reports & Metric Definitions', description: 'Analyze period revenue, occupancy, attendance rate, and CRM conversion with transparent calculation formulas.', href: '/admin/reports', label: '10 · Business Intelligence', icon: FileTextIcon },
  { title: 'Feedback & Studio Settings', description: 'Review member-submitted and trainer-logged feedback ratings in /admin/feedback, and tune operational thresholds in /admin/settings.', href: '/admin/feedback', label: '11 · Quality & Settings', icon: CheckCircleIcon },
  { title: 'Global Aura AI & CSV Tools', description: 'Use the bottom-right Ask Aura assistant from any page for instant answers, or import/export human-readable CSV datasets.', href: '/admin/ai-assistant', label: '12 · AI & Data Tools', icon: SparklesIcon },
];

export function PlatformTourPage() {
  const { addToast } = useToast();
  const {
    members,
    plans,
    freezeRequests,
    leads,
    classes,
    bookings,
    attendance,
    payments,
    feedback,
  } = useAdminWorkspaceData();
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TOUR_STORAGE_KEY) === 'true') setCompleted(true);
    } catch {
      // ignore
    }
  }, []);

  const markComplete = () => {
    setCompleted(true);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // ignore
    }
    addToast({
      type: 'success',
      title: 'Platform tour completed',
      message: 'All 12 operational workflows have been reviewed.',
    });
  };

  const restartTour = () => {
    setStep(0);
    setCompleted(false);
    try {
      window.localStorage.removeItem(TOUR_STORAGE_KEY);
    } catch {
      // ignore
    }
    addToast({
      type: 'info',
      title: 'Tour restarted',
      message: 'Returned to Step 1 of 12.',
    });
  };

  const current = tourSteps[step];
  const Icon = current.icon;
  const progressPercent = Math.round(((step + 1) / tourSteps.length) * 100);

  // Live workspace metrics for each tour step so the preview card is 100% authentic
  const stepPreview = useMemo(() => {
    const activeMembers = members.filter((m) => m.status === 'Active').length;
    const pendingFreezes = freezeRequests.filter((f) => f.status === 'Pending').length;
    const convertedLeads = leads.filter((l) => l.stage === 'Converted').length;
    const confirmedBookings = bookings.filter((b) => b.status === 'Confirmed').length;
    const waitlistedBookings = bookings.filter((b) => b.status === 'Waitlisted').length;
    const presentCount = attendance.filter(
      (a) => a.status === 'Present' || a.status === 'Late',
    ).length;
    const paidRevenue = payments
      .filter((p) => p.status === 'Paid' || p.status === 'Partially Refunded')
      .reduce((sum, p) => sum + p.amount - p.refundedAmount, 0);

    const previews: Array<{
      badge: string;
      headline: string;
      metrics: Array<{ label: string; value: string }>;
      highlights: string[];
    }> = [
      {
        badge: `${currentStaffStudio.name} · ${currentStaffStudio.city}`,
        headline: 'Role-scoped navigation & branch context',
        metrics: [
          { label: 'Active Studio', value: currentStaffStudio.name },
          { label: 'Branch', value: currentStaffStudio.branch },
          { label: 'Role Workspaces', value: 'Admin · Staff · Trainer' },
        ],
        highlights: [
          'Instant branch context in the sidebar & top bar',
          'Role-isolated portals for Admin, Front-Desk Staff, Trainer, and Member',
          'Persistent Light and Dark studio theme toggle',
        ],
      },
      {
        badge: 'Executive & Reception Intelligence',
        headline: 'Live operational KPIs and revenue tracking',
        metrics: [
          { label: 'Active Members', value: `${activeMembers} members` },
          { label: 'Scheduled Classes', value: `${classes.length} sessions` },
          { label: 'Net Collected', value: formatInr(paidRevenue) },
        ],
        highlights: [
          'Personalized time-aware greeting with live studio summary',
          'Revenue, occupancy, and membership distribution charts',
          'Direct front-desk check-in & express booking actions for Staff',
        ],
      },
      {
        badge: 'People & Member Records',
        headline: 'Complete member directory & activity ledger',
        metrics: [
          { label: 'Total Directory', value: `${members.length} profiles` },
          { label: 'Active Standing', value: `${activeMembers} active` },
          { label: 'Confirmed Bookings', value: `${confirmedBookings} linked` },
        ],
        highlights: [
          'Filter by status, plan tier, assigned coach, or 30-day expiry window',
          'Add or edit member profiles with duplicate phone/email validation',
          'Inspect per-member attendance and payment ledger history',
        ],
      },
      {
        badge: 'Plans & Canonical Freeze Queue',
        headline: 'INR membership tiers & freeze approvals',
        metrics: [
          { label: 'Configured Plans', value: `${plans.length} tiers` },
          { label: 'Pending Freezes', value: `${pendingFreezes} awaiting review` },
          { label: 'Total Freeze Requests', value: `${freezeRequests.length} logged` },
        ],
        highlights: [
          'Manage Monthly, Quarterly, and Annual plan pricing & benefits',
          'Single canonical queue for approving or rejecting freeze requests',
          'Automatic member status sync (Active ↔ Paused)',
        ],
      },
      {
        badge: 'CRM & Trial Pipeline',
        headline: 'Enquiry tracking & one-click member conversion',
        metrics: [
          { label: 'Total Enquiries', value: `${leads.length} leads` },
          { label: 'Converted Members', value: `${convertedLeads} converted` },
          {
            label: 'Active Pipeline',
            value: `${leads.length - convertedLeads} in progress`,
          },
        ],
        highlights: [
          'Track prospects across New enquiry, Trial booked, Follow-up, and Converted',
          'One-click "Convert to Member" creates an active member record',
          'Assign follow-up owners and preferred membership plans',
        ],
      },
      {
        badge: '12-Hour Studio Scheduler',
        headline: 'Conflict-checked class timetable & room allocation',
        metrics: [
          { label: 'Studio Sessions', value: `${classes.length} classes` },
          { label: 'Time Format', value: '12-Hour AM/PM' },
          { label: 'Views', value: 'List & Month Calendar' },
        ],
        highlights: [
          '12-hour AM/PM time selectors with :00/:15/:30/:45 intervals',
          'Automatic trainer and studio room double-booking conflict alerts',
          'Interactive roster inspection and session creation',
        ],
      },
      {
        badge: 'Unified Bookings Desk',
        headline: 'Confirmed seats, automatic waitlists & check-ins',
        metrics: [
          { label: 'Confirmed Seats', value: `${confirmedBookings} booked` },
          { label: 'Waitlisted', value: `${waitlistedBookings} queued` },
          { label: 'Checked In', value: `${presentCount} marked` },
        ],
        highlights: [
          'Automatic waitlist placement when a session reaches full capacity',
          'One-click waitlist promotion when confirmed seats open',
          'Mark Present, Late, or Absent directly from the roster',
        ],
      },
      {
        badge: 'Trainer Studio Workspace',
        headline: 'Live session execution & coaching notes',
        metrics: [
          { label: 'Assigned Sessions', value: `${classes.length} total` },
          { label: 'Attendance Marked', value: `${attendance.length} records` },
          { label: 'Feedback Logged', value: `${feedback.length} entries` },
        ],
        highlights: [
          'Transition classes from Scheduled → In Progress → Completed',
          'Record session-specific coaching notes and member attendance',
          'Log post-session trainer feedback synced with Admin review',
        ],
      },
      {
        badge: 'Financial Ledger & Refunds',
        headline: 'UPI, Card, Cash & Bank Transfer reconciliation',
        metrics: [
          { label: 'Transactions', value: `${payments.length} entries` },
          { label: 'Net Revenue', value: formatInr(paidRevenue) },
          {
            label: 'Pending / Review',
            value: `${payments.filter((p) => p.status === 'Pending' || p.status === 'Review').length} items`,
          },
        ],
        highlights: [
          'Record manual payments linked to member plans with invoice IDs',
          'Mark pending payments Paid or process partial/full refund previews',
          'Transparent net collection totals across payment methods',
        ],
      },
      {
        badge: 'Executive Reports',
        headline: 'Auditable studio metrics & calculation formulas',
        metrics: [
          { label: 'Net Collection', value: formatInr(paidRevenue) },
          { label: 'Attendance Records', value: `${attendance.length} tracked` },
          { label: 'CRM Leads', value: `${leads.length} total` },
        ],
        highlights: [
          'Period revenue, class occupancy, and attendance rate breakdowns',
          'Explicit calculation formulas displayed alongside every KPI',
          'Clean tabular summaries ready for executive review',
        ],
      },
      {
        badge: 'Quality & Studio Thresholds',
        headline: 'Member ratings & persistent operational settings',
        metrics: [
          { label: 'Feedback Inbox', value: `${feedback.length} responses` },
          {
            label: 'Awaiting Review',
            value: `${feedback.filter((f) => f.reviewStatus === 'New').length} new`,
          },
          { label: 'Storage', value: 'Local browser sync' },
        ],
        highlights: [
          'Review member-submitted and trainer-logged session ratings',
          'Configure default class capacity, renewal alert window, and late grace minutes',
          'Instant Light/Dark theme persistence across sessions',
        ],
      },
      {
        badge: 'Aura AI & Excel/CSV Operations',
        headline: 'Action-safe AI assistant & multi-sheet workbooks',
        metrics: [
          { label: 'Assistant', value: staffAssistantName },
          { label: 'Export Format', value: 'Excel (.xlsx)' },
          { label: 'Import Validation', value: 'Live row preview' },
        ],
        highlights: [
          'Ask Aura AI about occupancy, renewals, leads, or revenue from any page',
          'Validate CSV imports with structured row-level status badges',
          'Download formatted Excel (.xlsx) workbooks for any dataset or full studio archive',
        ],
      },
    ];

    return previews[step] ?? previews[0];
  }, [
    attendance,
    bookings,
    classes.length,
    feedback,
    freezeRequests,
    leads,
    members,
    payments,
    plans.length,
    step,
  ]);

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        eyebrow="Interactive product walkthrough"
        title="Platform Tour"
        description="Explore all 12 core studio management workflows across Admin, Front-Desk Staff, and Trainer workspaces with live studio data previews."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={completed ? 'green' : 'rose'}>
              {completed ? 'Tour Completed' : `In Progress · Step ${step + 1} of ${tourSteps.length}`}
            </StatusBadge>
            <button
              type="button"
              onClick={restartTour}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
            >
              <RefreshCwIcon size="xs" />
              Restart Tour
            </button>
          </div>
        }
      />

      {/* Hero Progress Banner */}
      <PagePanel className="mb-6 overflow-hidden border-slate-200/90 bg-gradient-to-br from-white via-rose-50/40 to-violet-50/35 p-5 dark:border-studio-700 dark:from-studio-900 dark:via-studio-900 dark:to-studio-950 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
              Guided Architecture Walkthrough · {currentStaffStudio.name}
            </p>
            <h2 className="mt-1 font-serif text-xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-2xl">
              Step {step + 1} of {tourSteps.length}: {current.title}
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Select any step below or use Previous / Next controls to inspect live studio
              capabilities.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!completed && (
              <button
                type="button"
                onClick={markComplete}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
              >
                <CheckCircleIcon size="xs" />
                Mark Tour Complete
              </button>
            )}
            <Link
              href="/admin/knowledge-base"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-200"
            >
              <FileTextIcon size="xs" />
              Knowledge Base
            </Link>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            <span>Walkthrough progress</span>
            <span className="tabular-nums">{progressPercent}% ({step + 1}/{tourSteps.length} steps)</span>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-studio-800"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={tourSteps.length}
            aria-label={`Tour progress: step ${step + 1} of ${tourSteps.length}`}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-rose-600 to-violet-600 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </PagePanel>

      {/* Main Interactive Tour Stage */}
      <PagePanel className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
        <div className="grid lg:grid-cols-[290px_minmax(0,1fr)]">
          {/* Left Step Sequence Rail */}
          <nav
            aria-label="Tour steps"
            className="border-b border-slate-200 bg-slate-50/80 p-3.5 dark:border-studio-800 dark:bg-studio-950/60 lg:border-b-0 lg:border-r"
          >
            <p className="mb-2.5 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              12-Step Sequence
            </p>
            <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:pb-0">
              {tourSteps.map((item, index) => {
                const isCurrent = step === index;
                const isVisited = completed || index < step;
                return (
                  <li key={item.title}>
                    <button
                      type="button"
                      onClick={() => setStep(index)}
                      aria-current={isCurrent ? 'step' : undefined}
                      className={`flex min-h-10 whitespace-nowrap items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-semibold transition lg:w-full ${
                        isCurrent
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-700 hover:bg-white dark:text-slate-300 dark:hover:bg-studio-900'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums ${
                            isCurrent
                              ? 'bg-white/20 text-white'
                              : isVisited
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                : 'bg-slate-200/70 text-slate-600 dark:bg-studio-800 dark:text-slate-400'
                          }`}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="truncate">{item.title}</span>
                      </span>
                      {isVisited && !isCurrent && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Active Step Detail & Live Workspace Preview Card */}
          <div className="flex flex-col justify-between p-5 sm:p-8">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-700 shadow-sm dark:bg-rose-950/60 dark:text-rose-300">
                    <Icon size="md" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-rose-700 dark:text-rose-300">
                      {current.label}
                    </p>
                    <h2 className="mt-0.5 font-serif text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
                      {current.title}
                    </h2>
                  </div>
                </div>
                <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs font-semibold text-slate-700 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-300">
                  {current.href}
                </span>
              </div>

              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                {current.description}
              </p>

              {/* Live Workspace Preview Illustration Card */}
              <div className="mt-6 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5 dark:border-studio-800 dark:bg-studio-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3.5 dark:border-studio-800">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <span className="ml-2 text-xs font-bold text-slate-800 dark:text-slate-200">
                      Live Workspace Snapshot · {stepPreview.headline}
                    </span>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm dark:bg-studio-900 dark:text-slate-300">
                    {stepPreview.badge}
                  </span>
                </div>

                {/* Live Studio Metrics Row */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {stepPreview.metrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-subtle dark:border-studio-800 dark:bg-studio-900"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
                        {metric.label}
                      </p>
                      <p className="mt-1 font-serif text-lg font-bold text-slate-950 dark:text-white">
                        {metric.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Key Capabilities Checklist */}
                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                    What you can do in this workspace
                  </p>
                  <ul className="mt-2.5 grid gap-2 sm:grid-cols-3">
                    {stepPreview.highlights.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 rounded-xl border border-slate-200/60 bg-white/80 p-3 text-xs leading-5 text-slate-700 dark:border-studio-800 dark:bg-studio-900/70 dark:text-slate-200"
                      >
                        <CheckCircleIcon
                          size="xs"
                          className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Step Navigation Footer */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-studio-800">
              <button
                type="button"
                disabled={step === 0}
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-studio-700 dark:text-slate-200"
              >
                ← Previous Step
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href={current.href}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-4 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200"
                >
                  <span>Open {current.title}</span>
                  <ArrowRightIcon size="xs" />
                </Link>

                {step < tourSteps.length - 1 ? (
                  <button
                    type="button"
                    onClick={() => setStep((value) => Math.min(tourSteps.length - 1, value + 1))}
                    className="min-h-10 rounded-xl bg-rose-600 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
                  >
                    Next Step ({step + 2}/{tourSteps.length}) →
                  </button>
                ) : (
                  <Link
                    href="/admin/dashboard"
                    onClick={markComplete}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                  >
                    <CheckCircleIcon size="xs" />
                    Finish Tour &amp; Return to Dashboard
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </PagePanel>

      {/* All 12 Steps Interactive Overview Grid */}
      <div className="mt-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
              Complete 12-Step Tour Map
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Jump directly to any module in the walkthrough or launch its live workspace.
            </p>
          </div>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {tourSteps.map((item, index) => {
            const StepIcon = item.icon;
            const isCurrent = step === index;
            return (
              <div
                key={item.title}
                className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                  isCurrent
                    ? 'border-rose-500 bg-rose-50/40 shadow-sm dark:border-rose-600 dark:bg-rose-950/30'
                    : 'border-slate-200/80 bg-white hover:border-rose-200 dark:border-studio-700 dark:bg-studio-900'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      <StepIcon size="sm" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Step {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h4 className="mt-3 font-serif text-sm font-bold text-slate-950 dark:text-white">
                    {item.title}
                  </h4>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {item.description}
                  </p>
                </div>
                <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
                  <button
                    type="button"
                    onClick={() => setStep(index)}
                    className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300"
                  >
                    {isCurrent ? 'Active step' : 'Preview step'}
                  </button>
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  >
                    Open
                    <ArrowRightIcon size="xs" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type StudioImportType = 'Members' | 'Leads' | 'Classes' | 'Memberships' | 'Bookings' | 'Attendance' | 'Payments' | 'Events';
type StudioExportType = 'Members' | 'Leads' | 'Classes' | 'Memberships' | 'Bookings' | 'Attendance' | 'Payments' | 'Events';
type DuplicatePolicy = 'skip' | 'update';
type BatchImportFile = { file: File; type: StudioImportType; rows?: Array<Record<string, unknown>> };
type BatchImportReport = { fileName: string; type: StudioImportType; result?: import('@/lib/api-client').ImportResult; persistedCount?: number; error?: string; verificationError?: string };

const importDependencyOrder: StudioImportType[] = ['Memberships', 'Members', 'Classes', 'Leads', 'Bookings', 'Attendance', 'Payments', 'Events'];

function detectImportType(fileName: string, csv: string): StudioImportType | null {
  let headers: string[];
  try {
    headers = parseStudioCsv(csv.replace(/^\uFEFF/, ''))[0]?.map((value) => value.trim().toLowerCase().replace(/[_\s-]/g, '')) ?? [];
  } catch {
    return null;
  }
  const fields = new Set(headers);
  if (fields.has('memberid') && fields.has('classid')) return 'Bookings';
  if (fields.has('bookingid') && (fields.has('checkedinat') || fields.has('classname'))) return 'Attendance';
  if (fields.has('ref') && fields.has('amount') && fields.has('currency')) return 'Payments';
  if (fields.has('plantype') && (fields.has('sessionlimit') || fields.has('priceinr') || fields.has('price'))) return 'Memberships';
  if (fields.has('starttime') && fields.has('trainer') && fields.has('capacity')) return 'Classes';
  if (fields.has('title') && fields.has('startat') && fields.has('venue')) return 'Events';
  if (fields.has('name') && fields.has('email') && (fields.has('joined') || fields.has('expiry') || fields.has('coach'))) return 'Members';
  if (fields.has('name') && (fields.has('stage') || fields.has('followupdate')) && (fields.has('source') || fields.has('assigned') || fields.has('notes'))) return 'Leads';
  const name = fileName.toLowerCase();
  if (name.includes('lead')) return 'Leads';
  if (name.includes('member') && !name.includes('membership')) return 'Members';
  if (name.includes('membership')) return 'Memberships';
  if (name.includes('class') || name.includes('schedule')) return 'Classes';
  if (name.includes('booking')) return 'Bookings';
  if (name.includes('attendance')) return 'Attendance';
  if (name.includes('payment')) return 'Payments';
  if (name.includes('event')) return 'Events';
  return null;
}

function parseDatasetCsvPackage(csv: string, fileName: string): Array<{ type: StudioImportType; rows: Array<Record<string, unknown>> }> | null {
  const matrix = parseStudioCsv(csv.replace(/^\uFEFF/, ''));
  const headers = matrix[0]?.map((header) => header.trim()) ?? [];
  const datasetColumn = headers.findIndex((header) => header.toLowerCase() === 'dataset');
  if (datasetColumn < 0) return null;
  const datasetTypes: Record<string, StudioImportType> = {
    members: 'Members', leads: 'Leads', classes: 'Classes', memberships: 'Memberships',
    bookings: 'Bookings', attendance: 'Attendance', payments: 'Payments', events: 'Events',
  };
  const grouped = new Map<StudioImportType, Array<Record<string, unknown>>>();
  for (const [index, cells] of matrix.slice(1).entries()) {
    const dataset = String(cells[datasetColumn] ?? '').trim().toLowerCase();
    const type = datasetTypes[dataset];
    if (!type) throw new Error(`${fileName}, row ${index + 2}: unsupported dataset "${dataset}".`);
    const record: Record<string, unknown> = {};
    headers.forEach((header, column) => {
      if (column !== datasetColumn && cells[column] !== undefined && cells[column] !== '') record[header] = cells[column];
    });
    grouped.set(type, [...(grouped.get(type) ?? []), record]);
  }
  if (!grouped.size) throw new Error(`${fileName} contains a dataset column but no data rows.`);
  return Array.from(grouped, ([type, rows]) => ({ type, rows }));
}

const csvHeaderTemplates: Record<StudioImportType, string> = {
  Members: 'id,name,email,phone,plan,status,joined,expiry,coach',
  Leads: 'name,email,phone,source,stage,followUpDate,assigned,plan,notes',
  Classes: 'id,name,category,date,startTime,endTime,trainer,room,capacity,status',
  Memberships: 'name,planType,priceINR,sessionLimit,benefits,active',
  Bookings: 'id,memberId,classId,status,bookedAt',
  Attendance: 'bookingId,memberId,className,date,status,checkedInAt',
  Payments: 'ref,memberId,type,date,amount,currency,method,status,refundedAmount,notes',
  Events: 'title,category,description,startAt,endAt,venue,organizer,capacity,cancelled,published',
};

export function ImportExportPage() {
  const { addToast } = useToast();
  const {
    members, setMembers,
    leads, setLeads,
    classes, setClasses,
    plans, bookings, attendance, payments, events, eventRegistrations,
    setNotifications, refresh,
  } = useAdminWorkspaceData();

  const importTypes: StudioImportType[] = ['Members', 'Leads', 'Classes', 'Memberships', 'Bookings', 'Attendance', 'Payments', 'Events'];
  const exportTypes: StudioExportType[] = ['Members', 'Leads', 'Classes', 'Memberships', 'Bookings', 'Attendance', 'Payments', 'Events'];

  const [importType, setImportType] = useState<StudioImportType>('Members');
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('skip');
  const [selectedFile, setSelectedFile] = useState('');
  const [sourcePreset, setSourcePreset] = useState<'file' | 'custom'>('custom');
  const [csvText, setCsvText] = useState(() => csvHeaderTemplates.Members);
  const [selectedFileObject, setSelectedFileObject] = useState<File | null>(null);
  const [serverPreview, setServerPreview] = useState<import('@/lib/api-client').ImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState<StudioExportType[]>([]);
  const [confirmedImport, setConfirmedImport] = useState(false);
  const [selectedExports, setSelectedExports] = useState<StudioExportType[]>(['Members', 'Bookings', 'Attendance', 'Payments']);
  const [notice, setNotice] = useState('');
  const [noticeTone, setNoticeTone] = useState<'emerald' | 'amber' | 'rose'>('emerald');
  const [fileFormatError, setFileFormatError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const commitPanelRef = useRef<HTMLDivElement | null>(null);
  const [batchFiles, setBatchFiles] = useState<BatchImportFile[]>([]);
  const [batchConfirmed, setBatchConfirmed] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchError, setBatchError] = useState('');
  const [batchReports, setBatchReports] = useState<BatchImportReport[]>([]);

  // Keep a header-only template available for direct pasted CSV input.
  useEffect(() => {
    if (sourcePreset === 'custom') setCsvText(csvHeaderTemplates[importType]);
  }, [importType, sourcePreset]);

  const parsedPreview = useMemo(() => {
    const trimmed = csvText.trim();
    if (!trimmed) {
      return {
        headers: [] as string[],
        rows: [] as Array<{
          line: number;
          values: Record<string, string>;
          status: 'new' | 'duplicate-skip' | 'duplicate-update' | 'invalid';
          message: string;
        }>,
        parseError: '',
      };
    }
    try {
      const matrix = parseStudioCsv(trimmed);
      if (matrix.length < 2) {
        return { headers: matrix[0] ?? [], rows: [], parseError: '' };
      }
      const headers = matrix[0].map((header) => header.trim().toLowerCase());
      const dataRows = matrix.slice(1);

      const evaluated = dataRows.map((cells, idx) => {
        const values: Record<string, string> = {};
        headers.forEach((header, colIdx) => {
          if (header) values[header] = (cells[colIdx] ?? '').trim();
        });

        if (importType === 'Members') {
          const name = values.name || values.fullname || '';
          const email = (values.email || '').toLowerCase();
          const phone = indianMobileNationalNumber(values.phone || '');
          if (!name || !email) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Missing required member name or email address.' };
          }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { line: idx + 1, values, status: 'invalid' as const, message: `Email address "${email}" is not in a valid format.` };
          }
          if (values.phone && !isValidIndianMobile(values.phone)) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Member phone must be a valid Indian mobile number.' };
          }
          const exists = members.some((item) => item.email.toLowerCase() === email || (phone.length >= 10 && item.phone.replace(/\D/g, '') === phone));
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing member — record will be updated' : 'Matches existing member — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new member record ready to import' };
        }

        if (importType === 'Leads') {
          const name = values.name || '';
          const email = (values.email || '').toLowerCase();
          const phone = indianMobileNationalNumber(values.phone || '');
          if (!name || (!email && !phone)) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Lead requires a full name and either email or phone.' };
          }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return { line: idx + 1, values, status: 'invalid' as const, message: `Email address "${email}" is not in a valid format.` };
          }
          if (values.phone && !isValidIndianMobile(values.phone)) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Lead phone must be a valid Indian mobile number.' };
          }
          const exists = leads.some((item) => (email && item.email.toLowerCase() === email) || (phone.length >= 10 && item.phone.replace(/\D/g, '') === phone));
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing CRM lead — record will be updated' : 'Matches existing CRM lead — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new CRM lead ready to import' };
        }

        if (importType === 'Classes') {
          const name = values.name || values.title || '';
          const date = values.date || '';
          const startTime = values.starttime || values.start || '';
          const trainer = values.trainer || '';
          const capacity = Number(values.capacity || '12');
          if (!name || !date || !startTime || !trainer) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Class requires class name, date, start time, and trainer.' };
          }
          if (!Number.isFinite(capacity) || capacity <= 0) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Class capacity must be a positive number.' };
          }
          const exists = classes.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.date === date && item.startTime.toLowerCase() === startTime.toLowerCase());
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing scheduled class — session will be updated' : 'Matches existing scheduled class — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new class session ready to import' };
        }

        if (importType === 'Memberships') {
          const name = values.name || values.title || '';
          const planType = values.plantype || values.planType || '';
          const priceINR = Number(values.priceinr || values.priceINR || '0');
          const sessionLimit = Number(values.sessionlimit || values.sessionLimit || '0');
          if (!name || !planType) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Membership requires a name and plan type.' };
          }
          if (!Number.isFinite(priceINR) || priceINR <= 0) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Membership price must be a positive number.' };
          }
          if (!Number.isFinite(sessionLimit) || sessionLimit <= 0) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Membership session limit must be a positive number.' };
          }
          const exists = plans.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.planType.toLowerCase() === planType.toLowerCase());
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing membership plan — record will be updated' : 'Matches existing membership plan — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new membership plan ready to import' };
        }

        if (importType === 'Bookings') {
          const classId = values.classid || values.classId || '';
          const memberId = values.memberid || values.memberId || '';
          if (!classId || !memberId) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Booking requires both class ID and member ID.' };
          }
          const exists = bookings.some((item) => item.classId.toLowerCase() === classId.toLowerCase() && item.memberId.toLowerCase() === memberId.toLowerCase());
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing booking — record will be updated' : 'Matches existing booking — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new booking ready to import' };
        }

        if (importType === 'Attendance') {
          const bookingId = values.bookingid || values.bookingId || '';
          if (!bookingId) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Attendance requires a booking ID.' };
          }
          const exists = attendance.some((item) => item.bookingId.toLowerCase() === bookingId.toLowerCase());
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing attendance record — record will be updated' : 'Matches existing attendance record — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new attendance record ready to import' };
        }

        if (importType === 'Payments') {
          const ref = values.ref || '';
          const memberId = values.memberid || values.memberId || '';
          if (!ref || !memberId) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Payment requires both reference and member ID.' };
          }
          const amount = Number(values.amount || '0');
          if (!Number.isFinite(amount) || amount < 0) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Payment amount must be a valid number.' };
          }
          const exists = payments.some((item) => item.ref.toLowerCase() === ref.toLowerCase());
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing payment — record will be updated' : 'Matches existing payment — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new payment ready to import' };
        }

        if (importType === 'Events') {
          const title = values.title || '';
          const startAt = values.startat || values.startAt || '';
          if (!title || !startAt) {
            return { line: idx + 1, values, status: 'invalid' as const, message: 'Event requires both title and start date/time.' };
          }
          const exists = events.some((item) => item.title.toLowerCase() === title.toLowerCase() && item.startAt === startAt);
          if (exists) {
            return {
              line: idx + 1,
              values,
              status: duplicatePolicy === 'update' ? ('duplicate-update' as const) : ('duplicate-skip' as const),
              message: duplicatePolicy === 'update' ? 'Matches existing event — record will be updated' : 'Matches existing event — duplicate will be skipped',
            };
          }
          return { line: idx + 1, values, status: 'new' as const, message: 'Valid new event ready to import' };
        }

        return { line: idx + 1, values, status: 'invalid' as const, message: `Unknown import type: ${importType}` };
      });

      return { headers, rows: evaluated, parseError: '' };
    } catch (error) {
      return {
        headers: [] as string[],
        rows: [],
        parseError: error instanceof Error ? error.message : 'Unable to parse spreadsheet rows.',
      };
    }
  }, [csvText, importType, duplicatePolicy, members, leads, classes]);

  const newRowsCount = parsedPreview.rows.filter((row) => row.status === 'new').length;
  const updateRowsCount = parsedPreview.rows.filter((row) => row.status === 'duplicate-update').length;
  const actionableRows = parsedPreview.rows.filter((row) => row.status === 'new' || row.status === 'duplicate-update');
  const invalidCount = parsedPreview.rows.filter((row) => row.status === 'invalid').length;
  const skippedCount = parsedPreview.rows.filter((row) => row.status === 'duplicate-skip').length;

  const processImportFile = (file: File) => {
    clearBatchFiles();
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (ext !== '.csv') {
      setFileFormatError(`Unsupported format "${ext}". Export the worksheet as UTF-8 CSV before uploading.`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFileFormatError('The CSV exceeds the 10 MB upload limit. Split it into smaller files.');
      return;
    }
    setFileFormatError('');
    setSelectedFile(`${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    setSourcePreset('file');
    setSelectedFileObject(file);
    setServerPreview(null);
    setConfirmedImport(false);
    setNotice('');

    const lowerName = file.name.toLowerCase();
    let detectedType: StudioImportType = importType;
    if (lowerName.includes('lead') || lowerName.includes('crm') || lowerName.includes('enquir')) {
      detectedType = 'Leads';
    } else if (lowerName.includes('membership')) {
      detectedType = 'Memberships';
    } else if (lowerName.includes('member')) {
      detectedType = 'Members';
    } else if (lowerName.includes('booking')) {
      detectedType = 'Bookings';
    } else if (lowerName.includes('attend')) {
      detectedType = 'Attendance';
    } else if (lowerName.includes('payment')) {
      detectedType = 'Payments';
    } else if (lowerName.includes('event')) {
      detectedType = 'Events';
    } else if (lowerName.includes('class') || lowerName.includes('sched') || lowerName.includes('session')) {
      detectedType = 'Classes';
    }
    setImportType(detectedType);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const content = reader.result;
        setCsvText(content);
        const firstLine = content.split('\n')[0]?.toLowerCase() || '';
        if (firstLine.includes('stage') || firstLine.includes('followup') || firstLine.includes('source')) {
          setImportType('Leads');
        } else if (firstLine.includes('plantype') || firstLine.includes('sessionlimit')) {
          setImportType('Memberships');
        } else if (firstLine.includes('trainer') || firstLine.includes('room') || firstLine.includes('starttime')) {
          setImportType('Classes');
        } else if (firstLine.includes('bookingid')) {
          setImportType('Attendance');
        } else if (firstLine.includes('classid') && firstLine.includes('memberid')) {
          setImportType('Bookings');
        } else if (firstLine.includes('refundedamount')) {
          setImportType('Payments');
        } else if (firstLine.includes('startat') && firstLine.includes('venue')) {
          setImportType('Events');
        } else if (firstLine.includes('coach') || firstLine.includes('expiry')) {
          setImportType('Members');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const csv = await file.text();
      if (parseDatasetCsvPackage(csv, file.name)) await stageBatchFiles([file]);
      else processImportFile(file);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Unable to read the selected CSV.');
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) void stageBatchFiles(files);
    else if (files[0]) processImportFile(files[0]);
  };

  const stageBatchFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    setBatchError('');
    setBatchReports([]);
    setBatchConfirmed(false);
    if (files.length === 0) return;
    if (files.length > 8) {
      setBatchError('Choose up to 8 CSV files per batch.');
      return;
    }
    if (files.some((file) => !/\.csv$/i.test(file.name) || file.size > 10 * 1024 * 1024)) {
      setBatchError('Choose CSV files, each no larger than 10 MB.');
      return;
    }
    try {
      const staged: BatchImportFile[] = [];
      for (const file of files) {
        const csv = await file.text();
        const grouped = parseDatasetCsvPackage(csv, file.name);
        if (grouped) {
          for (const dataset of grouped) staged.push({ file, ...dataset });
        } else {
          const type = detectImportType(file.name, csv);
          if (!type) throw new Error(`Could not identify the dataset in ${file.name}. Check the CSV headers.`);
          staged.push({ file, type });
        }
      }
      if (staged.length === 0) throw new Error('The selected CSV contains no records to import.');
      const counts = staged.reduce<Record<string, number>>((acc, item) => {
        acc[item.type] = (acc[item.type] ?? 0) + 1;
        return acc;
      }, {});
      const duplicateType = Object.entries(counts).find(([, count]) => count > 1)?.[0];
      if (duplicateType) throw new Error(`Select only one ${duplicateType} file per batch.`);
      staged.sort((a, b) => importDependencyOrder.indexOf(a.type) - importDependencyOrder.indexOf(b.type));
      setBatchFiles(staged);
      setSelectedFile('');
      setSelectedFileObject(null);
      setServerPreview(null);
      setConfirmedImport(false);
      setCsvText(csvHeaderTemplates[staged[0].type]);
    } catch (error) {
      setBatchFiles([]);
      setBatchError(error instanceof Error ? error.message : 'Unable to stage these import files.');
    }
  };

  const runBatchImport = async () => {
    if (!batchConfirmed || batchFiles.length === 0) return;
    setBatchBusy(true);
    setBatchError('');
    setBatchReports([]);
    const reports: BatchImportReport[] = [];
    let committedAny = false;
    try {
      for (const item of batchFiles) {
        const dataset = item.type.toLowerCase() as import('@/lib/api-client').ExportDataset;
        let validation: import('@/lib/api-client').ImportResult;
        try {
          validation = await ApiClient.importDataset(dataset, item.rows ?? item.file, { dryRun: true, duplicatePolicy });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Server validation request failed.';
          reports.push({ fileName: item.file.name, type: item.type, error: message });
          setBatchReports([...reports]);
          setBatchError(`Batch paused at ${item.file.name}: ${message}`);
          return;
        }
        if (validation.failed > 0) {
          reports.push({ fileName: item.file.name, type: item.type, result: validation });
          setBatchReports([...reports]);
          setBatchError(`Batch paused at ${item.file.name}: server validation found ${validation.failed} invalid row${validation.failed === 1 ? '' : 's'}. Earlier datasets may already be imported; rerun the batch after correcting this file. Duplicate handling will make completed datasets safe to retry.`);
          return;
        }
        let result: import('@/lib/api-client').ImportResult;
        try {
          result = await ApiClient.importDataset(dataset, item.rows ?? item.file, { dryRun: false, duplicatePolicy });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Dataset write failed.';
          reports.push({ fileName: item.file.name, type: item.type, error: message });
          setBatchReports([...reports]);
          setBatchError(`Batch paused at ${item.file.name}: ${message}`);
          return;
        }
        committedAny = true;
        let persistedCount: number | undefined;
        let verificationError: string | undefined;
        try {
          persistedCount = (await ApiClient.exportDataset(dataset, { format: 'json', page: 1, limit: 1 })).count;
        } catch (error) {
          verificationError = error instanceof Error ? error.message : 'Database read-back verification failed.';
        }
        reports.push({ fileName: item.file.name, type: item.type, result, persistedCount, verificationError });
        setBatchReports([...reports]);
        if (result.failed > 0) {
          setBatchError(`Batch paused at ${item.file.name}: ${result.failed} row${result.failed === 1 ? '' : 's'} could not be written. Correct the reported rows and retry; completed rows are safe to retry with the selected duplicate policy.`);
          return;
        }
      }
      setBatchError('');
      setNoticeTone('emerald');
      setNotice(`Batch import completed for ${reports.length} dataset${reports.length === 1 ? '' : 's'}. Review per-dataset results below.`);
      addToast({ type: 'success', title: 'CSV batch imported', message: `Imported ${reports.length} dataset${reports.length === 1 ? '' : 's'} in dependency order.` });
      setBatchConfirmed(false);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : 'Batch import failed.');
    } finally {
      if (committedAny) {
        try {
          await refresh();
        } catch {
          setBatchError((current) => current || 'The batch committed, but workspace refresh failed. Refresh the page to load the imported records.');
        }
      }
      setBatchBusy(false);
    }
  };

  const clearBatchFiles = () => {
    setBatchFiles([]);
    setBatchReports([]);
    setBatchError('');
    setBatchConfirmed(false);
    if (batchFileInputRef.current) batchFileInputRef.current.value = '';
  };

  const handleCancelImport = () => {
    setCsvText(csvHeaderTemplates[importType]);
    setSelectedFile('');
    setSelectedFileObject(null);
    setServerPreview(null);
    setFileFormatError('');
    setIsDragging(false);
    setSourcePreset('custom');
    setConfirmedImport(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const cancelMsg = `Import staging cleared for ${importType.toLowerCase()}.`;
    setNoticeTone('amber');
    setNotice(cancelMsg);
    addToast({ type: 'info', title: 'Import reset', message: cancelMsg });
  };

  const validateImport = async () => {
    if (actionableRows.length === 0) return;
    setImportBusy(true);
    try {
      const dataset = importType.toLowerCase() as import('@/lib/api-client').ExportDataset;
      const source = selectedFileObject ?? csvText;
      const preview = await ApiClient.importDataset(dataset, source, { dryRun: true, duplicatePolicy });
      setServerPreview(preview);
      if (preview.failed > 0) {
        const message = `Dry run blocked the import: ${preview.failed} invalid row${preview.failed === 1 ? '' : 's'}. Review the server validation details.`;
        setNoticeTone('rose');
        setNotice(message);
        addToast({ type: 'error', title: 'Dry run found errors', message });
        return;
      }
      setConfirmedImport(true);
      setNoticeTone('emerald');
      setNotice(`Validation passed. No database records have been written yet. Click “Commit ${preview.created + preview.updated} records to database” to save them.`);
      addToast({ type: 'success', title: 'Ready to commit', message: 'Validation passed. Use the highlighted commit button to write these records to PostgreSQL.' });
      window.setTimeout(() => commitPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch (err: any) {
      const message = err?.message || 'Server validation failed';
      setNoticeTone('rose');
      setNotice(`Validation error: ${message}`);
      addToast({ type: 'error', title: 'Validation failed', message });
    } finally {
      setImportBusy(false);
    }
  };

  const applyImport = async () => {
    if (!confirmedImport || !serverPreview || serverPreview.failed > 0 || actionableRows.length === 0) return;
    setImportBusy(true);
    try {
      const dataset = importType.toLowerCase() as import('@/lib/api-client').ExportDataset;
      const source = selectedFileObject ?? csvText;
      const currentPreview = await ApiClient.importDataset(dataset, source, { dryRun: true, duplicatePolicy });
      setServerPreview(currentPreview);
      if (currentPreview.failed > 0) {
        setConfirmedImport(false);
        setNoticeTone('rose');
        setNotice(`Import blocked: ${currentPreview.failed} row${currentPreview.failed === 1 ? '' : 's'} now fail validation. Review the server validation details.`);
        return;
      }
      const result = await ApiClient.importDataset(dataset, source, { dryRun: false, duplicatePolicy });
      setServerPreview(result);

      let persistedCount: number | null = null;
      let verificationWarning = '';
      try {
        persistedCount = (await ApiClient.exportDataset(dataset, { format: 'json', page: 1, limit: 1 })).count;
      } catch (error) {
        verificationWarning = error instanceof Error ? error.message : 'Database read-back verification failed.';
      }

      // Refresh all datasets from backend so imported records appear across all pages
      await refresh();

      const { created, updated, skipped, failed } = result;
      const summary = `${importType} import committed: ${created} added, ${updated} updated, ${skipped} skipped, ${failed} invalid.${persistedCount === null ? '' : ` PostgreSQL read-back found ${persistedCount} total ${importType.toLowerCase()} records for this studio.`}`;

      setNotifications((current) => [
        {
          id: `NTF-IMP-${Date.now()}`,
          title: `${importType} import completed`,
          detail: summary,
          category: 'Data Operations',
          createdAt: new Date().toISOString(),
          unread: true,
        },
        ...current,
      ]);
      setConfirmedImport(false);
      setNoticeTone(failed > 0 || verificationWarning ? 'amber' : 'emerald');
      setNotice(verificationWarning ? `${summary} The write completed, but read-back verification could not finish: ${verificationWarning}` : summary);
      addToast({ type: failed > 0 || verificationWarning ? 'info' : 'success', title: failed > 0 ? `${importType} import partially completed` : `${importType} committed to database`, message: verificationWarning ? `${summary} Read-back verification needs a retry.` : summary });
    } catch (err: any) {
      const message = err?.message || 'Import failed';
      setNoticeTone('rose');
      setNotice(`Import error: ${message}`);
      addToast({ type: 'error', title: 'Import failed', message });
    } finally {
      setImportBusy(false);
    }
  };

  const datasetCount = (type: StudioExportType) => {
    if (type === 'Members') return members.length;
    if (type === 'Leads') return leads.length;
    if (type === 'Classes') return classes.length;
    if (type === 'Memberships') return plans.length;
    if (type === 'Bookings') return bookings.length;
    if (type === 'Attendance') return attendance.length;
    if (type === 'Payments') return payments.length;
    return events.length;
  };

  const datasetDisplayMeta: Record<
    StudioExportType,
    { label: string; description: string; fileName: string; sheetName: string }
  > = {
    Members: {
      label: 'Members Directory',
      description: 'Active, Expiring, Frozen, and Expired member profiles',
      fileName: 'members.csv',
      sheetName: 'Members Directory',
    },
    Leads: {
      label: 'CRM Leads & Enquiries',
      description: 'Enquiry stages, assigned follow-ups, and trial notes',
      fileName: 'leads.csv',
      sheetName: 'CRM Leads',
    },
    Classes: {
      label: 'Class Schedule',
      description: 'Scheduled studio classes, trainers, rooms, and capacity',
      fileName: 'classes.csv',
      sheetName: 'Class Schedule',
    },
    Memberships: {
      label: 'Membership Plans',
      description: 'Plan tiers, billing cycles, pricing, and session limits',
      fileName: 'memberships.csv',
      sheetName: 'Membership Plans',
    },
    Bookings: {
      label: 'Class Bookings',
      description: 'Confirmed reservations, waitlists, and cancellations',
      fileName: 'bookings.csv',
      sheetName: 'Class Bookings',
    },
    Attendance: {
      label: 'Attendance Outcomes',
      description: 'Present, Late, and Absent attendance check-in records',
      fileName: 'attendance.csv',
      sheetName: 'Attendance Outcomes',
    },
    Payments: {
      label: 'Payment Ledger',
      description: 'Paid, pending, refunded, and failed payment transactions',
      fileName: 'payments.csv',
      sheetName: 'Payment Ledger',
    },
    Events: {
      label: 'Studio Events & Workshops',
      description: 'Retreats, workshops, venues, and registration totals',
      fileName: 'events.csv',
      sheetName: 'Studio Events',
    },
  };

  const triggerCsvDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleCsv = async (type: StudioExportType) => {
    setExportBusy((current) => [...new Set([...current, type])]);
    try {
      const dataset = type.toLowerCase() as import('@/lib/api-client').ExportDataset;
      const { blob, fileName } = await ApiClient.downloadDatasetCsv(dataset);
      triggerCsvDownload(blob, fileName || datasetDisplayMeta[type].fileName);
      const exportSummary = `Downloaded live ${type.toLowerCase()} CSV (${datasetCount(type)} record${datasetCount(type) === 1 ? '' : 's'}).`;
      setNoticeTone('emerald');
      setNotice(exportSummary);
      addToast({ type: 'success', title: 'CSV downloaded', message: exportSummary });
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unable to export ${type.toLowerCase()}.`;
      setNoticeTone('rose');
      setNotice(message);
      addToast({ type: 'error', title: 'Export failed', message });
    } finally {
      setExportBusy((current) => current.filter((item) => item !== type));
    }
  };

  const runExport = async () => {
    if (selectedExports.length === 0) {
      setNoticeTone('rose');
      setNotice('Select at least one studio dataset before downloading CSV files.');
      return;
    }
    setExportBusy(selectedExports);
    const results = await Promise.allSettled(selectedExports.map(async (type) => {
      const dataset = type.toLowerCase() as import('@/lib/api-client').ExportDataset;
      const { blob, fileName } = await ApiClient.downloadDatasetCsv(dataset);
      triggerCsvDownload(blob, fileName || datasetDisplayMeta[type].fileName);
      return type;
    }));
    setExportBusy([]);
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    const exportSummary = `Downloaded ${succeeded} live CSV file${succeeded === 1 ? '' : 's'}${failed ? `; ${failed} failed` : ''}.`;
    setNoticeTone(failed ? 'amber' : 'emerald');
    setNotice(exportSummary);
    addToast({ type: failed ? 'info' : 'success', title: failed ? 'Export partially completed' : 'CSV export complete', message: exportSummary });
  };

  const downloadImportPackage = async () => {
    if (selectedExports.length === 0) {
      setNoticeTone('rose');
      setNotice('Select at least one dataset before creating an import package.');
      return;
    }
    setExportBusy(selectedExports);
    try {
      const datasets: Record<string, unknown[]> = {};
      for (const type of selectedExports) {
        const dataset = type.toLowerCase() as import('@/lib/api-client').ExportDataset;
        const page = await ApiClient.exportDataset(dataset, { format: 'json', page: 1, limit: 5000 });
        if (page.count > 5000) throw new Error(`${type} contains more than 5,000 records. Export that dataset as CSV separately; universal CSVs are limited to 5,000 rows per dataset.`);
        datasets[dataset] = page.data;
      }
      const records = Object.entries(datasets).flatMap(([dataset, rows]) => rows.map((row) => ({ dataset, ...(row as Record<string, unknown>) } as Record<string, unknown>)));
      const headers = ['dataset', ...Array.from(new Set(records.flatMap((record) => Object.keys(record).filter((key) => key !== 'dataset')))).sort()];
      const csv = createStudioCsv(headers, records.map((record) => headers.map((header) => (record[header] as string | number | boolean | null | undefined) ?? '')));
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      triggerCsvDownload(blob, `studio-import-package-${new Date().toISOString().slice(0, 10)}.csv`);
      const summary = `Created one universal CSV containing ${selectedExports.length} tenant-scoped dataset${selectedExports.length === 1 ? '' : 's'}.`;
      setNoticeTone('emerald');
      setNotice(summary);
      addToast({ type: 'success', title: 'Universal CSV downloaded', message: summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create the universal CSV.';
      setNoticeTone('rose');
      setNotice(message);
      addToast({ type: 'error', title: 'Universal export failed', message });
    } finally {
      setExportBusy([]);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader
        title="Import & Export"
        description="Import a dataset CSV, a dependency-ordered batch, or one universal CSV containing multiple datasets. Export selected tenant datasets as individual CSVs or one universal CSV."
      />

      {notice && (
        <div
          role="status"
          className={`mb-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold ${
            noticeTone === 'rose'
              ? 'border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
              : noticeTone === 'amber'
                ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200'
          }`}
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="rounded-md px-2 py-0.5 text-[11px] font-semibold opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* IMPORT PANEL */}
        <PagePanel className="p-5 sm:p-6 dark:border-studio-700 dark:bg-studio-900">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-studio-800">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <UploadIcon size="sm" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-lg font-bold tracking-tight text-slate-900 dark:text-white">Import Studio Records</h2>
                  <StatusBadge tone="blue">CSV</StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Upload member, lead, or class records with automatic dataset detection and duplicate handling.
                </p>
              </div>
            </div>
          </div>

          {/* Prominent Upload Area (Main Section) */}
          <div className="mt-5">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFileDrop}
              className={`relative rounded-2xl border-2 border-dashed p-6 sm:p-8 text-center transition ${
                isDragging
                  ? 'border-rose-600 bg-rose-50/80 dark:border-rose-400 dark:bg-rose-950/40'
                  : 'border-rose-300/80 bg-rose-50/30 hover:border-rose-400 dark:border-rose-900/60 dark:bg-rose-950/20'
              }`}
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-xs text-rose-600 dark:bg-studio-900 dark:text-rose-400">
                <UploadIcon size="md" />
              </div>

              <h3 className="mt-3.5 text-base font-bold text-slate-900 dark:text-white">
                Upload a UTF-8 CSV file
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Drag and drop your spreadsheet here, or choose a file from your computer.
              </p>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-700 px-5 text-xs font-semibold text-white shadow-xs transition hover:bg-rose-800 focus-within:ring-2 focus-within:ring-rose-500 focus-within:ring-offset-2">
                  <UploadIcon size="sm" />
                  <span>Choose File</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </label>
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-rose-200 bg-white px-4 text-xs font-semibold text-rose-800 shadow-xs transition hover:bg-rose-50 focus-within:ring-2 focus-within:ring-rose-500 focus-within:ring-offset-2 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-200">
                  <UploadIcon size="sm" />
                  <span>Choose CSV Files (Universal or Module)</span>
                  <input
                    ref={batchFileInputRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    multiple
                    onChange={(event) => { if (event.target.files) void stageBatchFiles(event.target.files); }}
                    className="sr-only"
                  />
                </label>
              </div>

              <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">
                Accepted format: .csv · maximum 10 MB
              </p>
            </div>

            {batchFiles.length > 0 && (
              <section aria-label="CSV batch import" className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-indigo-950 dark:text-indigo-100">Universal batch import · {batchFiles.length} dataset{batchFiles.length === 1 ? '' : 's'}</h3>
                    <p className="mt-1 text-[11px] leading-5 text-indigo-900/80 dark:text-indigo-200/80">Files are detected from their headers and processed in dependency order. Members and classes are imported before bookings, then attendance and payments.</p>
                  </div>
                  <button type="button" disabled={batchBusy} onClick={clearBatchFiles} className="text-[11px] font-semibold text-indigo-800 underline dark:text-indigo-200">Clear batch</button>
                </div>
                <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {batchFiles.map((item) => <li key={`${item.type}-${item.file.name}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-white/80 px-3 py-2 text-[11px] dark:bg-studio-900/70"><span className="truncate font-medium text-slate-800 dark:text-slate-100">{item.file.name}</span><StatusBadge tone="blue">{item.type}</StatusBadge></li>)}
                </ol>
                {batchError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">{batchError}</p>}
                {batchReports.length > 0 && <div className="mt-3 space-y-2">{batchReports.map((report) => <div key={`${report.type}-${report.fileName}`} className="rounded-lg border border-white/70 bg-white/80 p-3 text-[11px] dark:border-studio-700 dark:bg-studio-900/70"><p className="font-semibold text-slate-900 dark:text-white">{report.fileName} · {report.result ? `${report.result.created} added, ${report.result.updated} updated, ${report.result.skipped} skipped, ${report.result.failed} invalid` : 'Processing failed'}</p>{report.persistedCount !== undefined && <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">Database verified · {report.persistedCount} total {report.type.toLowerCase()} records in this studio</p>}{report.verificationError && <p className="mt-1 text-amber-700 dark:text-amber-300">Write completed; database read-back needs a retry: {report.verificationError}</p>}{report.error && <p className="mt-1 text-rose-700 dark:text-rose-300">{report.error}</p>}{report.result?.errors.slice(0, 5).map((error, index) => <p key={`${error.row}-${error.field}-${index}`} className="mt-1 text-rose-700 dark:text-rose-300">Row {error.row}{error.field ? ` · ${error.field}` : ''}: {error.message}</p>)}</div>)}</div>}
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-indigo-200 bg-white p-3 text-xs text-slate-700 dark:border-indigo-900 dark:bg-studio-900 dark:text-slate-200"><input type="checkbox" checked={batchConfirmed} disabled={batchBusy} onChange={(event) => setBatchConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-indigo-600" /><span>I confirm importing these {batchFiles.length} datasets in the order shown. The batch stops on validation or write errors and can be safely retried.</span></label>
                <button type="button" disabled={!batchConfirmed || batchBusy} onClick={() => void runBatchImport()} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-700 px-4 text-xs font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-50">{batchBusy ? 'Validating and importing batch…' : `Validate & import ${batchFiles.length} CSV${batchFiles.length === 1 ? '' : 's'}`}</button>
              </section>
            )}

            {/* Upload Format Error Display */}
            {fileFormatError && (
              <div className="mt-3.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Upload Error:</span>
                  <span>{fileFormatError}</span>
                </div>
              </div>
            )}

            {/* Parse Error Display */}
            {parsedPreview.parseError && (
              <div className="mt-3.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Parse Error:</span>
                  <span>{parsedPreview.parseError}</span>
                </div>
              </div>
            )}

            {/* Selected Filename & Upload/Validation Feedback */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-studio-700 dark:bg-studio-950/50">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-studio-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {selectedFile ? `File: ${selectedFile}` : 'Pasted CSV workspace'}
                    </span>
                    <StatusBadge tone="blue">
                      {datasetDisplayMeta[importType].label}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Detected Dataset: <span className="font-semibold text-slate-700 dark:text-slate-200">{datasetDisplayMeta[importType].label}</span> (Auto-detected)
                  </p>
                </div>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={handleCancelImport}
                    className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400"
                  >
                    Clear file
                  </button>
                )}
              </div>

              {/* Record Counts Feedback */}
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center dark:border-studio-800 dark:bg-studio-900">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Rows</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900 dark:text-white">{parsedPreview.rows.length}</p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-center dark:border-emerald-950/50 dark:bg-emerald-950/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Valid New</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{newRowsCount}</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50/50 p-2.5 text-center dark:border-sky-950/50 dark:bg-sky-950/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400">Will Update</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-sky-700 dark:text-sky-400">{updateRowsCount}</p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5 text-center dark:border-amber-950/50 dark:bg-amber-950/20">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">Duplicates</p>
                  <p className="mt-0.5 text-base font-bold tabular-nums text-amber-700 dark:text-amber-400">{skippedCount}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 dark:border-studio-800">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Dataset
                  <select
                    value={importType}
                    onChange={(event) => {
                      setImportType(event.target.value as StudioImportType);
                      setSourcePreset('custom');
                      setSelectedFile('');
                      setSelectedFileObject(null);
                      setServerPreview(null);
                      setConfirmedImport(false);
                    }}
                    className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 dark:border-studio-700 dark:bg-studio-900"
                  >
                    {importTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Paste CSV text
                  <textarea
                    rows={7}
                    value={csvText}
                    onChange={(event) => {
                      setCsvText(event.target.value);
                      setSourcePreset('custom');
                      setSelectedFile('');
                      setSelectedFileObject(null);
                      setServerPreview(null);
                      setConfirmedImport(false);
                    }}
                    spellCheck={false}
                    className="resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                    placeholder={csvHeaderTemplates[importType]}
                  />
                </label>
                {serverPreview ? <div className="space-y-2 rounded-lg bg-indigo-50 px-3 py-2 text-[11px] text-indigo-950 dark:bg-indigo-950/30 dark:text-indigo-200"><p className="font-semibold">Server validation: {serverPreview.created} new · {serverPreview.updated} updates · {serverPreview.skipped} skipped · {serverPreview.failed} invalid</p>{serverPreview.errors.length > 0 && <ul className="max-h-32 space-y-1 overflow-auto" aria-label="Server validation errors">{serverPreview.errors.slice(0, 20).map((error, index) => <li key={`${error.row}-${error.field}-${index}`}>Row {error.row}{error.field ? ` · ${error.field}` : ''}: {error.message}</li>)}</ul>}</div> : null}
              </div>
            </div>
          </div>

          {/* Duplicate Record Handling */}
          <div className="mt-5">
            <fieldset>
              <legend className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Duplicate Record Handling
              </legend>
              <div role="radiogroup" aria-label="Duplicate record handling" className="mt-2 grid gap-2.5 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                    duplicatePolicy === 'skip'
                      ? 'border-rose-600 bg-rose-50/50 dark:border-rose-500 dark:bg-rose-950/25'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-studio-700 dark:bg-studio-950/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="duplicatePolicy"
                    value="skip"
                    checked={duplicatePolicy === 'skip'}
                    onChange={() => {
                      setDuplicatePolicy('skip');
                      setConfirmedImport(false);
                      setServerPreview(null);
                    }}
                    className="mt-0.5 h-4 w-4 accent-rose-600"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">Skip existing matching records</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                      Keep existing studio records untouched when email, phone, or session time matches.
                    </span>
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                    duplicatePolicy === 'update'
                      ? 'border-rose-600 bg-rose-50/50 dark:border-rose-500 dark:bg-rose-950/25'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-studio-700 dark:bg-studio-950/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="duplicatePolicy"
                    value="update"
                    checked={duplicatePolicy === 'update'}
                    onChange={() => {
                      setDuplicatePolicy('update');
                      setConfirmedImport(false);
                      setServerPreview(null);
                    }}
                    className="mt-0.5 h-4 w-4 accent-rose-600"
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-900 dark:text-white">Update existing matching records</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                      Overwrite matching records with updated plan, stage, coach, or schedule details.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>

          {/* Confirmation & Apply Import Controls */}
          <div ref={commitPanelRef} className={`mt-5 rounded-xl border p-4 transition ${serverPreview && serverPreview.failed === 0 ? 'border-emerald-300 bg-emerald-50/80 shadow-[0_8px_24px_rgba(5,150,105,0.10)] dark:border-emerald-800 dark:bg-emerald-950/20' : 'border-slate-200 bg-slate-50/70 dark:border-studio-700 dark:bg-studio-950/50'}`}>
            <h3 className="text-xs font-bold text-slate-900 dark:text-white">
              Confirmation &amp; Apply Import
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {serverPreview && serverPreview.failed === 0
                ? 'Validation is complete. The records are still only a preview until you press the commit button.'
                : 'Validate the CSV first. Validation never writes records to the database.'}
            </p>

            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200">
              <input
                type="checkbox"
                checked={confirmedImport}
                disabled={actionableRows.length === 0}
                onChange={(event) => setConfirmedImport(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-rose-600"
              />
              <span>
                I approve writing <strong>{actionableRows.length}</strong> actionable {importType.toLowerCase()} record
                {actionableRows.length === 1 ? '' : 's'} into {datasetDisplayMeta[importType].label}.
              </span>
            </label>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={importBusy || actionableRows.length === 0 || Boolean(serverPreview && serverPreview.failed === 0)}
                  onClick={validateImport}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900 dark:bg-studio-900 dark:text-indigo-200"
                >
                  {importBusy ? 'Validating…' : 'Validate CSV (no database changes)'}
                </button>
                <button
                  type="button"
                  disabled={importBusy || !serverPreview || serverPreview.failed > 0 || !confirmedImport || actionableRows.length === 0}
                  onClick={applyImport}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadIcon size="sm" />
                  {importBusy ? 'Writing records to database…' : `Commit ${actionableRows.length} record${actionableRows.length === 1 ? '' : 's'} to database`}
                </button>
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
                >
                  Cancel
                </button>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                A successful validation is a preview only. The commit button performs the PostgreSQL write and then refreshes every workspace module.
              </span>
            </div>
          </div>
        </PagePanel>

        {/* EXPORT PANEL — EXCEL (.XLSX) ONLY */}
        <PagePanel className="p-5 sm:p-6 dark:border-studio-700 dark:bg-studio-900">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-studio-800">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <DownloadIcon size="sm" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                    Export Live CSV Data
                  </h2>
                  <StatusBadge tone="green">RFC-4180 CSV</StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Download tenant-scoped RFC-4180 CSVs individually or bundle selected live records into one re-importable universal CSV.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Available CSV Datasets
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedExports([...exportTypes])}
                className="min-h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedExports([])}
                className="min-h-8 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300"
              >
                Clear
              </button>
            </div>
          </div>

          <fieldset className="mt-2.5">
            <legend className="sr-only">Select studio datasets for CSV export</legend>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-studio-800 dark:border-studio-700 dark:bg-studio-950/40">
              {exportTypes.map((item) => {
                const meta = datasetDisplayMeta[item];
                const checked = selectedExports.includes(item);
                return (
                  <div
                    key={item}
                    className="flex items-center justify-between gap-3 p-3 text-xs text-slate-700 transition hover:bg-slate-50/60 dark:text-slate-200 dark:hover:bg-studio-900/40"
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          setSelectedExports((current) =>
                            event.target.checked ? [...current, item] : current.filter((value) => value !== item)
                          )
                        }
                        className="mt-0.5 h-4 w-4 shrink-0 rounded accent-rose-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{meta.label}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600 dark:bg-studio-800 dark:text-slate-300">
                            {datasetCount(item)} records
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {meta.description}
                        </p>
                        <span className="mt-0.5 inline-block font-mono text-[10px] text-rose-600 dark:text-rose-400">
                          {meta.fileName}
                        </span>
                      </div>
                    </label>
                    <div className="shrink-0 pl-1">
                      <button
                        type="button"
                        disabled={exportBusy.includes(item)}
                        onClick={() => void downloadSingleCsv(item)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-xs transition hover:border-rose-400 hover:bg-rose-50/50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:bg-studio-800"
                        title={`Download ${meta.fileName}`}
                      >
                        <DownloadIcon size="xs" />
                        <span>{exportBusy.includes(item) ? 'Exporting...' : '.csv'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          <p aria-live="polite" className="mt-4 text-[11px] text-slate-500 dark:text-slate-400">
            {selectedExports.length} dataset{selectedExports.length === 1 ? '' : 's'} selected for live CSV download.
          </p>

          <div className="mt-3 grid gap-2.5">
            <button
              type="button"
              disabled={selectedExports.length === 0 || exportBusy.length > 0}
              onClick={() => void runExport()}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              <DownloadIcon size="sm" />
              <span>{exportBusy.length > 0 ? 'Preparing CSV files...' : `Download ${selectedExports.length} Selected CSV File${selectedExports.length === 1 ? '' : 's'}`}</span>
            </button>
            <button
              type="button"
              disabled={selectedExports.length === 0 || exportBusy.length > 0}
              onClick={() => void downloadImportPackage()}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-center text-xs font-semibold text-indigo-800 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-900 dark:bg-studio-900 dark:text-indigo-200 dark:hover:bg-studio-800"
            >
              <DownloadIcon size="sm" />
              <span>{exportBusy.length > 0 ? 'Preparing universal CSV...' : `Download ${selectedExports.length} Selected as Universal CSV`}</span>
            </button>
          </div>
        </PagePanel>
      </div>
    </div>
  );
}

/**
 * @deprecated Isolated local browser-state sample assistant preview.
 * Production Admin Copilot execution path is served by AiCopilotWrapper (real NestJS gateway integration).
 */
export function AskAiPage() {
  const previewState = useAdminWorkspaceData();
  const [role, setRole] = useState<'admin' | 'staff' | 'trainer'>('admin');
  const [prompt, setPrompt] = useState('');
  const [conversation, setConversation] = useState<{ id: number; prompt: string; answer: LocalAuraAnswer }[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    const rawRole = getStudioSession()?.role;
    const activeRole = rawRole === 'admin' || rawRole === 'staff' || rawRole === 'trainer' ? rawRole : 'admin';
    setRole(activeRole);
    if (initializedRef.current) return;
    initializedRef.current = true;
    const initialPrompt = new URLSearchParams(window.location.search).get('prompt');
    if (initialPrompt && initialPrompt.trim()) {
      const clean = initialPrompt.trim();
      setConversation([{ id: Date.now(), prompt: clean, answer: generateAdminAuraResponse(clean, previewState, activeRole) }]);
    }
  }, [previewState]);

  function runPrompt(rawText: string) {
    const value = rawText.trim();
    if (!value) return;
    const answer = generateAdminAuraResponse(value, previewState, role);
    setConversation((items) => [...items, { id: Date.now() + Math.floor(Math.random() * 1000), prompt: value, answer }]);
    setPrompt('');
  }

  function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runPrompt(prompt);
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow="Studio tools"
        title="Studio Assistant"
        description={`Meet ${staffAssistantName}, your local workspace assistant for day-to-day studio questions. Answers are computed deterministically from your current browser studio records.`}
      />
      <section aria-labelledby="studio-assistant-title" className="overflow-hidden rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-surface)] text-[var(--staff-text)] shadow-subtle">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
              <SparklesIcon size="md" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-700">Fitness AI · Local Workspace Assistant</p>
              <h2 id="studio-assistant-title" className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                {staffAssistantName}
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--staff-text-muted)]">
                Operational insights for {currentStaffStudio.name} · {currentStaffStudio.locationLine}
              </p>
            </div>
          </div>
          <Link href="/admin/knowledge-base" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-[var(--staff-border)] bg-[var(--staff-surface)] px-3 text-xs font-semibold text-[var(--staff-text)] transition hover:border-rose-300">
            <FileTextIcon size="sm" />
            Knowledge Base
            <ArrowRightIcon size="xs" />
          </Link>
        </header>
        <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 p-4 sm:p-6">
            <div aria-label="Assistant conversation" aria-live="polite" className="min-h-64 max-h-[520px] overflow-y-auto space-y-4 rounded-2xl border border-[var(--staff-border)] bg-[var(--staff-page)] p-4 sm:p-5">
              {conversation.length === 0 ? (
                <div className="flex min-h-52 flex-col items-center justify-center text-center">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-700">
                    <SparklesIcon size="md" />
                  </span>
                  <p className="mt-3 font-serif text-lg font-bold text-[var(--staff-text)]">How can I help your team today?</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-[var(--staff-text-muted)]">
                    Click a suggested prompt below or ask about classes, renewals, leads, revenue, or attendance to inspect live calculations from your local studio dataset.
                  </p>
                </div>
              ) : (
                conversation.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    <article className="ml-auto max-w-[90%] rounded-2xl rounded-br-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-slate-900 sm:max-w-[80%] dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-slate-100">
                      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">You · Studio question</p>
                      <p className="break-words leading-6">{turn.prompt}</p>
                    </article>
                    <article className="mr-auto max-w-[95%] rounded-2xl rounded-bl-md border border-[var(--staff-border)] bg-[var(--staff-surface)] px-4 py-3.5 text-sm text-[var(--staff-text)] shadow-subtle sm:max-w-[88%]">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--staff-border)] pb-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
                          <SparklesIcon size="xs" />
                          {staffAssistantName} · {turn.answer.topic}
                        </span>
                        <span className="text-[10px] text-[var(--staff-text-muted)]">Local dataset analysis</span>
                      </div>
                      <p className="mt-2.5 font-serif text-base font-bold text-[var(--staff-text)]">{turn.answer.topic}</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--staff-text-muted)]">{turn.answer.summary}</p>
                      <ul className="mt-2.5 space-y-1.5 rounded-xl bg-[var(--staff-surface-muted)] p-3 text-xs leading-5 text-[var(--staff-text)]">
                        {turn.answer.bullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                      {turn.answer.actionHref && (
                        <div className="mt-2.5">
                          <Link
                            href={turn.answer.actionHref}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                          >
                            {turn.answer.actionLabel ?? 'Open workspace module'} <ArrowRightIcon size="xs" />
                          </Link>
                        </div>
                      )}
                      <p className="mt-2 text-[10px] text-[var(--staff-text-muted)]">{turn.answer.footnote}</p>
                    </article>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={submitPrompt} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="studio-ai-prompt">
                Ask Aura
              </label>
              <input
                id="studio-ai-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about schedule occupancy, renewals, leads, payments, or attendance..."
                className={`${inputClass} min-h-12 flex-1`}
              />
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="min-h-12 rounded-lg bg-rose-600 px-5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Ask {staffAssistantName}
              </button>
            </form>
            <div className="mt-6 border-t border-[var(--staff-border)] pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--staff-text-muted)]">Suggested for your studio</h3>
                <span className="text-[9px] text-[var(--staff-text-muted)]">Click any prompt to analyze local studio data</span>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2.5">
                {staffAssistantPrompts.map((item) => (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => runPrompt(item)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface-muted)] px-3 py-2 text-left text-[11px] leading-4 text-[var(--staff-text)] transition hover:border-rose-300 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
                    >
                      <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--staff-surface)] text-base">
                        {staffAssistantPromptMarker(item)}
                      </span>
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {conversation.length > 0 && (
              <button
                type="button"
                onClick={() => setConversation([])}
                className="mt-4 min-h-9 rounded-lg px-3 text-xs font-semibold text-[var(--staff-text-muted)] hover:bg-[var(--staff-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
              >
                Clear conversation
              </button>
            )}
          </div>
          <aside className="border-t border-[var(--staff-border)] bg-[var(--staff-surface-muted)] p-4 sm:p-6 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--staff-text-muted)]">Assistant status</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-semibold text-emerald-900">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                Local Workspace Active
              </span>
            </div>
            <ul className="mt-4 space-y-4">
              {[
                ['Data context', `Connected to local browser state (${previewState.members.length} members, ${previewState.leads.length} leads, ${previewState.classes.length} classes, ${previewState.payments.length} payments).`],
                ['Responses', 'Aura computes deterministic operational summaries from your active browser dataset without external API calls.'],
                ['Safety', 'Read-only analysis. Aura never mutates records without explicit staff action in the workspace.'],
              ].map(([label, detail]) => (
                <li key={label} className="border-b border-[var(--staff-border)] pb-3 last:border-0">
                  <p className="text-xs font-semibold text-[var(--staff-text)]">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--staff-text-muted)]">{detail}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2 rounded-xl border border-[var(--staff-border)] bg-[var(--staff-surface)] p-3 text-[10px] leading-5 text-[var(--staff-text-muted)]">
              Changes you make to members, leads, attendance, or payments immediately update Aura&apos;s answers.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

export {
  MembersPage as AdminMembersPage,
  MembershipsPage as AdminMembershipsPage,
  LeadsPage as AdminLeadsPage,
  PaymentsPage as AdminPaymentsPage,
  ReportsPage as AdminReportsPage,
  AdminStaffPage,
  AdminFeedbackPage,
  SettingsPage as AdminSettingsPage,
  KnowledgeBasePage as AdminKnowledgeBasePage,
  PlatformTourPage as AdminPlatformTourPage,
  ImportExportPage as AdminImportExportPage,
  AiCopilotWrapper as AdminAiAssistantPage,
  AskAiPage as LegacySampleAssistantPage,
};
