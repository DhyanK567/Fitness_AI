'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ApiClient, type FrontDeskOverview } from '@/lib/api-client';
import { formatIndianMobile, formatIstDateTime, isValidIndianMobile } from '@/lib/localization/india';
import { EmployeeWorkspaceFrame, EmptyWorkspaceState, WorkspaceError, WorkspaceLoading } from '@/components/workspaces/EmployeeWorkspaceFrame';

const nav = [
  { href: '/front-desk/dashboard', label: 'Shift overview', description: 'Arrivals, occupancy, and today’s desk priorities.' },
  { href: '/front-desk/members', label: 'Member lookup', description: 'Find live member profiles and membership status.' },
  { href: '/front-desk/schedule', label: 'Class schedule', description: 'Today’s sessions, rooms, coaches, and capacity.' },
  { href: '/front-desk/bookings', label: 'Bookings', description: 'View active class reservations.' },
  { href: '/front-desk/attendance', label: 'Check-in', description: 'Record arrivals with duplicate protection.' },
  { href: '/front-desk/leads', label: 'Walk-in leads', description: 'Capture new reception enquiries.' },
];

export function FrontDeskWorkspace() {
  const pathname = usePathname();
  const [data, setData] = useState<FrontDeskOverview | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyBooking, setBusyBooking] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [leadBusy, setLeadBusy] = useState(false);
  const [leadForm, setLeadForm] = useState({ full_name: '', phone: '', email: '', plan: '', notes: '' });
  const load = useCallback(async () => {
    setError('');
    try { setData(await ApiClient.getFrontDeskOverview()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load the reception workspace.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const memberById = useMemo(() => new Map(data?.members.map((member) => [member.id, member]) ?? []), [data]);
  const sessionById = useMemo(() => new Map(data?.sessions.map((session) => [session.id, session]) ?? []), [data]);
  const checkedIn = useMemo(() => new Set(data?.attendance.map((row) => row.bookingId) ?? []), [data]);
  const matchingMembers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data?.members ?? [];
    return (data?.members ?? []).filter((member) => [member.id, member.fullName, member.email, member.phone, member.plan].some((value) => value?.toLowerCase().includes(term)));
  }, [data, query]);

  async function checkIn(bookingId: string) {
    setBusyBooking(bookingId); setNotice('');
    try { await ApiClient.frontDeskCheckIn(bookingId); setNotice('Check-in recorded successfully.'); await load(); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : 'Unable to record check-in.'); }
    finally { setBusyBooking(null); }
  }

  async function captureWalkIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
    if (!isValidIndianMobile(leadForm.phone)) {
      setNotice('Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.');
      return;
    }
    setLeadBusy(true);
    try {
      await ApiClient.createFrontDeskWalkInLead({
        full_name: leadForm.full_name.trim(),
        phone: leadForm.phone.trim(),
        email: leadForm.email.trim() || undefined,
        plan: leadForm.plan.trim() || undefined,
        notes: leadForm.notes.trim() || undefined,
      });
      setLeadForm({ full_name: '', phone: '', email: '', plan: '', notes: '' });
      setNotice('Walk-in enquiry saved to the studio lead pipeline.');
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Unable to save this walk-in enquiry.');
    } finally {
      setLeadBusy(false);
    }
  }

  if (!data && !error) return <WorkspaceLoading label="front desk" />;
  if (!data) return <WorkspaceError message={error} retry={() => void load()} />;
  const section = pathname.split('/')[2] ?? 'dashboard';

  return <EmployeeWorkspaceFrame accent="cyan" eyebrow="Front desk · Live operations" employeeName={data.user.displayName} studioName={data.studio.name} tierName={data.studio.tierName} nav={nav}>
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Reception command desk</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Keep every arrival moving.</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">Member search, bookings, live class capacity, and attendance are scoped to {data.studio.name}.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[['Members', data.members.length], ['Classes', data.sessions.length], ['Bookings', data.bookings.length], ['Checked in', data.attendance.length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-xs text-slate-300">{label}</p><p className="mt-1 text-2xl font-black">{value}</p></div>)}
        </div>
      </section>
      {notice && <div className="rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-900">{notice}</div>}
      {(section === 'dashboard' || section === 'members') && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Member lookup</p><h2 className="mt-1 text-xl font-black">Find a member</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, or plan" className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-cyan-500 sm:max-w-sm" /></div>
        <div className="mt-4 divide-y divide-slate-100">{matchingMembers.slice(0, section === 'members' ? 100 : 6).map((member) => <div key={member.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-bold">{member.fullName}</p><p className="text-xs text-slate-500">{member.email} · {formatIndianMobile(member.phone)}</p></div><div><p className="text-sm font-semibold">{member.plan}</p><p className="text-xs text-slate-500">Valid until {member.expiry ? formatIstDateTime(member.expiry) : 'not recorded'}</p></div><span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{member.status}</span></div>)}</div>
        {!matchingMembers.length && <EmptyWorkspaceState title="No matching members" detail="Records appear here only after they are created or imported into this studio." />}
      </section>}
      {(section === 'dashboard' || section === 'schedule') && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Schedule</p><h2 className="mt-1 text-xl font-black">Studio sessions</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{data.sessions.slice(0, section === 'schedule' ? 100 : 6).map((session) => <article key={session.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex justify-between gap-3"><div><p className="font-bold">{session.name}</p><p className="text-sm text-slate-500">{session.category} · {session.trainer}</p></div><span className="h-fit rounded-full bg-cyan-50 px-2 py-1 text-xs font-bold text-cyan-800">{session.status}</span></div><p className="mt-3 text-sm font-semibold">{formatIstDateTime(session.date)} · {session.startTime}</p><p className="mt-1 text-xs text-slate-500">{session.room || 'Room not assigned'} · Capacity {session.capacity}</p></article>)}</div>{!data.sessions.length && <EmptyWorkspaceState title="No classes scheduled" detail="Classes created by studio management will appear here automatically." />}</section>}
      {(section === 'bookings' || section === 'attendance') && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">{section === 'attendance' ? 'Arrival queue' : 'Reservations'}</p><h2 className="mt-1 text-xl font-black">{section === 'attendance' ? 'Member check-in' : 'Class bookings'}</h2><div className="mt-4 divide-y divide-slate-100">{data.bookings.map((booking) => { const member = memberById.get(booking.memberId); const session = sessionById.get(booking.classId); const done = checkedIn.has(booking.id); return <div key={booking.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_auto] sm:items-center"><div><p className="font-bold">{member?.fullName ?? 'Member record unavailable'}</p><p className="text-xs text-slate-500">{member?.phone ? formatIndianMobile(member.phone) : booking.memberId}</p></div><div><p className="text-sm font-semibold">{session?.name ?? 'Class record unavailable'}</p><p className="text-xs text-slate-500">Booked {formatIstDateTime(booking.bookedAt)}</p></div>{section === 'attendance' ? <button disabled={done || busyBooking === booking.id} onClick={() => void checkIn(booking.id)} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">{done ? 'Checked in' : busyBooking === booking.id ? 'Recording…' : 'Check in'}</button> : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{booking.status}</span>}</div>; })}</div>{!data.bookings.length && <EmptyWorkspaceState title="No bookings yet" detail="Confirmed bookings for this tenant will appear here." />}</section>}
      {section === 'leads' && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Reception intake</p>
        <h2 className="mt-1 text-xl font-black">Capture a walk-in enquiry</h2>
        <p className="mt-1 text-sm text-slate-500">Creates a real tenant-scoped lead without exposing CRM conversion controls.</p>
        <form onSubmit={captureWalkIn} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Full name<input required minLength={2} maxLength={160} value={leadForm.full_name} onChange={(event) => setLeadForm((current) => ({ ...current, full_name: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal outline-none focus:border-cyan-500" /></label>
          <label className="text-xs font-bold text-slate-600">Indian mobile<input required placeholder="+91 98450 91122" value={leadForm.phone} onChange={(event) => setLeadForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal outline-none focus:border-cyan-500" /></label>
          <label className="text-xs font-bold text-slate-600">Email (optional)<input type="email" value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal outline-none focus:border-cyan-500" /></label>
          <label className="text-xs font-bold text-slate-600">Interested plan (optional)<input maxLength={40} value={leadForm.plan} onChange={(event) => setLeadForm((current) => ({ ...current, plan: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal outline-none focus:border-cyan-500" /></label>
          <label className="text-xs font-bold text-slate-600 sm:col-span-2">Notes (optional)<textarea maxLength={2000} rows={4} value={leadForm.notes} onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-normal outline-none focus:border-cyan-500" /></label>
          <button disabled={leadBusy} className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300 sm:w-fit">{leadBusy ? 'Saving enquiryâ€¦' : 'Save walk-in lead'}</button>
        </form>
      </section>}
    </div>
  </EmployeeWorkspaceFrame>;
}
