'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircleIcon,
  ClockIcon,
  EditIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PendingInvitationActions, TeamInviteModal } from '@/components/auth/TeamInviteModal';
import { syncTeamInvitationsWithRoster, TEAM_INVITATION_EVENT } from '@/lib/auth/team-invitations';
import { ApiClient } from '@/lib/api-client';
import { formatIndianMobile, isValidIndianMobile } from '@/lib/localization/india';
import { currentStaffStudio } from './AdminDataProvider';
import {
  initialStaffRows,
  type StaffPreviewRecord,
} from './AdminWorkspacePages';

const staffAvatarTones = [
  'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200',
];

const staffInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const staffAvatarTone = (email: string) =>
  staffAvatarTones[
    [...email.toLowerCase()].reduce((sum, character) => sum + character.charCodeAt(0), 0) %
      staffAvatarTones.length
  ];

const panel =
  'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const input =
  'min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100';

const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
) => {
  if (!value) return '';
  const d = new Date(`${value}T12:00:00`);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', options);
};

export type StaffMemberRecord = StaffPreviewRecord & {
  phone?: string;
  responsibilities?: string;
};

export type StaffAttendanceItem = {
  id: string;
  staffEmail: string;
  date: string;
  status: 'Present' | 'Late' | 'Absent';
  shift: string;
  notes?: string;
};


export function AdminStaffPage() {
  const { addToast } = useToast();

  const [staff, setStaff] = useState<StaffPreviewRecord[]>([]);
  const [deletedStaffEmails, setDeletedStaffEmails] = useState<string[]>([]);

  // Attendance Records
  const [attendanceRecords, setAttendanceRecords] = useState<StaffAttendanceItem[]>([]);
  const [attendanceRangeDays, setAttendanceRangeDays] = useState<'14' | '30' | '60'>('30');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All roles');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  // Modals state
  const [selectedStaff, setSelectedStaff] = useState<StaffMemberRecord | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Delete confirmation
  const [staffToDelete, setStaffToDelete] = useState<StaffMemberRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [markingAttendance, setMarkingAttendance] = useState<string | null>(null);

  const markStaffAttendance = async (staffMember: StaffMemberRecord) => {
    setMarkingAttendance(staffMember.email);
    try {
      await ApiClient.createAttendance({
        booking_id: `staff:${staffMember.email}`,
        status: 'Present',
        checked_in_at: new Date().toISOString(),
      });
      addToast({
        type: 'success',
        title: 'Attendance Marked',
        message: `Marked staff ${staffMember.name} as Present for today.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Attendance Failed',
        message: err.message || 'Could not mark staff attendance.',
      });
    } finally {
      setMarkingAttendance(null);
    }
  };

  // Form states
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'Front Desk',
    status: 'Active',
    shift: '09:00 AM – 05:00 PM',
    responsibilities: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const reloadTeamRoster = async () => {
    try {
      setStaff(await syncTeamInvitationsWithRoster(initialStaffRows));
    } catch {
      // Keep the current roster if browser storage is unavailable.
    }
  };

  useEffect(() => {
    void reloadTeamRoster();
    const onInvitationChange = () => { void reloadTeamRoster(); };
    window.addEventListener(TEAM_INVITATION_EVENT, onInvitationChange);
    return () => {
      window.removeEventListener(TEAM_INVITATION_EVENT, onInvitationChange);
    };
  }, []);

  const persistStaff = (updater: (current: StaffPreviewRecord[]) => StaffPreviewRecord[]) => {
    setStaff(updater);
  };

  // Filter out trainers strictly: Keep staff data and trainer data separate!
  const staffMembers = useMemo<StaffMemberRecord[]>(() => {
    const nonTrainers = staff.filter((person) => person.role !== 'Trainer');

    return nonTrainers
      .filter((person) => !deletedStaffEmails.includes(person.email.toLowerCase()))
      .map((person) => {
        const record = person as StaffMemberRecord;
        return {
          ...person,
          phone: record.phone || '',
          responsibilities: record.responsibilities || '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, deletedStaffEmails]);

  // Roles available among staff
  const availableRoles = useMemo(() => {
    return Array.from(new Set(staffMembers.map((s) => s.role))).sort();
  }, [staffMembers]);

  // Filtered staff list
  const visibleStaff = useMemo(() => {
    return staffMembers.filter((person) => {
      if (roleFilter !== 'All roles' && person.role !== roleFilter) {
        return false;
      }
      if (statusFilter !== 'All statuses' && person.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          person.name.toLowerCase().includes(q) ||
          person.email.toLowerCase().includes(q) ||
          person.role.toLowerCase().includes(q) ||
          person.studio.toLowerCase().includes(q) ||
          (person.responsibilities && person.responsibilities.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [staffMembers, roleFilter, statusFilter, searchQuery]);

  // Attendance metrics calculation for selected range (e.g. last 30 days)
  const rangeDaysNumber = Number(attendanceRangeDays);

  const staffAttendanceStats = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - (rangeDaysNumber - 1));
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    return staffMembers.map((person) => {
      const recordsInRange = attendanceRecords.filter(
        (att) => att.staffEmail.toLowerCase() === person.email.toLowerCase() && att.date >= cutoffStr
      );

      const presentOrLate = recordsInRange.filter((r) => r.status === 'Present' || r.status === 'Late');
      const absentCount = recordsInRange.filter((r) => r.status === 'Absent').length;
      const attendedDays = presentOrLate.length;
      const percentage = Math.round((attendedDays / rangeDaysNumber) * 100);

      return {
        person,
        attendedDays,
        absentDays: absentCount,
        percentage,
        records: recordsInRange.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  }, [staffMembers, attendanceRecords, rangeDaysNumber]);

  // Summary card counts
  const totalStaffCount = staffMembers.length;
  const activeStaffCount = staffMembers.filter((s) => s.status === 'Active').length;
  const inactiveStaffCount = staffMembers.filter((s) => s.status !== 'Active').length;
  const overallAttendanceRate = useMemo(() => {
    if (!staffAttendanceStats.length) return 0;
    const totalPct = staffAttendanceStats.reduce((sum, item) => sum + item.percentage, 0);
    return Math.round(totalPct / staffAttendanceStats.length);
  }, [staffAttendanceStats]);

  // Add staff modal controls
  const openAddModal = () => {
    setForm({
      name: '',
      email: '',
      phone: '',
      password: '',
      role: 'Front Desk',
      status: 'Active',
      shift: '09:00 AM – 05:00 PM',
      responsibilities: '',
    });
    setErrors({});
    setIsAddModalOpen(true);
  };

  const closeAddModal = () => {
    if (!savingRef.current) {
      setIsAddModalOpen(false);
      setErrors({});
    }
  };

  // Open View Details Modal
  const openViewDetails = (person: StaffMemberRecord) => {
    setSelectedStaff(person);
    setIsEditMode(false);
    setForm({
      name: person.name,
      email: person.email,
      phone: person.phone || '',
      password: '',
      role: person.role,
      status: person.status,
      shift: person.shift || '09:00 AM – 05:00 PM',
      responsibilities: person.responsibilities || '',
    });
    setErrors({});
  };

  // Save changes from Edit mode inside View Details
  const saveStaffEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStaff || savingRef.current) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const role = form.role;
    const status = form.status;
    const shift = form.shift.trim();
    const responsibilities = form.responsibilities.trim();

    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Enter the staff member’s full name.';
    if (!email) nextErrors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    else if (
      staffMembers.some(
        (person) =>
          person.email.toLowerCase() === email &&
          person.email.toLowerCase() !== selectedStaff.email.toLowerCase()
      )
    ) {
      nextErrors.email = 'A staff record already uses this email.';
    }

    if (phone && !isValidIndianMobile(phone)) {
      nextErrors.phone = 'Enter a valid Indian mobile number or leave empty.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    savingRef.current = true;
    setSaving(true);

    try {
      await ApiClient.updateStaff(selectedStaff.email, {
        name,
        email,
        phone: phone ? formatIndianMobile(phone) : '',
        role,
        status,
        shift: shift || '09:00 AM – 05:00 PM',
        specialization: responsibilities,
      });

      // Update local state to reflect the persisted change
      persistStaff((current) =>
        current.map((s) =>
          s.email.toLowerCase() === selectedStaff.email.toLowerCase()
            ? {
                ...s,
                name,
                email,
                role,
                status,
                studio: s.studio || `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
                shift: shift || '09:00 AM – 05:00 PM',
                phone: phone ? formatIndianMobile(phone) : '',
                responsibilities,
              }
            : s
        )
      );

      addToast({
        type: 'success',
        title: 'Staff details updated',
        message: `${name}'s profile and responsibilities were updated.`,
      });

      setSelectedStaff((prev) => (prev ? { ...prev, name, email, role, status, phone: phone ? formatIndianMobile(phone) : '', responsibilities } : prev));
      setIsEditMode(false);
    } catch (err: any) {
      setErrors({ _form: err.message || 'Failed to update staff details.' });
      addToast({ type: 'error', title: 'Update failed', message: err.message || 'Could not update staff record.' });
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Confirm delete staff
  const confirmDeleteStaff = async () => {
    if (!staffToDelete) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      const emailToDelete = staffToDelete.email.toLowerCase();

      await ApiClient.deleteStaff(emailToDelete);

      const nextDeleted = Array.from(new Set([...deletedStaffEmails, emailToDelete]));
      setDeletedStaffEmails(nextDeleted);

      // Remove from staff list
      persistStaff((current) =>
        current.filter((person) => person.email.toLowerCase() !== emailToDelete)
      );

      addToast({
        type: 'success',
        title: 'Staff member removed',
        message: `${staffToDelete.name} was removed from the active staff directory.`,
      });

      setStaffToDelete(null);
      setSelectedStaff(null);
    } catch {
      setDeleteError('An unexpected error occurred while deleting the staff record.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Add new staff member
  const saveNewStaff = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const password = form.password.trim();
    const role = form.role;
    const status = form.status;
    const shift = form.shift.trim();
    const responsibilities = form.responsibilities.trim();

    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Enter the staff member’s full name.';
    if (!email) nextErrors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    else if (staffMembers.some((p) => p.email.toLowerCase() === email)) {
      nextErrors.email = 'A staff record already uses this email.';
    }

    if (!password) {
      nextErrors.password = 'Set a temporary password.';
    } else if (password.length < 6) {
      nextErrors.password = 'Use a password with at least 6 characters.';
    }

    if (phone && !isValidIndianMobile(phone)) {
      nextErrors.phone = 'Enter a valid Indian mobile number or leave empty.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    savingRef.current = true;
    setSaving(true);

    try {
      await ApiClient.createStaff({
        name,
        email,
        phone: phone ? formatIndianMobile(phone) : '',
        password,
        role: role === 'trainer' ? 'trainer' : role === 'front_desk' ? 'front_desk' : role === 'admin' ? 'admin' : 'front_desk',
        status,
        studio: `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
        shift: shift || '09:00 AM – 05:00 PM',
        specialization: responsibilities,
      });

      const newRecord: StaffMemberRecord = {
        name,
        email,
        role,
        status,
        studio: `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
        shift: shift || '09:00 AM – 05:00 PM',
        phone: phone ? formatIndianMobile(phone) : '',
        responsibilities,
      };

      persistStaff((current) => [...current, newRecord]);

      addToast({
        type: 'success',
        title: 'Staff account created',
        message: `${name} has been added to the studio staff directory.`,
      });

      setIsAddModalOpen(false);
    } catch (err: any) {
      setErrors({ email: err.message || 'Failed to create staff account.' });
      addToast({ type: 'error', title: 'Creation failed', message: err.message || 'Could not create staff account.' });
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      {/* Header */}
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-700">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
            Admin Team Operations · {currentStaffStudio.name}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Staff Directory &amp; Performance
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage front desk and operations team profiles, shift schedules, contact details, and attendance tracking.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsInviteModalOpen(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <PlusIcon size="xs" />
          Invite Team Member
        </button>
      </header>

      {/* Useful Summary Cards */}
      <section aria-label="Staff overview metrics" className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
            <UsersIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Total Staff
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {totalStaffCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Operations &amp; front desk</p>
          </div>
        </div>

        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircleIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Active Staff
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {activeStaffCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Active shift status</p>
          </div>
        </div>

        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <ClockIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Inactive Staff
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {inactiveStaffCount}
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Off-duty or preview</p>
          </div>
        </div>

        <div className={`${panel} flex items-start gap-3 p-4`}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
            <ShieldIcon size="sm" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">
              Attendance (Last 30 Days)
            </p>
            <p className="mt-1 font-serif text-2xl font-bold leading-none tabular-nums text-slate-950 dark:text-white">
              {overallAttendanceRate}%
            </p>
            <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">Average team attendance</p>
          </div>
        </div>
      </section>

      {/* Staff Attendance Tracking Section */}
      <section className={`${panel} mb-6 overflow-hidden`}>
        <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                Staff Shift Performance
              </p>
              <h2 className="mt-0.5 font-serif text-xl font-bold text-slate-950 dark:text-white">
                Staff Attendance — Last {attendanceRangeDays} Days
              </h2>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Period:
              <select
                value={attendanceRangeDays}
                onChange={(e) => setAttendanceRangeDays(e.target.value as typeof attendanceRangeDays)}
                className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
              >
                <option value="14">Last 14 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="60">Last 60 Days</option>
              </select>
            </label>
          </div>
        </div>

        <div className="divide-y divide-slate-100 p-4 dark:divide-studio-800 sm:p-5">
          <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Staff Member &amp; Role</span>
            <span>Attended / Total Days &amp; Absence</span>
          </div>

          {staffAttendanceStats.map(({ person, attendedDays, absentDays, percentage }) => (
            <div
              key={person.email}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 sm:w-1/3">
                <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                  {person.name}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {person.role} · {person.shift || '09:00 AM – 05:00 PM'}
                </p>
              </div>

              <div className="min-w-0 flex-1 sm:px-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {attendedDays} of {attendanceRangeDays} days attended
                  </span>
                  <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                    {percentage}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-studio-800">
                  <div
                    className="h-full rounded-full bg-rose-600 transition-all"
                    style={{ width: `${Math.min(100, Math.max(percentage, 2))}%` }}
                  />
                </div>
              </div>

              <div className="shrink-0 text-left sm:w-44 sm:text-right">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Days absent:{' '}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {absentDays} day{absentDays === 1 ? '' : 's'}
                  </strong>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-studio-800 dark:bg-studio-950/40">
          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            <strong>Attendance tracking note:</strong> Shift check-ins and absences are recorded independently for operational and front-desk staff. Trainer session attendance is managed separately in the Trainers workspace.
          </p>
        </div>
      </section>

      {/* Staff Directory Section */}
      <section className={`${panel} overflow-hidden`}>
        <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                Staff Directory
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {visibleStaff.length} of {totalStaffCount} staff record{totalStaffCount === 1 ? '' : 's'} · Excludes trainers
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1">
                <span className="sr-only">Search staff</span>
                <SearchIcon
                  size="sm"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, email, role…"
                  className={`${input} w-full pl-9`}
                />
              </label>

              <select
                aria-label="Filter role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={input}
              >
                <option value="All roles">All Roles</option>
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={input}
              >
                <option value="All statuses">All Statuses</option>
                <option value="Active">Active</option>
                <option value="Pending Setup">Pending Setup</option>
                <option value="Inactive">Inactive</option>
                <option value="Preview profile">Preview profile</option>
              </select>

              <div
                role="group"
                aria-label="Staff directory view"
                className="flex rounded-lg border border-slate-200 p-1 dark:border-studio-700"
              >
                <button
                  type="button"
                  aria-pressed={view === 'cards'}
                  aria-label="Card view"
                  onClick={() => setView('cards')}
                  className={`flex min-h-8 min-w-8 items-center justify-center rounded-md ${
                    view === 'cards'
                      ? 'bg-rose-700 text-white'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'
                  }`}
                >
                  <GridIcon size="sm" />
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'table'}
                  aria-label="Table view"
                  onClick={() => setView('table')}
                  className={`flex min-h-8 min-w-8 items-center justify-center rounded-md ${
                    view === 'table'
                      ? 'bg-rose-700 text-white'
                      : 'text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'
                  }`}
                >
                  <ListIcon size="sm" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Directory Content */}
        {visibleStaff.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-studio-800 dark:text-slate-300">
              <UsersIcon size="md" />
            </span>
            <h3 className="mt-4 font-serif text-lg font-bold text-slate-900 dark:text-white">
              No staff members match
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search criteria or resetting filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setRoleFilter('All roles');
                setStatusFilter('All statuses');
                setSearchQuery('');
              }}
              className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Reset filters
            </button>
          </div>
        ) : view === 'cards' ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {visibleStaff.map((person) => {
              const stat = staffAttendanceStats.find(
                (s) => s.person.email.toLowerCase() === person.email.toLowerCase()
              );

              return (
                <article
                  key={person.email}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md dark:border-studio-700 dark:bg-studio-950/40 dark:hover:border-rose-900/70"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${staffAvatarTone(
                          person.email
                        )}`}
                      >
                        {staffInitials(person.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-serif text-base font-bold text-slate-950 dark:text-white">
                          {person.name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {person.email}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                            {person.role}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              person.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                            }`}
                          >
                            {person.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-studio-800">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Assigned Responsibilities
                        </p>
                        <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-200">
                          {person.responsibilities || 'Front desk management and member assistance'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Contact Phone
                          </p>
                          <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                            {person.phone || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            30d Attendance
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white">
                            {stat ? `${stat.attendedDays} / ${attendanceRangeDays} days` : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Shift &amp; Studio
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {person.studio} · {person.shift || '09:00 AM – 05:00 PM'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Mark Attendance & View Details */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
                    {person.status === 'Pending Setup' && <PendingInvitationActions email={person.email} onChanged={reloadTeamRoster} />}
                    <button
                      type="button"
                      onClick={() => markStaffAttendance(person)}
                      disabled={markingAttendance === person.email}
                      className="min-h-9 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                    >
                      {markingAttendance === person.email ? 'Marking…' : 'Mark Attendance'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openViewDetails(person)}
                      className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200 dark:hover:border-rose-700"
                    >
                      View Details
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Staff Member</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Responsibilities</th>
                  <th className="px-3 py-3">30d Attendance</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                {visibleStaff.map((person) => {
                  const stat = staffAttendanceStats.find(
                    (s) => s.person.email.toLowerCase() === person.email.toLowerCase()
                  );
                  return (
                    <tr key={person.email} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${staffAvatarTone(
                              person.email
                            )}`}
                          >
                            {staffInitials(person.name)}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{person.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{person.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs font-medium text-slate-700 dark:text-slate-200">
                        {person.role}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            person.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          }`}
                        >
                          {person.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {person.responsibilities || 'Front desk & operations'}
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                        {stat ? `${stat.attendedDays} / ${attendanceRangeDays} days` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {person.status === 'Pending Setup' && <PendingInvitationActions email={person.email} onChanged={reloadTeamRoster} />}
                          <button
                            type="button"
                            onClick={() => markStaffAttendance(person)}
                            disabled={markingAttendance === person.email}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                          >
                            {markingAttendance === person.email ? 'Marking…' : 'Mark Attendance'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openViewDetails(person)}
                            className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300"
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* View Details Modal with Edit Mode, Individual Attendance History & Delete Option */}
      <Modal
        isOpen={selectedStaff !== null}
        onClose={() => {
          setSelectedStaff(null);
          setIsEditMode(false);
        }}
        title={selectedStaff ? `${selectedStaff.name} · Staff Details` : 'Staff Details'}
        description="View staff profile, responsibilities, individual attendance history, and account options"
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {selectedStaff && (
              <button
                type="button"
                onClick={() => setStaffToDelete(selectedStaff)}
                className="min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              >
                Delete Staff Member
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedStaff(null);
                  setIsEditMode(false);
                }}
                className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
              >
                Close
              </button>
              {isEditMode ? (
                <button
                  type="submit"
                  form="staff-edit-form"
                  disabled={saving}
                  className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800"
                >
                  Edit Profile
                </button>
              )}
            </div>
          </div>
        }
      >
        {selectedStaff && (() => {
          const stat = staffAttendanceStats.find(
            (s) => s.person.email.toLowerCase() === selectedStaff.email.toLowerCase()
          );

          return isEditMode ? (
            <form id="staff-edit-form" onSubmit={saveStaffEdit} className="space-y-4">
              <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Full Name *
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className={input}
                />
                {errors.name && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.name}</p>}
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Email Address *
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                    className={input}
                  />
                  {errors.email && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.email}</p>}
                </label>

                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Phone Number
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                    className={input}
                  />
                  {errors.phone && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.phone}</p>}
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Role
                  <select
                    value={form.role}
                    onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                    className={input}
                  >
                    <option value="Front Desk">Front Desk</option>
                    <option value="Manager">Manager</option>
                    <option value="Operations">Operations</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                    className={input}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Preview profile">Preview profile</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Shift Schedule
                  <input
                    value={form.shift}
                    onChange={(e) => setForm((prev) => ({ ...prev, shift: e.target.value }))}
                    placeholder="10:00 AM – 06:00 PM"
                    className={input}
                  />
                </label>
              </div>

              <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Assigned Responsibilities
                <textarea
                  rows={2}
                  value={form.responsibilities}
                  onChange={(e) => setForm((prev) => ({ ...prev, responsibilities: e.target.value }))}
                  placeholder="Key duties, tasks, and areas of ownership..."
                  className={`${input} resize-y py-2 font-normal`}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditMode(false)}
                  className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300"
                >
                  Cancel Edit
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Profile Card */}
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${staffAvatarTone(
                    selectedStaff.email
                  )}`}
                >
                  {staffInitials(selectedStaff.name)}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                      {selectedStaff.name}
                    </h3>
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                      {selectedStaff.role}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selectedStaff.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      }`}
                    >
                      {selectedStaff.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedStaff.studio} · {selectedStaff.shift || '09:00 AM – 05:00 PM'}
                  </p>
                </div>
              </div>

              {/* Details List */}
              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedStaff.email}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {selectedStaff.phone || 'Not recorded'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Assigned Responsibilities</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                    {selectedStaff.responsibilities || 'Front desk reception, visitor check-in, keycards & enquiries'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance Summary (Last {attendanceRangeDays} Days)</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                    {stat ? `${stat.attendedDays} of ${attendanceRangeDays} days attended (${stat.percentage}%) · ${stat.absentDays} days absent` : 'No attendance data'}
                  </dd>
                </div>
              </dl>

              {/* Individual Attendance History Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                  Individual Attendance History (Recent Shifts)
                </h4>
                <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-studio-700">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-2 py-2">Shift</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-3 py-2">Log Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                      {stat?.records && stat.records.length > 0 ? (
                        stat.records.slice(0, 15).map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-studio-800/40">
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900 dark:text-white">
                              {dateLabel(rec.date)}
                            </td>
                            <td className="px-2 py-2 text-slate-600 dark:text-slate-300">
                              {rec.shift}
                            </td>
                            <td className="px-2 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                                  rec.status === 'Present'
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                    : rec.status === 'Late'
                                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                                }`}
                              >
                                {rec.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                              {rec.notes || '—'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-500">
                            No shift attendance logs recorded for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Delete Staff Confirmation Modal */}
      <Modal
        isOpen={staffToDelete !== null}
        onClose={() => {
          if (!isDeleting) setStaffToDelete(null);
        }}
        title="Delete Staff Record"
        description="Confirm staff member removal"
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setStaffToDelete(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDeleteStaff}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        {staffToDelete && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete <strong>{staffToDelete.name}</strong> ({staffToDelete.role})?
            </p>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              This will remove their profile from the active staff directory and workspace performance metrics. Historical shift logs will be archived. Permanent database deletion requires backend API integration.
            </p>
            {deleteError && (
              <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Add Staff Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={closeAddModal}
        title="Add Staff Member"
        description="Create a new front desk or operations staff profile"
        size="md"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={closeAddModal}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="add-staff-form"
              disabled={saving}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Staff Member'}
            </button>
          </>
        }
      >
        <form id="add-staff-form" onSubmit={saveNewStaff} className="space-y-3.5">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Full Name *
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Ramesh Kumar"
              className={input}
            />
            {errors.name && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.name}</p>}
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Email Address *
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="ramesh@example.com"
                className={input}
              />
              {errors.email && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.email}</p>}
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Phone Number
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+91 98000 00000"
                className={input}
              />
              {errors.phone && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.phone}</p>}
            </label>
          </div>

          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Temporary Password *
            <input
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              placeholder="At least 6 characters"
              className={input}
            />
            {errors.password && <p className="text-xs text-rose-700 dark:text-rose-300">{errors.password}</p>}
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Role
              <select
                value={form.role}
                onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))}
                className={input}
              >
                <option value="Front Desk">Front Desk</option>
                <option value="Manager">Manager</option>
                <option value="Operations">Operations</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Status
              <select
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                className={input}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Preview profile">Preview profile</option>
              </select>
            </label>

            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Shift Schedule
              <input
                value={form.shift}
                onChange={(e) => setForm((prev) => ({ ...prev, shift: e.target.value }))}
                placeholder="09:00 AM – 05:00 PM"
                className={input}
              />
            </label>
          </div>

          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Assigned Responsibilities
            <textarea
              rows={2}
              value={form.responsibilities}
              onChange={(e) => setForm((prev) => ({ ...prev, responsibilities: e.target.value }))}
              placeholder="e.g. Front desk reception, locker assignments, member enquiries..."
              className={`${input} resize-y py-2 font-normal`}
            />
          </label>

          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            Staff profiles and credentials persist in this browser workspace. Trainers are managed separately on the Trainers page.
          </p>
        </form>
      </Modal>
      <TeamInviteModal open={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} defaultRole="front_desk" studioName={currentStaffStudio.name} onInvited={reloadTeamRoster} />
    </div>
  );
}
