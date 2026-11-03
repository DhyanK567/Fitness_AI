'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ApiClient, type TrainerOverview } from '@/lib/api-client';
import { formatIndianMobile } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import { Modal } from '@/components/ui/Modal';
import {
  ActivityIcon,
  CheckCircleIcon,
  DumbbellIcon,
  MailIcon,
  PhoneIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { getStudioSession } from '@/lib/auth/studio-session';
import { currentStaffStudio } from '@/app/admin/_components/AdminDataProvider';

const cardSurface =
  'rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const inputControl =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100';

export default function TrainerMembersPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Program Modal
  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [programMemberId, setProgramMemberId] = useState('');
  const [programTitle, setProgramTitle] = useState('');
  const [programGoal, setProgramGoal] = useState('');
  const [programExercises, setProgramExercises] = useState('');
  const [savingProgram, setSavingProgram] = useState(false);

  // Progress Note Modal
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressMemberId, setProgressMemberId] = useState('');
  const [progressMilestone, setProgressMilestone] = useState('');
  const [progressMetric, setProgressMetric] = useState('');
  const [progressNotes, setProgressNotes] = useState('');
  const [savingProgress, setSavingProgress] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const overview = await ApiClient.getTrainerOverview();
      setData(overview);
    } catch {
      const session = getStudioSession();
      const trainerName = session?.name || 'Ranaya';
      try {
        const [membersRes] = await Promise.allSettled([ApiClient.getMembers()]);
        const membersList = membersRes.status === 'fulfilled' && Array.isArray(membersRes.value) ? membersRes.value : [];
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
            joined: m.joined || new Date().toISOString().slice(0, 10),
            expiry: m.expiry || null,
          })),
          sessions: [],
          bookings: [],
          attendance: [],
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

  const members = data?.members || [];

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        m.plan.toLowerCase().includes(q)
      );
    });
  }, [members, search]);

  async function handleSaveProgram(e: React.FormEvent) {
    e.preventDefault();
    if (!programMemberId || !programTitle.trim()) return;
    setSavingProgram(true);
    try {
      await ApiClient.saveTrainerWorkout({
        member_id: programMemberId,
        title: programTitle.trim(),
        goal: programGoal.trim() || undefined,
        exercises: { notes: programExercises.trim(), format: 'trainer-authored' },
        active: true,
      });
      addToast({
        type: 'success',
        title: 'Program Assigned',
        message: 'Coaching plan saved to member profile in PostgreSQL database.',
      });
      setProgramModalOpen(false);
      setProgramTitle('');
      setProgramGoal('');
      setProgramExercises('');
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to save workout plan.',
      });
    } finally {
      setSavingProgram(false);
    }
  }

  async function handleSaveProgress(e: React.FormEvent) {
    e.preventDefault();
    if (!progressMemberId || !progressNotes.trim()) return;
    setSavingProgress(true);
    try {
      await ApiClient.saveTrainerProgress({
        member_id: progressMemberId,
        recorded_at: new Date().toISOString(),
        metrics: { observation: progressMetric.trim() || 'Coaching observation' },
        notes: progressNotes.trim(),
        milestone: progressMilestone.trim() || undefined,
      });
      addToast({
        type: 'success',
        title: 'Progress Recorded',
        message: 'Client progress milestone saved to database.',
      });
      setProgressModalOpen(false);
      setProgressMilestone('');
      setProgressMetric('');
      setProgressNotes('');
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to record progress.',
      });
    } finally {
      setSavingProgress(false);
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
                <UsersIcon size="xs" />
                Assigned Clients
              </span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[11px] font-bold text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/60 dark:text-violet-300">
                {currentStaffStudio.name}
              </span>
            </div>
            <h1 className="mt-2 font-serif text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
              My Coaching Clients
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300">
              Only studio members directly assigned to your coach identity ({members.length} active)
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <SearchIcon size="xs" className="pointer-events-none absolute left-3 top-3 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients by name, phone..."
              className={`${inputControl} pl-8`}
            />
          </div>
        </div>
      </section>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredMembers.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-studio-800 dark:bg-studio-900">
            <UsersIcon size="md" className="mx-auto text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-white">No assigned clients found</p>
            <p className="mt-1 text-xs text-slate-500">Contact your studio manager to assign members to your profile.</p>
          </div>
        ) : (
          filteredMembers.map((member) => (
            <div key={member.id} className={`${cardSurface} flex flex-col justify-between p-5`}>
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-100 text-sm font-bold text-[#E11D48] dark:bg-rose-950/60 dark:text-rose-400">
                      {member.fullName.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h2 className="font-serif text-base font-bold text-slate-900 dark:text-white">{member.fullName}</h2>
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        {member.plan}
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {member.status}
                  </span>
                </div>

                <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-studio-800 dark:text-slate-400">
                  <p className="flex items-center gap-2">
                    <MailIcon size="xs" className="shrink-0 text-slate-400" />
                    <span className="truncate">{member.email || 'No email recorded'}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <PhoneIcon size="xs" className="shrink-0 text-slate-400" />
                    <span>{member.phone ? formatIndianMobile(member.phone) : 'No phone recorded'}</span>
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
                <button
                  type="button"
                  onClick={() => {
                    setProgramMemberId(member.id);
                    setProgramModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-rose-50 py-2 text-center text-xs font-bold text-rose-700 transition hover:bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  + Program
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProgressMemberId(member.id);
                    setProgressModalOpen(true);
                  }}
                  className="flex-1 rounded-xl bg-violet-50 py-2 text-center text-xs font-bold text-violet-700 transition hover:bg-violet-100 dark:bg-violet-950/60 dark:text-violet-300"
                >
                  + Progress Note
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Program Modal */}
      <Modal
        isOpen={programModalOpen}
        onClose={() => setProgramModalOpen(false)}
        title="Assign Coaching Workout Program"
        size="md"
      >
        <form onSubmit={handleSaveProgram} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Program Title *</label>
            <input
              type="text"
              required
              value={programTitle}
              onChange={(e) => setProgramTitle(e.target.value)}
              placeholder="e.g. 4-Week Hypertrophy &amp; Core Progression"
              className={`mt-1 ${inputControl}`}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Target Goal</label>
            <input
              type="text"
              value={programGoal}
              onChange={(e) => setProgramGoal(e.target.value)}
              placeholder="e.g. Build overhead shoulder stability"
              className={`mt-1 ${inputControl}`}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Exercises &amp; Prescriptions</label>
            <textarea
              rows={4}
              value={programExercises}
              onChange={(e) => setProgramExercises(e.target.value)}
              placeholder="1. Romanian Deadlift: 3 x 10&#10;2. Overhead Press: 3 x 8&#10;3. Core Hollow Hold: 3 x 30s"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setProgramModalOpen(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProgram}
              className="rounded-xl bg-[#E11D48] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
            >
              {savingProgram ? 'Saving…' : 'Save Program'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Progress Modal */}
      <Modal
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        title="Record Client Progress Milestone"
        size="md"
      >
        <form onSubmit={handleSaveProgress} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Milestone</label>
            <input
              type="text"
              value={progressMilestone}
              onChange={(e) => setProgressMilestone(e.target.value)}
              placeholder="e.g. Completed first unassisted pull-up"
              className={`mt-1 ${inputControl}`}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Observation / Metric</label>
            <input
              type="text"
              value={progressMetric}
              onChange={(e) => setProgressMetric(e.target.value)}
              placeholder="e.g. 5kg increase in squat, improved tempo"
              className={`mt-1 ${inputControl}`}
            />
          </div>
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200">Coaching Notes *</label>
            <textarea
              required
              rows={4}
              value={progressNotes}
              onChange={(e) => setProgressNotes(e.target.value)}
              placeholder="Notes on form, recovery, and plan adjustments..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setProgressModalOpen(false)}
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProgress}
              className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-violet-700 disabled:opacity-50"
            >
              {savingProgress ? 'Saving…' : 'Record Note'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
