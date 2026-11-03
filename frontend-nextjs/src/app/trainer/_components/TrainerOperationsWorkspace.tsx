'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useTenantBranding } from '@/features/settings';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Dumbbell,
  LogOut,
  Menu,
  RefreshCw,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ApiClient, type TrainerOverview } from '@/lib/api-client';
import { formatIstDateTime, formatIndianMobile } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';

type Section = 'overview' | 'schedule' | 'clients' | 'programs' | 'progress' | 'attendance';

const sections: Array<{ id: Section; label: string; icon: typeof Activity }> = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'schedule', label: 'My sessions', icon: CalendarDays },
  { id: 'clients', label: 'Assigned clients', icon: UsersRound },
  { id: 'programs', label: 'Training programs', icon: Dumbbell },
  { id: 'progress', label: 'Progress notes', icon: TrendingUp },
  { id: 'attendance', label: 'Session attendance', icon: ClipboardCheck },
];

const surface = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const input = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-rose-500 focus:ring-2 focus:ring-rose-100';

function dateKey(value: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function timeLabel(value?: string | null): string {
  if (!value) return 'Time not set';
  const [hours = '0', minutes = '00'] = value.split(':');
  const hour = Number(hours);
  return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'} IST`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'TR';
}

export function TrainerOperationsWorkspace() {
  const branding = useTenantBranding();
  const { addToast } = useToast();
  const [data, setData] = useState<TrainerOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [section, setSection] = useState<Section>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [programForm, setProgramForm] = useState({ memberId: '', title: '', goal: '', exercises: '' });
  const [progressForm, setProgressForm] = useState({ memberId: '', milestone: '', notes: '', metric: '' });

  async function load() {
    setLoading(true);
    setError('');
    try {
      setData(await ApiClient.getTrainerOverview());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Trainer workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const today = dateKey(new Date());
  const memberMap = useMemo(() => new Map((data?.members ?? []).map((member) => [member.id, member])), [data]);
  const sessionMap = useMemo(() => new Map((data?.sessions ?? []).map((sessionItem) => [sessionItem.id, sessionItem])), [data]);
  const attendanceMap = useMemo(() => new Map((data?.attendance ?? []).map((item) => [item.bookingId, item])), [data]);
  const todaySessions = useMemo(() => (data?.sessions ?? []).filter((item) => dateKey(item.date) === today), [data, today]);
  const upcomingSessions = useMemo(() => (data?.sessions ?? []).filter((item) => dateKey(item.date) >= today), [data, today]);
  const assignedBookings = data?.bookings ?? [];
  const pendingAttendance = assignedBookings.filter((booking) => booking.status.toLowerCase() === 'confirmed' && !attendanceMap.has(booking.id));

  async function checkIn(bookingId: string) {
    setBusyId(bookingId);
    try {
      await ApiClient.checkInBooking(bookingId);
      await load();
      addToast({ type: 'success', title: 'Attendance recorded', message: 'The roster was updated with the live check-in time.' });
    } catch (checkInError) {
      addToast({ type: 'error', title: 'Check-in failed', message: checkInError instanceof Error ? checkInError.message : 'Try again.' });
    } finally {
      setBusyId('');
    }
  }

  async function saveProgram(event: React.FormEvent) {
    event.preventDefault();
    if (!programForm.memberId || !programForm.title.trim()) return;
    setBusyId('program');
    try {
      await ApiClient.saveTrainerWorkout({
        member_id: programForm.memberId,
        title: programForm.title.trim(),
        goal: programForm.goal.trim() || undefined,
        exercises: { notes: programForm.exercises.trim(), format: 'trainer-authored' },
        active: true,
      });
      setProgramForm({ memberId: '', title: '', goal: '', exercises: '' });
      await load();
      addToast({ type: 'success', title: 'Program saved', message: 'The assigned client can now be coached from this persisted plan.' });
    } catch (saveError) {
      addToast({ type: 'error', title: 'Program not saved', message: saveError instanceof Error ? saveError.message : 'Try again.' });
    } finally {
      setBusyId('');
    }
  }

  async function saveProgress(event: React.FormEvent) {
    event.preventDefault();
    if (!progressForm.memberId || !progressForm.notes.trim()) return;
    setBusyId('progress');
    try {
      await ApiClient.saveTrainerProgress({
        member_id: progressForm.memberId,
        recorded_at: new Date().toISOString(),
        metrics: { observation: progressForm.metric.trim() || 'Session progress recorded' },
        notes: progressForm.notes.trim(),
        milestone: progressForm.milestone.trim() || undefined,
      });
      setProgressForm({ memberId: '', milestone: '', notes: '', metric: '' });
      await load();
      addToast({ type: 'success', title: 'Progress recorded', message: 'The note is stored against this trainer and assigned client.' });
    } catch (saveError) {
      addToast({ type: 'error', title: 'Progress not saved', message: saveError instanceof Error ? saveError.message : 'Try again.' });
    } finally {
      setBusyId('');
    }
  }

  async function signOut() {
    await fetch('/api/auth/staff/logout', { method: 'POST' }).catch(() => undefined);
    for (const key of ['ws_staff_token', 'ws_staff_user', 'fitness-studio:entitlements-tier', 'fitness-studio:entitlements-roles']) {
      window.localStorage.removeItem(key);
    }
    window.location.assign('/staff-login');
  }

  if (loading && !data) {
    return <div className="grid min-h-[70vh] place-items-center bg-slate-50"><div className="text-center"><RefreshCw className="mx-auto size-6 animate-spin text-rose-600" /><p className="mt-3 text-sm text-slate-600">Loading your assigned trainer workspace…</p></div></div>;
  }

  if (!data) {
    return <div className="grid min-h-[70vh] place-items-center bg-slate-50 p-6"><div className={`${surface} max-w-md p-7 text-center`}><h1 className="text-xl font-bold text-slate-950">Workspace unavailable</h1><p className="mt-2 text-sm text-slate-600">{error}</p><button onClick={() => void load()} className="mt-5 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white">Retry securely</button></div></div>;
  }

  const trainerName = data.trainer.displayName;
  const overviewStats: Array<{ label: string; value: number; Icon: LucideIcon; detail: string }> = [
    { label: 'Sessions today', value: todaySessions.length, Icon: CalendarDays, detail: 'Only sessions assigned to you' },
    { label: 'Assigned clients', value: data.members.length, Icon: UsersRound, detail: 'Managed by your studio admin' },
    { label: 'Active programs', value: data.workouts.filter((item) => item.active).length, Icon: Dumbbell, detail: 'Database-backed coaching plans' },
    { label: 'Attendance due', value: pendingAttendance.length, Icon: ClipboardCheck, detail: 'Confirmed roster entries' },
  ];

  const nav = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="border-b border-white/10 p-5">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            <div className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-white/10 p-1.5">
              <Image
                src={branding.logoUrl}
                alt={branding.studioName || data.studio.name}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          ) : null}
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-300">Trainer workspace</p>
            <h1 className="mt-1 truncate text-lg font-bold">{branding.studioName || data.studio.name}</h1>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">{data.studio.tierName} plan · {data.studio.timezone}</p>
      </div>
      <nav className="flex-1 space-y-1 p-3">{sections.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { setSection(item.id); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition ${section === item.id ? 'bg-rose-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon className="size-4" />{item.label}</button>; })}</nav>
      <div className="border-t border-white/10 p-4"><div className="mb-3 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-rose-500 font-bold">{initials(trainerName)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{trainerName}</p><p className="truncate text-xs text-slate-400">{data.trainer.email}</p></div></div><button onClick={() => void signOut()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 py-2.5 text-xs font-bold text-slate-200 hover:bg-white/10"><LogOut className="size-4" />Sign out</button></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 lg:flex">
      <aside className="hidden w-72 shrink-0 lg:block">{nav}</aside>
      {mobileNav ? <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileNav(false)} /><aside className="relative h-full w-[85vw] max-w-xs">{nav}<button aria-label="Close navigation" onClick={() => setMobileNav(false)} className="absolute right-3 top-3 rounded-lg p-2 text-white"><X className="size-5" /></button></aside></div> : null}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-xl border border-slate-200 p-2 lg:hidden"><Menu className="size-5" /></button><div><p className="text-xs font-bold uppercase tracking-wider text-rose-600">Authenticated trainer</p><p className="truncate text-sm font-bold sm:text-base">{trainerName}</p></div></div><div className="flex items-center gap-2"><span className="hidden rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 sm:inline">{data.studio.tierName}</span><button aria-label="Refresh workspace" onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 disabled:opacity-50"><RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div></header>

        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
          {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div> : null}

          {section === 'overview' ? <>
            <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-rose-950 p-6 text-white sm:p-8"><p className="text-sm text-rose-200">Welcome back, {trainerName.split(' ')[0]}</p><h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">Coach today’s assigned people with complete focus.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">This workspace is scoped to your authenticated identity. It works for strength training, yoga, dance, mobility, Pilates, Zumba, and other instructor-led programs.</p></section>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{overviewStats.map(({ label, value, Icon, detail }) => <article key={label} className={`${surface} p-5`}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-slate-600">{label}</p><Icon className="size-5 text-rose-600" /></div><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>)}</section>
            <section className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><div className={`${surface} p-5`}><h3 className="font-bold">Today’s assigned sessions</h3><div className="mt-4 space-y-3">{todaySessions.length ? todaySessions.map((item) => <SessionCard key={item.id} item={item} bookings={assignedBookings.filter((booking) => booking.classId === item.id).length} />) : <Empty title="No sessions assigned today" detail="When an owner assigns a class to your trainer identity, it will appear here." />}</div></div><div className={`${surface} p-5`}><h3 className="font-bold">Coaching readiness</h3><div className="mt-4 space-y-3 text-sm">{['Review assigned client notes', 'Confirm session space and equipment', 'Record attendance after arrival', 'Update progress while context is fresh'].map((text, index) => <div key={text} className="flex gap-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{index + 1}</span><p className="pt-1 text-slate-600">{text}</p></div>)}</div></div></section>
          </> : null}

          {section === 'schedule' ? <WorkspaceSection title="My sessions" description="Classes matched to your authenticated trainer profile—not the full studio schedule."><div className="grid gap-3">{upcomingSessions.length ? upcomingSessions.map((item) => <SessionCard key={item.id} item={item} bookings={assignedBookings.filter((booking) => booking.classId === item.id).length} />) : <Empty title="No upcoming sessions assigned" detail="Ask the studio owner to assign a class using your exact employee profile." />}</div></WorkspaceSection> : null}

          {section === 'clients' ? <WorkspaceSection title="Assigned clients" description="Only members explicitly assigned to you are returned by the server."><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.members.length ? data.members.map((member) => <article key={member.id} className={`${surface} p-5`}><div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-indigo-50 font-bold text-indigo-700">{initials(member.fullName)}</span><div className="min-w-0"><h3 className="truncate font-bold">{member.fullName}</h3><p className="text-xs text-slate-500">{member.plan} · {member.status}</p></div></div><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-xs text-slate-400">Email</dt><dd className="truncate">{member.email}</dd></div><div><dt className="text-xs text-slate-400">Mobile</dt><dd>{formatIndianMobile(member.phone, member.phone)}</dd></div></dl></article>) : <div className="md:col-span-2 xl:col-span-3"><Empty title="No clients assigned yet" detail="The owner or admin can assign members to you from the member management page." /></div>}</div></WorkspaceSection> : null}

          {section === 'programs' ? <WorkspaceSection title="Training programs" description="Create modality-neutral plans for gym, yoga, dance, mobility, rehabilitation, or group fitness."><div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]"><form onSubmit={saveProgram} className={`${surface} space-y-3 p-5`}><h3 className="font-bold">Create program</h3><select className={input} value={programForm.memberId} onChange={(event) => setProgramForm((value) => ({ ...value, memberId: event.target.value }))} required><option value="">Select assigned client</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select><input className={input} placeholder="Program title" value={programForm.title} onChange={(event) => setProgramForm((value) => ({ ...value, title: event.target.value }))} required /><input className={input} placeholder="Goal (optional)" value={programForm.goal} onChange={(event) => setProgramForm((value) => ({ ...value, goal: event.target.value }))} /><textarea className={`${input} min-h-28 py-3`} placeholder="Movements, poses, drills, sets, timing, cues, or modifications" value={programForm.exercises} onChange={(event) => setProgramForm((value) => ({ ...value, exercises: event.target.value }))} /><button disabled={busyId === 'program' || !data.members.length} className="w-full rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busyId === 'program' ? 'Saving…' : 'Save program'}</button></form><div className="space-y-3">{data.workouts.length ? data.workouts.map((plan) => <article key={plan.id} className={`${surface} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">{plan.title}</h3><p className="mt-1 text-sm text-slate-500">{memberMap.get(plan.memberId)?.fullName ?? 'Assigned client'}{plan.goal ? ` · ${plan.goal}` : ''}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${plan.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{plan.active ? 'Active' : 'Archived'}</span></div></article>) : <Empty title="No training programs yet" detail="Create the first plan for one of your assigned clients." />}</div></div></WorkspaceSection> : null}

          {section === 'progress' ? <WorkspaceSection title="Progress notes" description="Private coaching records are persisted and restricted to you and authorized studio administrators."><div className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]"><form onSubmit={saveProgress} className={`${surface} space-y-3 p-5`}><h3 className="font-bold">Record progress</h3><select className={input} value={progressForm.memberId} onChange={(event) => setProgressForm((value) => ({ ...value, memberId: event.target.value }))} required><option value="">Select assigned client</option>{data.members.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select><input className={input} placeholder="Milestone (optional)" value={progressForm.milestone} onChange={(event) => setProgressForm((value) => ({ ...value, milestone: event.target.value }))} /><input className={input} placeholder="Metric or observation" value={progressForm.metric} onChange={(event) => setProgressForm((value) => ({ ...value, metric: event.target.value }))} /><textarea className={`${input} min-h-28 py-3`} placeholder="Session notes, form changes, readiness, modifications, or next steps" value={progressForm.notes} onChange={(event) => setProgressForm((value) => ({ ...value, notes: event.target.value }))} required /><button disabled={busyId === 'progress' || !data.members.length} className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busyId === 'progress' ? 'Saving…' : 'Save progress note'}</button></form><div className="space-y-3">{data.progress.length ? data.progress.map((note) => <article key={note.id} className={`${surface} p-5`}><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{memberMap.get(note.memberId)?.fullName ?? 'Assigned client'}</h3><p className="mt-1 text-xs text-slate-500">{formatIstDateTime(note.recordedAt)}</p></div>{note.milestone ? <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">{note.milestone}</span> : null}</div><p className="mt-3 text-sm leading-6 text-slate-600">{note.notes || 'No narrative note recorded.'}</p></article>) : <Empty title="No progress records yet" detail="Record an observation after a session to begin a client timeline." />}</div></div></WorkspaceSection> : null}

          {section === 'attendance' ? <WorkspaceSection title="Session attendance" description="Check-ins are written to PostgreSQL and duplicate check-ins are rejected by the server."><div className="space-y-3">{assignedBookings.length ? assignedBookings.map((booking) => { const member = memberMap.get(booking.memberId); const sessionItem = sessionMap.get(booking.classId); const record = attendanceMap.get(booking.id); return <article key={booking.id} className={`${surface} flex flex-wrap items-center justify-between gap-4 p-4`}><div><h3 className="font-bold">{member?.fullName ?? 'Assigned roster member'}</h3><p className="mt-1 text-xs text-slate-500">{sessionItem?.name ?? 'Assigned session'} · {sessionItem ? `${dateKey(sessionItem.date)} at ${timeLabel(sessionItem.startTime)}` : 'Schedule unavailable'}</p></div>{record ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="size-4" />{record.status}{record.checkedInAt ? ` · ${formatIstDateTime(record.checkedInAt)}` : ''}</span> : <button disabled={busyId === booking.id || booking.status.toLowerCase() !== 'confirmed'} onClick={() => void checkIn(booking.id)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busyId === booking.id ? 'Recording…' : 'Mark present'}</button>}</article>; }) : <Empty title="No assigned roster entries" detail="Bookings for your assigned clients or sessions will appear here." />}</div></WorkspaceSection> : null}
        </div>
      </main>
    </div>
  );
}

function WorkspaceSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section><div className="mb-5"><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>{children}</section>;
}

function SessionCard({ item, bookings }: { item: TrainerOverview['sessions'][number]; bookings: number }) {
  return <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold">{item.name}</h3><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-indigo-700">{item.category}</span></div><p className="mt-1 text-xs text-slate-500">{dateKey(item.date)} · {timeLabel(item.startTime)}{item.endTime ? `–${timeLabel(item.endTime)}` : ''} · {item.room || 'Location not set'}</p></div><div className="text-right"><p className="text-sm font-bold">{bookings}/{item.capacity}</p><p className="text-xs text-slate-500">booked</p></div></div></article>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><UserRound className="mx-auto size-8 text-slate-300" /><h3 className="mt-3 font-bold text-slate-800">{title}</h3><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{detail}</p></div>;
}
