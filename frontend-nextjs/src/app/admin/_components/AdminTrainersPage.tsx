'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  EditIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PendingInvitationActions, TeamInviteModal } from '@/components/auth/TeamInviteModal';
import { ApiClient } from '@/lib/api-client';
import { syncTeamInvitationsWithRoster, TEAM_INVITATION_EVENT } from '@/lib/auth/team-invitations';
import { isValidIndianMobile } from '@/lib/localization/india';
import {
  currentStaffStudio,
  useAdminWorkspaceData,
  type StaffStudioClass,
} from './AdminDataProvider';
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
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }
) => new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', options);


export type TrainerRecord = StaffPreviewRecord & {
  phone?: string;
  specialization?: string;
};

const getRolling30DayRange = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    start,
    end,
    startDateStr: toDateStr(start),
    endDateStr: toDateStr(end),
  };
};

export function AdminTrainersPage() {
  const { classes, setClasses, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();

  const [staff, setStaff] = useState<StaffPreviewRecord[]>([]);
  const [deletedTrainerEmails, setDeletedTrainerEmails] = useState<string[]>([]);

  const [trainerScope, setTrainerScope] = useState('All trainers');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All statuses');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  // Modals state
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerRecord | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<TrainerRecord | null>(null);

  // Delete confirmation state
  const [trainerToDelete, setTrainerToDelete] = useState<TrainerRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [markingAttendance, setMarkingAttendance] = useState<string | null>(null);

  const markTrainerAttendance = async (trainer: TrainerRecord) => {
    setMarkingAttendance(trainer.email);
    try {
      await ApiClient.createAttendance({
        booking_id: `trainer:${trainer.email}`,
        status: 'Present',
        checked_in_at: new Date().toISOString(),
      });
      addToast({
        type: 'success',
        title: 'Attendance Marked',
        message: `Marked trainer ${trainer.name} as Present for today.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Attendance Failed',
        message: err.message || 'Could not mark trainer attendance.',
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
    specialization: '',
    shift: '08:00 AM – 02:00 PM',
    status: 'Active',
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

  const trainers = useMemo<TrainerRecord[]>(() => {
    const staffTrainers = staff.filter((person) => person.role === 'Trainer');
    const result: TrainerRecord[] = staffTrainers.map((t) => {
      const record = t as TrainerRecord;
      return {
        ...t,
        phone: record.phone || '',
        specialization: record.specialization || '',
      };
    });

    // Filter out deleted trainers and sort by name
    return result
      .filter((t) => !deletedTrainerEmails.includes(t.email.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, deletedTrainerEmails]);

  const allTrainerNames = useMemo(
    () => trainers.map((t) => t.name).sort(),
    [trainers]
  );

  const visibleTrainers = useMemo(() => {
    return trainers.filter((trainer) => {
      if (trainerScope !== 'All trainers' && trainer.name !== trainerScope) {
        return false;
      }
      if (statusFilter !== 'All statuses' && trainer.status !== statusFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matches =
          trainer.name.toLowerCase().includes(query) ||
          trainer.email.toLowerCase().includes(query) ||
          (trainer.phone && trainer.phone.toLowerCase().includes(query)) ||
          (trainer.specialization && trainer.specialization.toLowerCase().includes(query)) ||
          trainer.studio.toLowerCase().includes(query);
        if (!matches) return false;
      }
      return true;
    });
  }, [trainers, trainerScope, statusFilter, searchQuery]);

  // Rolling 30-day attendance calculations
  const { startDateStr, endDateStr } = useMemo(() => getRolling30DayRange(), []);

  const trainerAttendanceStats = useMemo(() => {
    return trainers.map((trainer) => {
      // Find all scheduled/completed classes assigned to this trainer in rolling 30 days
      const trainerClassesInRange = classes.filter(
        (c) =>
          c.trainer.toLowerCase() === trainer.name.toLowerCase() &&
          c.date >= startDateStr &&
          c.date <= endDateStr
      );

      const hasRecords = trainerClassesInRange.length > 0;
      // Attended days are distinct calendar dates where class is not cancelled
      const activeClasses = trainerClassesInRange.filter((c) => c.status !== 'Cancelled');
      const distinctAttendedDates = Array.from(new Set(activeClasses.map((c) => c.date)));
      const attendedDays = distinctAttendedDates.length;
      const percentage = hasRecords ? Math.round((attendedDays / 30) * 100) : null;

      return {
        trainer,
        hasRecords,
        attendedDays,
        percentage,
        distinctDates: distinctAttendedDates,
      };
    });
  }, [trainers, classes, startDateStr, endDateStr]);

  const trainersWithRecords = useMemo(
    () => trainerAttendanceStats.filter((item) => item.hasRecords).length,
    [trainerAttendanceStats]
  );

  const overallAttendanceRate = useMemo(() => {
    const recorded = trainerAttendanceStats.filter((item) => item.percentage !== null);
    if (!recorded.length) return null;
    const totalPct = recorded.reduce((sum, item) => sum + (item.percentage || 0), 0);
    return Math.round(totalPct / recorded.length);
  }, [trainerAttendanceStats]);

  const getTrainerClasses = (trainerName: string): StaffStudioClass[] => {
    return classes.filter(
      (item) => item.trainer.toLowerCase() === trainerName.toLowerCase()
    );
  };

  const openAddModal = () => {
    setEditingTrainer(null);
    setForm({
      name: '',
      email: '',
      phone: '',
      password: '',
      specialization: '',
      shift: '08:00 AM – 02:00 PM',
      status: 'Active',
    });
    setErrors({});
    setIsAddModalOpen(true);
  };

  const openEditModal = (trainer: TrainerRecord) => {
    setSelectedTrainer(null);
    setEditingTrainer(trainer);
    setForm({
      name: trainer.name,
      email: trainer.email,
      phone: trainer.phone || '',
      password: '',
      specialization: trainer.specialization || '',
      shift: trainer.shift || '08:00 AM – 02:00 PM',
      status: trainer.status,
    });
    setErrors({});
    setIsAddModalOpen(true);
  };

  const closeForm = () => {
    if (!savingRef.current) {
      setIsAddModalOpen(false);
      setEditingTrainer(null);
      setErrors({});
    }
  };

  const confirmDeleteTrainer = async () => {
    if (!trainerToDelete) return;
    setIsDeleting(true);
    setDeleteError('');

    try {
      const emailToDelete = trainerToDelete.email.toLowerCase();
      const nameToDelete = trainerToDelete.name.toLowerCase();

      await ApiClient.deleteStaff(emailToDelete);

      const nextDeleted = Array.from(new Set([...deletedTrainerEmails, emailToDelete]));
      setDeletedTrainerEmails(nextDeleted);
      persistStaff((current) =>
        current.filter(
          (person) =>
            person.email.toLowerCase() !== emailToDelete &&
            person.name.toLowerCase() !== nameToDelete
        )
      );

      addToast({
        type: 'success',
        title: 'Trainer deleted',
        message: `${trainerToDelete.name} was removed from the active trainer directory.`,
      });

      setTrainerToDelete(null);
      setSelectedTrainer(null);
    } catch {
      setDeleteError('An unexpected error occurred while deleting the trainer.');
    } finally {
      setIsDeleting(false);
    }
  };

  const saveTrainer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current) return;

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const phone = form.phone.trim();
    const specialization = form.specialization.trim();
    const shift = form.shift.trim();
    const status = form.status;

    const nextErrors: Record<string, string> = {};
    if (!name) nextErrors.name = 'Enter the trainer’s full name.';
    if (!email) nextErrors.email = 'Enter an email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = 'Enter a valid email address.';
    else if (
      trainers.some(
        (person) =>
          person.email.toLowerCase() === email &&
          person.email.toLowerCase() !== editingTrainer?.email.toLowerCase()
      )
    ) {
      nextErrors.email = 'A trainer record already uses this email.';
    }

    if (!editingTrainer) {
      if (!form.password.trim()) {
        nextErrors.password = 'Set a temporary demo password.';
      } else if (form.password.trim().length < 6) {
        nextErrors.password = 'Use a password with at least 6 characters.';
      }
    }

    if (phone && !isValidIndianMobile(phone)) {
      nextErrors.phone = 'Enter a valid Indian mobile number or leave empty.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    savingRef.current = true;
    setSaving(true);

    try {
      if (editingTrainer) {
        await ApiClient.updateStaff(editingTrainer.email, {
          name,
          email,
          phone,
          role: 'trainer',
          status,
          shift: shift || editingTrainer.shift || '08:00 AM – 02:00 PM',
          specialization,
        });

        // Update local state to reflect the persisted change
        persistStaff((current) => {
          const found = current.some((s) => s.email.toLowerCase() === editingTrainer.email.toLowerCase());
          if (found) {
            return current.map((s) =>
              s.email.toLowerCase() === editingTrainer.email.toLowerCase()
                ? {
                    ...s,
                    name,
                    email,
                    role: 'Trainer',
                    status,
                    studio: s.studio || `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
                    shift: shift || editingTrainer.shift || '08:00 AM – 02:00 PM',
                    phone,
                    specialization,
                  }
                : s
            );
          }
          return [...current, {
            name,
            email,
            role: 'Trainer',
            status,
            studio: `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
            shift: shift || editingTrainer.shift || '08:00 AM – 02:00 PM',
            phone,
            specialization,
          }];
        });

        // Update linked classes if name changed
        if (editingTrainer.name !== name) {
          setClasses((currentClasses) =>
            currentClasses.map((item) =>
              item.trainer.toLowerCase() === editingTrainer.name.toLowerCase()
                ? { ...item, trainer: name }
                : item
            )
          );
        }

        addToast({
          type: 'success',
          title: 'Trainer profile updated',
          message: `${name}'s details have been updated.`,
        });
      } else {
        await ApiClient.createStaff({
          name,
          email,
          phone,
          password: form.password,
          role: 'trainer',
          status,
          studio: `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
          shift: shift || '08:00 AM – 02:00 PM',
          specialization,
        });

        const newRecord = {
          name,
          email,
          role: 'Trainer',
          status,
          studio: `${currentStaffStudio.name.replace(' Studio', '')} · ${currentStaffStudio.branch}`,
          shift: shift || '08:00 AM – 02:00 PM',
          phone,
          specialization,
        };

        persistStaff((current) => [...current, newRecord]);

        if (deletedTrainerEmails.includes(email)) {
          const nextDeleted = deletedTrainerEmails.filter((e) => e !== email);
          setDeletedTrainerEmails(nextDeleted);
        }

        addToast({
          type: 'success',
          title: 'Trainer account created',
          message: `${name} has been added as a studio trainer.`,
        });
      }

      setIsAddModalOpen(false);
      setEditingTrainer(null);
    } catch (err: any) {
      setErrors({ email: err.message || 'Failed to save trainer.' });
      addToast({ type: 'error', title: 'Save failed', message: err.message || 'Could not save trainer record.' });
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-700">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">
            Admin Trainer Oversight · {currentStaffStudio.name}
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Trainers
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Manage trainer profiles, contact details, and specializations.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Trainer filter
            <select
              aria-label="Filter by assigned trainer"
              value={trainerScope}
              onChange={(event) => setTrainerScope(event.target.value)}
              className={input}
            >
              <option value="All trainers">All studio trainers</option>
              {allTrainerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 text-xs font-bold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            <PlusIcon size="xs" />
            Invite Team Member
          </button>
        </div>
      </header>

      {/* 1. Overall Trainer Attendance Summary — Last 30 Days */}
      <section className={`${panel} mb-6 overflow-hidden`}>
        <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700 dark:text-rose-300">
                Attendance Oversight
              </p>
              <h2 className="mt-0.5 font-serif text-xl font-bold text-slate-950 dark:text-white">
                Trainer Attendance — Last 30 Days
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Rolling 30 days: {dateLabel(startDateStr)} – {dateLabel(endDateStr)}
            </p>
          </div>

          {/* Overall Metrics Cards */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-studio-800 dark:bg-studio-950/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total Trainers
              </p>
              <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {trainers.length}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                In current workspace
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-studio-800 dark:bg-studio-950/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                With Recorded Attendance
              </p>
              <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {trainersWithRecords} <span className="text-sm font-normal text-slate-500">/ {trainers.length}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                Conducted sessions in last 30d
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 dark:border-studio-800 dark:bg-studio-950/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Overall Attendance Rate
              </p>
              <p className="mt-1 font-serif text-2xl font-bold tabular-nums text-slate-950 dark:text-white">
                {overallAttendanceRate !== null ? `${overallAttendanceRate}%` : '—'}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                {trainersWithRecords > 0 ? 'Average across trainers with data' : 'No records in 30-day window'}
              </p>
            </div>
          </div>
        </div>

        {/* Individual Trainer Progress & Attendance Breakdown */}
        <div className="divide-y divide-slate-100 p-4 dark:divide-studio-800 sm:p-5">
          <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <span>Trainer &amp; 30-Day Attendance</span>
            <span>Rate &amp; Absent Days</span>
          </div>

          {trainerAttendanceStats.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No trainers available in the workspace.
            </p>
          ) : (
            trainerAttendanceStats.map(({ trainer, hasRecords, attendedDays, percentage }) => (
              <div
                key={trainer.email}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 sm:w-1/3">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {trainer.name}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    {trainer.specialization || 'General Studio Coaching'}
                  </p>
                </div>

                <div className="min-w-0 flex-1 sm:px-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {hasRecords ? `${attendedDays} / 30 days` : 'No attendance data available'}
                    </span>
                    <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                      {hasRecords && percentage !== null ? `${percentage}%` : '—'}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-studio-800">
                    {hasRecords && percentage !== null ? (
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, Math.max(percentage, 2))}%` }}
                      />
                    ) : (
                      <div className="h-full w-full bg-slate-200/50 dark:bg-studio-800/50" />
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-left sm:w-44 sm:text-right">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Days absent: <strong className="font-medium text-slate-700 dark:text-slate-300">Not recorded</strong>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-studio-800 dark:bg-studio-950/40">
          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            <strong>Data source &amp; calculation notice:</strong> Attendance is measured by distinct calendar days on which a trainer has scheduled or completed sessions within the rolling 30-day window ({dateLabel(startDateStr)} – {dateLabel(endDateStr)}). Unscheduled days are not assumed to be absences because trainer leave/absence logs are not maintained in the current workspace.
          </p>
        </div>
      </section>

      {/* 2. Trainer Directory */}
      <section className={`${panel} overflow-hidden`}>
        <div className="border-b border-slate-100 p-4 dark:border-studio-800 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">
                Trainer Directory
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {visibleTrainers.length} of {trainers.length} trainer profile{trainers.length === 1 ? '' : 's'} recorded.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[200px] flex-1">
                <span className="sr-only">Search trainers</span>
                <SearchIcon
                  size="sm"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, email, specialization…"
                  className={`${input} w-full pl-9`}
                />
              </label>
              <select
                aria-label="Filter status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={input}
              >
                <option value="All statuses">All statuses</option>
                <option value="Active">Active</option>
                <option value="Pending Setup">Pending Setup</option>
                <option value="Inactive">Inactive</option>
                <option value="Preview profile">Preview profile</option>
              </select>
              <div
                role="group"
                aria-label="Trainer directory view"
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

        {visibleTrainers.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-studio-800 dark:text-slate-300">
              <UsersIcon size="md" />
            </span>
            <h3 className="mt-4 font-serif text-lg font-bold text-slate-900 dark:text-white">
              No trainers match
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try adjusting your search or clear the selected trainer filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setTrainerScope('All trainers');
                setStatusFilter('All statuses');
                setSearchQuery('');
              }}
              className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Clear filters
            </button>
          </div>
        ) : view === 'cards' ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {visibleTrainers.map((trainer) => {
              const assignedClasses = getTrainerClasses(trainer.name);
              const assignedCategories = Array.from(
                new Set(assignedClasses.map((c) => c.category).filter(Boolean))
              );
              const displaySpecialization =
                trainer.specialization ||
                (assignedCategories.length
                  ? `${assignedCategories.join(', ')} Specialist`
                  : 'General Studio Coaching');

              return (
                <article
                  key={trainer.email}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-subtle transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md dark:border-studio-700 dark:bg-studio-950/40 dark:hover:border-rose-900/70"
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold ${staffAvatarTone(
                          trainer.email
                        )}`}
                      >
                        {staffInitials(trainer.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-serif text-base font-bold text-slate-950 dark:text-white">
                          {trainer.name}
                        </h3>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          {trainer.email}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                            Trainer
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              trainer.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                            }`}
                          >
                            {trainer.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs dark:border-studio-800">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Specialization &amp; Expertise
                        </p>
                        <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
                          {displaySpecialization}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Contact Phone
                          </p>
                          <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                            {trainer.phone || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Linked Sessions
                          </p>
                          <p className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white">
                            {assignedClasses.length} class{assignedClasses.length === 1 ? '' : 'es'}
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Schedule &amp; Studio
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                          {trainer.studio} · {trainer.shift || 'Schedule not recorded'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
                    {trainer.status === 'Pending Setup' && <PendingInvitationActions email={trainer.email} onChanged={reloadTeamRoster} />}
                    <button
                      type="button"
                      onClick={() => markTrainerAttendance(trainer)}
                      disabled={markingAttendance === trainer.email}
                      className="min-h-9 flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                    >
                      {markingAttendance === trainer.email ? 'Marking…' : 'Mark Attendance'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedTrainer(trainer)}
                      className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(trainer)}
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:bg-rose-950/40 dark:text-rose-200"
                    >
                      <EditIcon size="xs" />
                      Edit
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
                  <th className="px-4 py-3">Trainer</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3">Specialization</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Assigned Classes</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                {visibleTrainers.map((trainer) => {
                  const assignedClasses = getTrainerClasses(trainer.name);
                  return (
                    <tr key={trainer.email} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${staffAvatarTone(
                              trainer.email
                            )}`}
                          >
                            {staffInitials(trainer.name)}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900 dark:text-white">{trainer.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400">{trainer.studio}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                        <p>{trainer.email}</p>
                        <p className="text-[10px] text-slate-400">{trainer.phone || 'No phone'}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-200">
                        {trainer.specialization || 'General Studio Coaching'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                            trainer.status === 'Active'
                              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          }`}
                        >
                          {trainer.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                        {assignedClasses.length} session{assignedClasses.length === 1 ? '' : 's'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          {trainer.status === 'Pending Setup' && <PendingInvitationActions email={trainer.email} onChanged={reloadTeamRoster} />}
                          <button
                            type="button"
                            onClick={() => markTrainerAttendance(trainer)}
                            disabled={markingAttendance === trainer.email}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300 disabled:opacity-50"
                          >
                            {markingAttendance === trainer.email ? 'Marking…' : 'Mark Attendance'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedTrainer(trainer)}
                            className="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300"
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(trainer)}
                            className="text-xs font-semibold text-slate-600 hover:underline dark:text-slate-300"
                          >
                            Edit
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

      {/* View Profile / Details Modal with Delete Option */}
      <Modal
        isOpen={selectedTrainer !== null}
        onClose={() => setSelectedTrainer(null)}
        title={selectedTrainer ? `${selectedTrainer.name} · Trainer Profile` : 'Trainer Profile'}
        description="Trainer contact details, specialization, and assigned classes"
        size="md"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            {selectedTrainer && (
              <button
                type="button"
                onClick={() => setTrainerToDelete(selectedTrainer)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
              >
                Delete Trainer
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedTrainer(null)}
                className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
              >
                Close
              </button>
              {selectedTrainer && (
                <button
                  type="button"
                  onClick={() => openEditModal(selectedTrainer)}
                  className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800"
                >
                  Edit profile
                </button>
              )}
            </div>
          </div>
        }
      >
        {selectedTrainer && (() => {
          const assignedClasses = getTrainerClasses(selectedTrainer.name);
          const stats = trainerAttendanceStats.find(
            (s) => s.trainer.email.toLowerCase() === selectedTrainer.email.toLowerCase()
          );

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${staffAvatarTone(
                    selectedTrainer.email
                  )}`}
                >
                  {staffInitials(selectedTrainer.name)}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-bold text-slate-950 dark:text-white">
                      {selectedTrainer.name}
                    </h3>
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
                      Trainer
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        selectedTrainer.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                      }`}
                    >
                      {selectedTrainer.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {selectedTrainer.studio} · {selectedTrainer.shift || 'Flexible schedule'}
                  </p>
                </div>
              </div>

              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2 dark:border-studio-700 dark:bg-studio-950">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">{selectedTrainer.email}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Number</dt>
                  <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                    {selectedTrainer.phone || 'Not recorded'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Specialization &amp; Expertise</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                    {selectedTrainer.specialization || 'General Studio Coaching'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Attendance (Last 30 Days)</dt>
                  <dd className="mt-1 font-medium text-slate-800 dark:text-slate-200">
                    {stats?.hasRecords
                      ? `${stats.attendedDays} / 30 days (${stats.percentage}%)`
                      : 'No attendance data available'}
                  </dd>
                </div>
              </dl>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Assigned Class Sessions ({assignedClasses.length})
                  </h4>
                  <Link
                    href="/admin/classes"
                    className="text-[11px] font-semibold text-rose-700 hover:underline dark:text-rose-300"
                  >
                    Open Class Schedule →
                  </Link>
                </div>
                {assignedClasses.length ? (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-studio-800 dark:border-studio-700">
                    {assignedClasses.map((session) => (
                      <li
                        key={session.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {session.name}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-500 dark:text-slate-400">
                            {session.category} · {session.room} · {session.date} ({session.startTime}–{session.endTime})
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            session.status === 'Cancelled'
                              ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                              : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                          }`}
                        >
                          {session.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">
                    No class sessions are currently assigned to this trainer in the schedule.
                  </p>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Delete Trainer Confirmation Modal */}
      <Modal
        isOpen={trainerToDelete !== null}
        onClose={() => {
          if (!isDeleting) {
            setTrainerToDelete(null);
            setDeleteError('');
          }
        }}
        title="Delete Trainer"
        description="Confirm trainer removal"
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setTrainerToDelete(null);
                setDeleteError('');
              }}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDeleteTrainer}
              className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : 'Confirm Delete'}
            </button>
          </>
        }
      >
        {trainerToDelete && (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete <strong>{trainerToDelete.name}</strong>?
            </p>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Deleting this trainer will remove their profile from the active trainer directory and attendance summary in your current browser workspace.
            </p>
            <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Historical class schedules and attendance records linked to this trainer are preserved and will not be deleted. Permanent server-side database deletion requires backend API integration.
            </div>
            {deleteError && (
              <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {deleteError}
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Add / Edit Trainer Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={closeForm}
        title={editingTrainer ? `Edit Trainer · ${editingTrainer.name}` : 'Add New Trainer'}
        description={
          editingTrainer
            ? 'Update trainer profile details and specialization'
            : 'Create a new trainer profile for your studio workspace'
        }
        size="md"
        footer={
          <>
            <button
              type="button"
              disabled={saving}
              onClick={closeForm}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="trainer-profile-form"
              disabled={saving}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white hover:bg-rose-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editingTrainer ? 'Save changes' : 'Add Trainer'}
            </button>
          </>
        }
      >
        <form id="trainer-profile-form" onSubmit={saveTrainer} className="space-y-3.5">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Full Name *
            <input
              required
              autoFocus
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Vikram Sen"
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
                placeholder="vikram@example.com"
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

          {!editingTrainer && (
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
          )}

          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Specialization &amp; Expertise
            <input
              value={form.specialization}
              onChange={(e) => setForm((prev) => ({ ...prev, specialization: e.target.value }))}
              placeholder="e.g. Pilates Reformer, Strength &amp; Conditioning, HIIT"
              className={input}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Shift / Availability
              <input
                value={form.shift}
                onChange={(e) => setForm((prev) => ({ ...prev, shift: e.target.value }))}
                placeholder="e.g. 08:00 AM – 02:00 PM"
                className={input}
              />
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
          </div>

          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            Trainer identity and access are managed by the server invitation roster.
          </p>
        </form>
      </Modal>
      <TeamInviteModal open={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} defaultRole="trainer" studioName={currentStaffStudio.name} onInvited={reloadTeamRoster} />
    </div>
  );
}
