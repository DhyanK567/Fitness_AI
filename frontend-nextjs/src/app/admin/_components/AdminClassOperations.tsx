'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { ActivityIcon, CalendarIcon, CheckCircleIcon, ClockIcon, PlusIcon, SearchIcon, UsersIcon } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { currentStaffStudio, useAdminWorkspaceData, type StaffAttendanceStatus, type StaffClassAttendance, type StaffClassBooking, type StaffMember, type StaffStudioClass } from './AdminDataProvider';
import { readStaffTeamTrainers } from './AdminWorkspacePages';

type WorkspaceView = 'Schedule' | 'Trainers';
type CalendarView = 'Day' | 'Week' | 'Month';
type BookingWorkspaceTab = 'All Reservations';

const input = 'min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100';
const panel = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';
const statusTone = (status: string) =>
  status === 'Present' || status === 'Scheduled' || status === 'Confirmed'
    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
    : status === 'Waitlisted' || status === 'Expected' || status === 'Late'
      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      : status === 'Absent' || status === 'Cancelled'
        ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
        : 'bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-200';
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseDate = (value: string) => new Date(`${value}T12:00:00`);
const dateLabel = (value: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => parseDate(value).toLocaleDateString('en-IN', options);
const timeLabel = (value: string) => {
  const [hour, minute] = value.split(':').map(Number);
  if (Number.isNaN(hour)) return value;
  return `${hour % 12 || 12}:${String(minute || 0).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
};
const to24HourTime = (hour12: string, minute: string, period: 'AM' | 'PM') => {
  let h = Number(hour12) % 12;
  if (period === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${minute}`;
};
const from24HourTime = (time24: string): { hour: string; minute: string; period: 'AM' | 'PM' } => {
  const [rawH, rawM] = (time24 || '07:00').split(':').map(Number);
  const h = Number.isFinite(rawH) ? rawH : 7;
  const m = Number.isFinite(rawM) ? rawM : 0;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hour12 = String(h % 12 || 12);
  const roundedMin = ['00', '15', '30', '45'].includes(String(m).padStart(2, '0')) ? String(m).padStart(2, '0') : '00';
  return { hour: hour12, minute: roundedMin, period };
};
const mondayFor = (value: string) => { const date = parseDate(value); date.setDate(date.getDate() - (date.getDay() + 6) % 7); return date; };
const daysForWeek = (value: string) => Array.from({ length: 7 }, (_, index) => { const date = mondayFor(value); date.setDate(date.getDate() + index); return localDate(date); });
const daysForMonth = (value: string) => { const first = parseDate(value); first.setDate(1); first.setDate(first.getDay() === 0 ? -5 : 1 - first.getDay() + 1); const start = parseDate(value); start.setDate(1); start.setDate(start.getDate() - (start.getDay() + 6) % 7); return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return localDate(date); }); };
const effectiveSessionStatus = (item: StaffStudioClass) => item.status === 'Cancelled' ? 'Cancelled' : item.sessionStatus || 'Scheduled';
const confirmedFor = (bookings: StaffClassBooking[], classId: string) => bookings.filter((item) => item.classId === classId && item.status === 'Confirmed').length;
const intervalOverlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

function readStudioBookingSettings(): { defaultClassCapacity: number; lateGraceMinutes: number } {
  if (typeof window === 'undefined') return { defaultClassCapacity: 14, lateGraceMinutes: 10 };
  try {
    const raw = window.localStorage.getItem('fitness-studio:settings');
    if (!raw) return { defaultClassCapacity: 14, lateGraceMinutes: 10 };
    const parsed = JSON.parse(raw) as { defaultClassCapacity?: number; lateGraceMinutes?: number };
    return {
      defaultClassCapacity: Number(parsed.defaultClassCapacity) > 0 ? Number(parsed.defaultClassCapacity) : 14,
      lateGraceMinutes: Number(parsed.lateGraceMinutes) >= 0 ? Number(parsed.lateGraceMinutes) : 10,
    };
  } catch {
    return { defaultClassCapacity: 14, lateGraceMinutes: 10 };
  }
}

function upsertBookingAttendance(
  booking: StaffClassBooking,
  nextStatus: StaffAttendanceStatus,
  previous: StaffClassAttendance | undefined,
  setAttendance: Dispatch<SetStateAction<StaffClassAttendance[]>>,
  setMembers: Dispatch<SetStateAction<StaffMember[]>>,
) {
  const record: StaffClassAttendance = {
    id: previous?.id || globalThis.crypto.randomUUID(),
    bookingId: booking.id,
    status: nextStatus,
    checkedInAt: nextStatus === 'Present' || nextStatus === 'Late' ? previous?.checkedInAt || new Date().toISOString() : null,
  };
  setAttendance((current) => (previous ? current.map((item) => (item.id === previous.id ? record : item)) : [...current, record]));
  if (nextStatus === 'Present' || nextStatus === 'Late') {
    setMembers((current) => current.map((m) => (m.id === booking.memberId ? { ...m, lastVisit: 'Today' } : m)));
  }
}

function Header({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-700"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-300">Studio operations · {currentStaffStudio.name}</p><h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p></div>{action}</header>;
}

function PreviewNotice() {
  return <p className="mb-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200">Preview workspace · Classes, 12-hour AM/PM schedules, reservations, and check-ins are saved in this browser preview.</p>;
}

function Metric({ label, value, detail, icon: Icon, color }: { label: string; value: string | number; detail: string; icon: typeof CalendarIcon; color: string }) {
  return <div className={`${panel} p-4`}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:text-slate-400">{label}</p><p className="mt-2 font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{value}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}><Icon size="sm" /></span></div><p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">{detail}</p></div>;
}

function TwelveHourTimePicker({
  label,
  value24,
  onChange24,
}: {
  label: string;
  value24: string;
  onChange24: (next24: string) => void;
}) {
  const parsed = from24HourTime(value24);
  return (
    <fieldset className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
      <legend className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label} <span className="font-normal text-rose-700 dark:text-rose-400">({timeLabel(value24)})</span>
      </legend>
      <div className="grid grid-cols-3 gap-1.5">
        <select
          aria-label={`${label} hour`}
          value={parsed.hour}
          onChange={(event) => onChange24(to24HourTime(event.target.value, parsed.minute, parsed.period))}
          className={input}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select
          aria-label={`${label} minute`}
          value={parsed.minute}
          onChange={(event) => onChange24(to24HourTime(parsed.hour, event.target.value, parsed.period))}
          className={input}
        >
          {['00', '15', '30', '45'].map((m) => (
            <option key={m} value={m}>:{m}</option>
          ))}
        </select>
        <select
          aria-label={`${label} AM or PM`}
          value={parsed.period}
          onChange={(event) => onChange24(to24HourTime(parsed.hour, parsed.minute, event.target.value as 'AM' | 'PM'))}
          className={input}
        >
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </fieldset>
  );
}

type ClassForm = Omit<StaffStudioClass, 'id' | 'status'>;
const blankClass: ClassForm = { name: '', category: '', date: '', startTime: '07:00', endTime: '08:00', trainer: '', room: '', capacity: 14, description: '' };

export function ClassOperationsPage() {
  const { classes, setClasses, bookings, members, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const [date, setDate] = useState(() => localDate(new Date()));
  const [calendarView, setCalendarView] = useState<CalendarView>('Week');
  const [view, setView] = useState<WorkspaceView>('Schedule');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [trainerFilter, setTrainerFilter] = useState('All trainers');
  const [sessionFilter, setSessionFilter] = useState('All statuses');
  const [modalOpen, setModalOpen] = useState(false);
  const [detailClass, setDetailClass] = useState<StaffStudioClass | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClassForm>(blankClass);
  const [error, setError] = useState('');
  const days = daysForWeek(date);
  const monthDays = daysForMonth(date);
  const categories = Array.from(new Set(classes.map((item) => item.category).filter(Boolean)));
  const trainers = Array.from(new Set([...readStaffTeamTrainers(), ...classes.map((item) => item.trainer), ...members.map((item) => item.coach).filter((item) => item && item !== 'Unassigned')])).sort();
  const selectedDayClasses = classes
    .filter((item) => item.date === date && (category === 'All categories' || item.category === category) && (trainerFilter === 'All trainers' || item.trainer === trainerFilter) && (sessionFilter === 'All statuses' || effectiveSessionStatus(item) === sessionFilter) && `${item.name} ${item.category} ${item.trainer} ${item.room} ${item.description || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayConflicts = classes.filter((item) => item.date === date && ['Scheduled', 'In Progress'].includes(effectiveSessionStatus(item))).flatMap((item, index, all) => all.slice(index + 1).filter((other) => intervalOverlaps(item.startTime, item.endTime, other.startTime, other.endTime)).flatMap((other) => [item.trainer.toLowerCase() === other.trainer.toLowerCase() ? { first: item, second: other, resource: `Trainer ${item.trainer}` } : null, item.room.trim().toLowerCase() === other.room.trim().toLowerCase() ? { first: item, second: other, resource: `Room ${item.room}` } : null].filter((conflict): conflict is { first: StaffStudioClass; second: StaffStudioClass; resource: string } => Boolean(conflict))));
  const activeWeek = classes.filter((item) => days.includes(item.date) && ['Scheduled', 'In Progress'].includes(effectiveSessionStatus(item)));
  const weekLabel = `${dateLabel(days[0])} – ${dateLabel(days[6], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const startClass = (item?: StaffStudioClass) => {
    const studioDefaults = readStudioBookingSettings();
    setEditingId(item?.id || null);
    setForm(
      item
        ? { name: item.name, category: item.category, date: item.date, startTime: item.startTime, endTime: item.endTime, trainer: item.trainer, room: item.room, capacity: item.capacity, sessionStatus: item.sessionStatus, description: item.description || '' }
        : { ...blankClass, date, startTime: '07:00', endTime: '08:00', trainer: trainers[0] || '', room: 'Studio 1', capacity: studioDefaults.defaultClassCapacity, description: '' },
    );
    setError('');
    setModalOpen(true);
  };
  const saveClass = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = form.name.trim(), type = form.category.trim(), trainer = form.trainer.trim(), room = form.room.trim();
    const capacityValue = Number(form.capacity);
    if (!name || !type || !form.date || !form.startTime || !form.endTime || !trainer || !room) { setError('Complete each required field.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(parseDate(form.date).getTime()) || localDate(parseDate(form.date)) !== form.date) { setError('Choose a valid class date.'); return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.endTime) || form.endTime <= form.startTime) { setError('Make the end time later than the start time (12-hour AM/PM).'); return; }
    if (!Number.isInteger(capacityValue) || capacityValue < 1) { setError('Capacity must be a whole number greater than zero.'); return; }
    if (editingId && capacityValue < confirmedFor(bookings, editingId)) { setError(`Capacity cannot be set below the ${confirmedFor(bookings, editingId)} existing confirmed bookings.`); return; }
    const conflicts = classes.filter((item) => item.id !== editingId && ['Scheduled', 'In Progress'].includes(effectiveSessionStatus(item)) && item.date === form.date && intervalOverlaps(form.startTime, form.endTime, item.startTime, item.endTime));
    const trainerConflict = conflicts.find((item) => item.trainer.toLowerCase() === trainer.toLowerCase());
    if (trainerConflict) { setError(`${trainer} is already assigned to ${trainerConflict.name} (${timeLabel(trainerConflict.startTime)}–${timeLabel(trainerConflict.endTime)}).`); return; }
    const roomConflict = conflicts.find((item) => item.room.trim().toLowerCase() === room.toLowerCase());
    if (roomConflict) { setError(`${room} is already booked for ${roomConflict.name} (${timeLabel(roomConflict.startTime)}–${timeLabel(roomConflict.endTime)}).`); return; }
    const payload = {
      name,
      trainer_id: trainer,
      trainer,
      category: type,
      duration_mins: Number((parseInt(form.endTime.split(':')[0]) - parseInt(form.startTime.split(':')[0])) * 60 + (parseInt(form.endTime.split(':')[1]) - parseInt(form.startTime.split(':')[1]))),
      capacity: capacityValue,
      location: room,
      room,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
    };
    try {
      if (editingId) {
        await ApiClient.updateClass(editingId, payload);
      } else {
        await ApiClient.createClass(payload);
      }
      await refresh();
      setDate(form.date); setModalOpen(false); setError('');
      addToast({ type: 'success', title: editingId ? 'Class updated' : 'Class added', message: `${name} scheduled for ${timeLabel(form.startTime)}–${timeLabel(form.endTime)}.` });
    } catch (err: any) {
      setError(err.message || 'Failed to save class.');
    }
  };
  const cancelClass = async (item: StaffStudioClass) => { if (effectiveSessionStatus(item) !== 'Scheduled') { addToast({ type: 'info', title: 'Session cannot be cancelled', message: 'Only a scheduled session can be cancelled from the schedule preview.' }); return; } if (!window.confirm(`Cancel ${item.name} on ${dateLabel(item.date)}? Existing booking history will remain.`)) return; try { await ApiClient.updateClass(item.id, { status: 'Cancelled' }); await refresh(); addToast({ type: 'info', title: 'Class cancelled', message: 'The class remains for booking and attendance history.' }); } catch (err: any) { addToast({ type: 'error', title: 'Cancellation failed', message: err.message || 'Could not cancel class.' }); } };
  const adjustCalendar = (amount: number) => { const next = parseDate(date); if (calendarView === 'Month') { next.setDate(1); next.setMonth(next.getMonth() + amount); } else if (calendarView === 'Day') next.setDate(next.getDate() + amount); else next.setDate(next.getDate() + amount * 7); setDate(localDate(next)); };
  const tabClass = (selected: boolean) => `min-h-9 rounded-lg px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${selected ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'}`;
  const views: WorkspaceView[] = ['Schedule', 'Trainers'];
  return <div className="mx-auto w-full max-w-[1440px]"><Header title="Classes & Schedule" description="Plan sessions in 12-hour AM/PM time, review trainer assignments, and track confirmed reservations for this studio." action={<button type="button" onClick={() => startClass()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"><PlusIcon size="sm" />Schedule class</button>} /><PreviewNotice />
    <div className="mb-4 grid gap-3 sm:grid-cols-2"><Metric label="Scheduled this week" value={activeWeek.length} detail={`${weekLabel} · preview sessions`} icon={CalendarIcon} color="bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" /><Metric label="Sessions this day" value={classes.filter((item) => item.date === date && effectiveSessionStatus(item) === 'Scheduled').length} detail={dateLabel(date, { weekday: 'long', month: 'short', day: 'numeric' })} icon={ClockIcon} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" /></div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div role="tablist" aria-label="Schedule workspace view" className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-studio-700 dark:bg-studio-900">{views.map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)} className={tabClass(view === item)}>{item}</button>)}</div></div>
    {view === 'Schedule' && <><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div role="tablist" aria-label="Calendar view" className="flex rounded-xl border border-slate-200 bg-white p-1 dark:border-studio-700 dark:bg-studio-900">{(['Day', 'Week', 'Month'] as CalendarView[]).map((item) => <button key={item} type="button" role="tab" aria-selected={calendarView === item} onClick={() => setCalendarView(item)} className={tabClass(calendarView === item)}>{item}</button>)}</div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => adjustCalendar(-1)} className={`${input} px-3`} aria-label={`Previous ${calendarView.toLowerCase()}`}>← Previous</button><span className="min-w-40 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">{calendarView === 'Month' ? dateLabel(date, { month: 'long', year: 'numeric' }) : calendarView === 'Day' ? dateLabel(date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }) : weekLabel}</span><button type="button" onClick={() => adjustCalendar(1)} className={`${input} px-3`} aria-label={`Next ${calendarView.toLowerCase()}`}>Next →</button><button type="button" onClick={() => setDate(localDate(new Date()))} className={`${input} px-3`}>Today</button></div></div>
      {calendarView === 'Week' && <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-7">{days.map((day) => <button key={day} type="button" aria-pressed={day === date} onClick={() => setDate(day)} className={`min-h-[68px] rounded-xl border px-2 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${day === date ? 'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200'}`}><span className="block text-[10px] font-semibold uppercase tracking-wide">{dateLabel(day, { weekday: 'short' })}</span><span className="mt-1 block text-sm font-bold tabular-nums">{dateLabel(day, { day: 'numeric' })}</span><span className="mt-1 block text-[9px] text-slate-500 dark:text-slate-400">{classes.filter((item) => item.date === day).length} sessions</span></button>)}</div>}
      {calendarView === 'Month' && <div className={`${panel} mb-4 overflow-hidden`}><div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:border-studio-800 dark:bg-studio-950 dark:text-slate-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((item) => <div key={item} className="py-2">{item}</div>)}</div><div className="grid grid-cols-7">{monthDays.map((day) => { const inMonth = day.slice(0, 7) === date.slice(0, 7); const dayItems = classes.filter((item) => item.date === day); return <button key={day} type="button" aria-label={`${dateLabel(day, { weekday: 'long', month: 'long', day: 'numeric' })}, ${dayItems.length} sessions`} aria-pressed={day === date} onClick={() => setDate(day)} className={`min-h-[82px] border-b border-r border-slate-100 p-1.5 text-left align-top transition hover:bg-rose-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500 dark:border-studio-800 dark:hover:bg-rose-950/20 sm:min-h-24 sm:p-2 ${day === date ? 'bg-rose-50 dark:bg-rose-950/20' : 'bg-white dark:bg-studio-900'} ${inMonth ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}><span className="text-[10px] font-semibold">{dateLabel(day, { day: 'numeric' })}</span><span className="mt-1 block space-y-1">{dayItems.slice(0, 2).map((item) => <span key={item.id} className={`block truncate rounded px-1 py-0.5 text-[8px] font-medium ${effectiveSessionStatus(item) === 'Cancelled' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200'}`}>{timeLabel(item.startTime)} {item.name}</span>)}{dayItems.length > 2 && <span className="block text-[8px] text-slate-500">+{dayItems.length - 2} more</span>}</span></button>; })}</div></div>}
      <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(200px,1fr)_repeat(3,minmax(150px,auto))]"><label className="relative block"><span className="sr-only">Search classes, categories, trainers, or rooms</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search classes, trainer, room…" className={`${input} w-full pl-9`} /></label><select aria-label="Filter class category" value={category} onChange={(event) => setCategory(event.target.value)} className={input}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter class trainer" value={trainerFilter} onChange={(event) => setTrainerFilter(event.target.value)} className={input}><option>All trainers</option>{trainers.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter session status" value={sessionFilter} onChange={(event) => setSessionFilter(event.target.value)} className={input}><option>All statuses</option>{['Scheduled', 'In Progress', 'Completed', 'Cancelled'].map((item) => <option key={item}>{item}</option>)}</select></div>
      {dayConflicts.length > 0 && <div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200"><strong>{dayConflicts.length} scheduling conflict{dayConflicts.length === 1 ? '' : 's'}:</strong><ul className="mt-1 list-inside list-disc">{dayConflicts.map(({ first, second, resource }) => <li key={`${first.id}-${second.id}`}>{resource}: {first.name} and {second.name}, {timeLabel(first.startTime)}–{timeLabel(first.endTime)} / {timeLabel(second.startTime)}–{timeLabel(second.endTime)}</li>)}</ul></div>}
      <section className={`${panel} overflow-hidden`} aria-label={`${dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })} schedule`}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-studio-800"><div><h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">{dateLabel(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">12-hour AM/PM time · assigned trainer · confirmed occupancy</p></div><input aria-label="Choose schedule date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className={input} /></div><div role="region" aria-label="Class schedule; scroll horizontally for all columns" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:bg-studio-950 dark:text-slate-400"><tr><th className="px-4 py-3">Time (12h)</th><th className="px-3 py-3">Session</th><th className="px-3 py-3">Trainer</th><th className="px-3 py-3">Room</th><th className="px-3 py-3">Confirmed / capacity</th><th className="px-3 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{selectedDayClasses.map((item) => { const booked = confirmedFor(bookings, item.id); const status = effectiveSessionStatus(item); return <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/50"><td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200">{timeLabel(item.startTime)} – {timeLabel(item.endTime)}</td><td className="px-3 py-3"><p className="text-sm font-semibold text-slate-950 dark:text-white">{item.name}</p><span className="text-[10px] text-slate-500 dark:text-slate-400">{item.category} · {Math.max(0, (Number(item.endTime.slice(0, 2)) * 60 + Number(item.endTime.slice(3))) - (Number(item.startTime.slice(0, 2)) * 60 + Number(item.startTime.slice(3))))} min</span></td><td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{item.trainer}</td><td className="px-3 py-3 text-xs text-slate-700 dark:text-slate-300">{item.room}</td><td className="min-w-40 px-3 py-3"><div className="flex items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-studio-800"><span className="block h-full rounded-full bg-rose-600" style={{ width: `${Math.min(100, Math.round(booked / item.capacity * 100))}%` }} /></div><span className="whitespace-nowrap text-[10px] tabular-nums text-slate-600 dark:text-slate-300">{booked}/{item.capacity}</span></div></td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{status}</span></td><td className="px-4 py-3"><div className="flex flex-wrap gap-1"><button type="button" onClick={() => setDetailClass(item)} className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Details</button><button type="button" onClick={() => startClass(item)} className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200">Edit</button>{status === 'Scheduled' && <button type="button" onClick={() => cancelClass(item)} className="min-h-9 rounded-lg border border-rose-200 px-2.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300">Cancel</button>}</div></td></tr>; })}{selectedDayClasses.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center"><p className="font-serif text-lg font-semibold text-slate-900 dark:text-white">No sessions match this day</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose another day, clear filters, or schedule a class.</p><button type="button" onClick={() => { setCategory('All categories'); setTrainerFilter('All trainers'); setSessionFilter('All statuses'); setQuery(''); }} className="mt-3 text-xs font-semibold text-rose-700 underline dark:text-rose-300">Clear filters</button></td></tr>}</tbody></table></div><p className="border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500 dark:border-studio-800 dark:text-slate-400">Occupancy counts confirmed bookings only. Waitlist and cancelled records are excluded.</p></section></>}
    <Modal isOpen={!!detailClass} onClose={() => setDetailClass(null)} title={detailClass?.name || 'Session details'} description="Scheduled class record · 12-hour studio schedule" size="md" footer={detailClass && <div className="flex flex-wrap justify-end gap-2 w-full"><button type="button" onClick={() => { startClass(detailClass); setDetailClass(null); }} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200">Edit session</button><button type="button" onClick={() => setDetailClass(null)} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white">Close</button></div>}>{detailClass && <div className="space-y-4 text-xs text-slate-700 dark:text-slate-200"><dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-studio-950">{[['Category', detailClass.category], ['Date', dateLabel(detailClass.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })], ['Start (12h)', timeLabel(detailClass.startTime)], ['End (12h)', timeLabel(detailClass.endTime)], ['Duration', `${Math.max(0, Number(detailClass.endTime.slice(0, 2)) * 60 + Number(detailClass.endTime.slice(3)) - Number(detailClass.startTime.slice(0, 2)) * 60 - Number(detailClass.startTime.slice(3)))} minutes`], ['Trainer', detailClass.trainer || 'Not provided'], ['Room', detailClass.room || 'Not provided'], ['Capacity', detailClass.capacity], ['Status', effectiveSessionStatus(detailClass)], ['Confirmed bookings', confirmedFor(bookings, detailClass.id)]].map(([label, value]) => <div key={label}><dt className="text-[10px] text-slate-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}{detailClass.description && <div className="col-span-2"><dt className="text-[10px] text-slate-500">Description &amp; notes</dt><dd className="mt-1 font-medium">{detailClass.description}</dd></div>}</dl><div><h3 className="font-semibold">Bookings &amp; attendees</h3>{bookings.filter((booking) => booking.classId === detailClass.id).length ? <ul className="mt-2 space-y-1">{bookings.filter((booking) => booking.classId === detailClass.id).map((booking) => { const member = members.find((item) => item.id === booking.memberId); return <li key={booking.id} className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 p-2 dark:border-studio-700">{member?.name || 'Member not available'} · {member?.email || 'Contact not provided'}<span>{booking.status}</span></li>; })}</ul> : <p className="mt-1 text-slate-500">No booking records are linked.</p>}</div></div>}</Modal>
    {view === 'Trainers' && <section className={`${panel} overflow-hidden`}><div className="border-b border-slate-100 p-4 dark:border-studio-800"><h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">Trainer schedule</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Scheduled class assignments by trainer in 12-hour AM/PM format.</p><select aria-label="Filter trainer schedule" value={trainerFilter} onChange={(event) => setTrainerFilter(event.target.value)} className={`${input} mt-3 w-full sm:w-auto`}><option>All trainers</option>{trainers.map((item) => <option key={item}>{item}</option>)}</select></div><div className="divide-y divide-slate-100 dark:divide-studio-800">{trainers.filter((name) => trainerFilter === 'All trainers' || name === trainerFilter).map((name) => { const assigned = classes.filter((item) => item.trainer === name && item.status === 'Scheduled').sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)); const overlaps = assigned.some((a, index) => assigned.slice(index + 1).some((b) => a.date === b.date && intervalOverlaps(a.startTime, a.endTime, b.startTime, b.endTime))); return <article key={name} className="grid gap-3 p-4 sm:grid-cols-[220px_1fr]"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-white">{name}</h3><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{assigned.length} assigned class{assigned.length === 1 ? '' : 'es'} in preview</p>{overlaps && <p className="mt-2 text-[10px] font-semibold text-rose-700 dark:text-rose-300">Overlapping assignments detected</p>}</div><div className="space-y-2">{assigned.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-studio-700"><div><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{item.name}</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{dateLabel(item.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {timeLabel(item.startTime)} – {timeLabel(item.endTime)} · {item.room}</p></div><button type="button" onClick={() => { setDate(item.date); setView('Schedule'); }} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Open day</button></div>)}{assigned.length === 0 && <p className="text-xs text-slate-500 dark:text-slate-400">No scheduled class assignments in this preview.</p>}</div></article>; })}</div></section>}
    <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit scheduled class' : 'Schedule a class'} description="Choose 12-hour AM/PM start and end times, assigned trainer, room, and capacity." size="md" footer={<><button type="button" onClick={() => setModalOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" form="class-form" className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white">{editingId ? 'Save changes' : 'Add class'}</button></>}><form id="class-form" onSubmit={saveClass} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Class name<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Morning Power Flow" className={input} /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Category<input required list="class-categories" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Yoga, Strength, Mobility…" className={input} /><datalist id="class-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Assigned trainer<select required value={form.trainer} onChange={(event) => setForm({ ...form, trainer: event.target.value })} className={input}><option value="">Select a trainer</option>{trainers.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className={input} /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Room / area<input required value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} placeholder="Studio 1, Reformer Room…" className={input} /></label>
      <TwelveHourTimePicker label="Start time (12h)" value24={form.startTime || '07:00'} onChange24={(next) => setForm({ ...form, startTime: next })} />
      <TwelveHourTimePicker label="End time (12h)" value24={form.endTime || '08:00'} onChange24={(next) => setForm({ ...form, endTime: next })} />
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Capacity<input required type="number" min="1" step="1" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} className={input} /></label>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Description / coaching notes (optional)<textarea rows={2} value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Equipment needed, session intensity, or coaching focus..." className={`${input} resize-y py-2 font-normal`} /></label>
      {editingId && confirmedFor(bookings, editingId) > form.capacity && <p className="text-xs font-medium text-amber-800 dark:text-amber-300 sm:col-span-2">There are {confirmedFor(bookings, editingId)} confirmed bookings. Capacity cannot be reduced below this count.</p>}{error && <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-300 sm:col-span-2">{error}</p>}<p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400 sm:col-span-2">Trainer and room time conflicts on the selected date are checked automatically.</p></form></Modal>
  </div>;
}


export function ClassBookingsPage() {
  const { classes, bookings, setBookings, members, attendance, setAttendance, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<BookingWorkspaceTab>('All Reservations');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('All bookings');
  const [classId, setClassId] = useState('All classes');
  const [dateFilter, setDateFilter] = useState('All dates');
  const [modalOpen, setModalOpen] = useState(false);
  const [memberId, setMemberId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [error, setError] = useState('');
  const [bookingToDelete, setBookingToDelete] = useState<StaffClassBooking | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [visibleBookingCount, setVisibleBookingCount] = useState(8);

  const classesById = new Map(classes.map((item) => [item.id, item]));
  const membersById = new Map(members.map((item) => [item.id, item]));

  const searchedMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return members.slice(0, 8);
    const q = memberSearchQuery.toLowerCase();
    return members.filter((m) => `${m.name} ${m.email} ${m.phone}`.toLowerCase().includes(q)).slice(0, 8);
  }, [members, memberSearchQuery]);

  const visible = bookings.filter((item) => {
    const cl = classesById.get(item.classId), member = membersById.get(item.memberId);
    return Boolean(cl && member) && (state === 'All bookings' || item.status === state) && (classId === 'All classes' || item.classId === classId) && (dateFilter === 'All dates' || cl?.date === dateFilter) && `${member?.name} ${member?.email} ${member?.phone} ${cl?.name} ${cl?.trainer}`.toLowerCase().includes(query.trim().toLowerCase());
  });

  const pagedBookings = useMemo(() => visible.slice(0, visibleBookingCount), [visible, visibleBookingCount]);

  const activeClasses = classes.filter((item) => effectiveSessionStatus(item) === 'Scheduled');
  const openAdd = (presetClassId?: string) => {
    setMemberId(members[0]?.id || '');
    setMemberSearchQuery('');
    setSelectedClassId(presetClassId || activeClasses[0]?.id || '');
    setError('');
    setModalOpen(true);
  };
  const saveBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cl = classesById.get(selectedClassId), member = membersById.get(memberId);
    if (!cl || effectiveSessionStatus(cl) !== 'Scheduled' || !member) { setError('Choose a scheduled session and an existing member.'); return; }
    if (bookings.some((item) => item.classId === cl.id && item.memberId === member.id && item.status !== 'Cancelled')) { setError('This member already has an active booking or waitlist entry for this class.'); return; }
    const full = confirmedFor(bookings, cl.id) >= cl.capacity;
    try {
      await ApiClient.createBooking({ member_id: member.id, class_schedule_id: cl.id, booking_date: new Date().toISOString() });
      await refresh();
      setModalOpen(false); setError('');
      addToast({ type: full ? 'info' : 'success', title: full ? 'Added to waitlist' : 'Booking added', message: full ? 'The class is full; this booking is waitlisted.' : 'The roster and occupancy now reflect this booking.' });
    } catch (err: any) {
      setError(err.message || 'Failed to create booking.');
    }
  };
  const cancelBooking = async (booking: StaffClassBooking) => { if (!window.confirm('Cancel this booking?')) return; try { await ApiClient.cancelBooking(booking.id); await refresh(); addToast({ type: 'info', title: 'Booking cancelled', message: 'Booking status changed to Cancelled.' }); } catch (err: any) { addToast({ type: 'error', title: 'Cancellation failed', message: err.message || 'Could not cancel booking.' }); } };
  const promoteBooking = async (booking: StaffClassBooking) => {
    const cl = classesById.get(booking.classId);
    if (booking.status !== 'Waitlisted' || !cl || effectiveSessionStatus(cl) !== 'Scheduled') return;
    const nextInLine = bookings.filter((item) => item.classId === booking.classId && item.status === 'Waitlisted').sort((a, b) => a.bookedAt.localeCompare(b.bookedAt))[0];
    if (nextInLine?.id !== booking.id) { addToast({ type: 'info', title: 'Promote the next member first', message: 'Waitlist order follows the existing booking timestamps.' }); return; }
    if (confirmedFor(bookings, cl.id) >= cl.capacity) { addToast({ type: 'info', title: 'No seat available', message: 'The session is still at capacity.' }); return; }
    try {
      await ApiClient.updateBookingStatus(booking.id, 'confirmed');
      await refresh();
      addToast({ type: 'success', title: 'Waitlist entry promoted', message: `${membersById.get(booking.memberId)?.name || 'Member'} now has a confirmed reservation.` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Promotion failed', message: err.message || 'Could not promote waitlist entry.' });
    }
  };
  const confirmDeleteBooking = async () => {
    if (!bookingToDelete) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const memberName = membersById.get(bookingToDelete.memberId)?.name || 'Member';
      const className = classesById.get(bookingToDelete.classId)?.name || 'Class';
      await ApiClient.deleteBooking(bookingToDelete.id);
      await refresh();
      addToast({
        type: 'info',
        title: 'Reservation deleted',
        message: `Reservation for ${memberName} (${className}) removed.`,
      });
      setBookingToDelete(null);
    } catch {
      setDeleteError('Could not delete reservation. Please try again.');
      addToast({
        type: 'error',
        title: 'Deletion failed',
        message: 'Could not remove reservation.',
      });
    } finally {
      setDeleting(false);
    }
  };

  const confirmed = bookings.filter((item) => item.status === 'Confirmed').length;
  const waitlisted = bookings.filter((item) => item.status === 'Waitlisted').length;
  const cancelled = bookings.filter((item) => item.status === 'Cancelled').length;
  const clearFilters = () => { setQuery(''); setState('All bookings'); setClassId('All classes'); setDateFilter('All dates'); setVisibleBookingCount(8); };
  const tabs: BookingWorkspaceTab[] = ['All Reservations'];

  return <div className="mx-auto w-full max-w-[1440px]"><Header title="Booking Management" description="Manage individual member reservations, session waitlists, cancellations, and desk check-ins on one page." action={<button type="button" onClick={() => openAdd()} disabled={!members.length || !activeClasses.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:cursor-not-allowed disabled:opacity-50"><PlusIcon size="sm" />Book member</button>} /><PreviewNotice />
    <div role="tablist" aria-label="Booking management views" className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-studio-700 dark:bg-studio-900">
      {tabs.map((tabItem) => (
        <button
          key={tabItem}
          type="button"
          role="tab"
          aria-selected={activeTab === tabItem}
          onClick={() => setActiveTab(tabItem)}
          className="min-h-10 shrink-0 rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          {tabItem}
        </button>
      ))}
    </div>

    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Metric label="Confirmed" value={confirmed} detail="Active reservations" icon={CheckCircleIcon} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" /><Metric label="Waitlisted" value={waitlisted} detail="No confirmed seat yet" icon={ClockIcon} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" /><Metric label="Cancelled" value={cancelled} detail="History retained" icon={ActivityIcon} color="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" /></div>

    {activeTab === 'All Reservations' && (
      <>
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(3,minmax(145px,auto))]"><label className="relative block"><span className="sr-only">Search bookings by member or class</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleBookingCount(8); }} placeholder="Search member or class…" className={`${input} w-full pl-9`} /></label><select aria-label="Filter booking status" value={state} onChange={(event) => { setState(event.target.value); setVisibleBookingCount(8); }} className={input}><option>All bookings</option>{(['Confirmed', 'Waitlisted', 'Cancelled'] as const).map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter bookings by class" value={classId} onChange={(event) => { setClassId(event.target.value); setVisibleBookingCount(8); }} className={input}><option>All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Filter bookings by session date" type="date" value={dateFilter === 'All dates' ? '' : dateFilter} onChange={(event) => { setDateFilter(event.target.value || 'All dates'); setVisibleBookingCount(8); }} className={input} />{(query || state !== 'All bookings' || classId !== 'All classes' || dateFilter !== 'All dates') && <button type="button" onClick={clearFilters} className="min-h-10 px-2 text-left text-xs font-semibold text-rose-700 underline underline-offset-2 dark:text-rose-300">Clear filters</button>}</div>
        <section className={`${panel} overflow-hidden`}><div role="region" aria-label="Member booking table; scroll horizontally for all columns" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500"><table className="w-full min-w-[900px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:bg-studio-950 dark:text-slate-400"><tr><th className="px-4 py-3">Member</th><th className="px-3 py-3">Class / session</th><th className="px-3 py-3">Date / 12h time</th><th className="px-3 py-3">Reservation</th><th className="px-3 py-3">Occupancy</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{pagedBookings.map((booking) => { const cl = classesById.get(booking.classId)!, member = membersById.get(booking.memberId)!; const hasSeat = cl.status === 'Scheduled' && effectiveSessionStatus(cl) === 'Scheduled' && confirmedFor(bookings, cl.id) < cl.capacity; const nextInLine = bookings.filter((item) => item.classId === cl.id && item.status === 'Waitlisted').sort((a, b) => a.bookedAt.localeCompare(b.bookedAt))[0]; const isNextInLine = nextInLine?.id === booking.id; return <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><p className="text-sm font-semibold text-slate-900 dark:text-white">{member.name}</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{member.email} · {member.phone}</p></td><td className="px-3 py-3"><p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{cl.name}</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{cl.category} · {cl.trainer} · {cl.room}</p></td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{dateLabel(cl.date)} · {timeLabel(cl.startTime)} – {timeLabel(cl.endTime)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(booking.status)}`}>{booking.status}</span><p className="mt-1 text-[9px] text-slate-500 dark:text-slate-400">Booked {new Date(booking.bookedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}</p></td><td className="px-3 py-3 text-xs tabular-nums text-slate-600 dark:text-slate-300">{confirmedFor(bookings, cl.id)} / {cl.capacity}</td><td className="px-4 py-3"><div className="flex flex-wrap items-center gap-1.5">{booking.status === 'Waitlisted' && <button type="button" disabled={!hasSeat || !isNextInLine} title={!hasSeat ? 'Promote when a confirmed seat is available' : isNextInLine ? 'Promote into the available confirmed seat' : 'Promote the earliest waitlisted booking first'} onClick={() => promoteBooking(booking)} className="min-h-9 rounded-lg border border-emerald-200 px-2.5 text-[10px] font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-200">Promote</button>}{booking.status !== 'Cancelled' ? <button type="button" onClick={() => cancelBooking(booking)} className="min-h-9 rounded-lg border border-slate-200 px-2.5 text-[10px] font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:text-slate-200">Cancel</button> : <span className="py-2 text-[10px] text-slate-400">Cancelled</span>}<button type="button" onClick={() => { setDeleteError(''); setBookingToDelete(booking); }} className="min-h-9 rounded-lg border border-rose-200 px-2.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40">Delete</button></div></td></tr>; })}{visible.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No member reservations match. Book an existing member into a scheduled session or adjust filters.</td></tr>}</tbody></table></div>
        {visible.length > visibleBookingCount && (
          <div className="flex justify-center border-t border-slate-100 p-4 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setVisibleBookingCount((prev) => prev + 8)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200"
            >
              See More ({visible.length - visibleBookingCount} remaining)
            </button>
          </div>
        )}
        </section>
      </>
    )}

    <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add class booking" description="Choose an existing member and scheduled class." size="sm" footer={<><button type="button" onClick={() => setModalOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" form="booking-form" className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white">Add booking</button></>}><form id="booking-form" onSubmit={saveBooking} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          Find Member
        </label>
        <div className="relative">
          <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search member by name, phone, or email…"
            value={memberSearchQuery}
            onChange={(e) => setMemberSearchQuery(e.target.value)}
            className={`${input} w-full pl-9`}
          />
        </div>
        <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 dark:border-studio-700 dark:divide-studio-800">
          {searchedMembers.map((item) => {
            const isSelected = item.id === memberId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMemberId(item.id)}
                className={`w-full px-3 py-2 text-left text-xs transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-rose-50 text-rose-900 font-semibold dark:bg-rose-950/40 dark:text-rose-200'
                    : 'hover:bg-slate-50 dark:hover:bg-studio-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-[10px] text-slate-400">{item.phone} · {item.email}</p>
                </div>
                {isSelected && <span className="text-[10px] font-bold text-rose-600">Selected</span>}
              </button>
            );
          })}
          {searchedMembers.length === 0 && (
            <p className="p-3 text-center text-xs text-slate-400">No members match search query.</p>
          )}
        </div>
        {membersById.get(memberId) && (
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            Selected: <strong className="text-slate-900 dark:text-white">{membersById.get(memberId)?.name}</strong> ({membersById.get(memberId)?.phone})
          </p>
        )}
      </div>
      <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Scheduled class<select required value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className={input}>{activeClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {dateLabel(item.date)} ({timeLabel(item.startTime)}) · {confirmedFor(bookings, item.id)}/{item.capacity}</option>)}</select></label>{error && <p role="alert" className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}<p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400">A full class adds the record to its waitlist.</p></form></Modal>

    <Modal
      isOpen={Boolean(bookingToDelete)}
      onClose={() => {
        if (!deleting) {
          setBookingToDelete(null);
          setDeleteError('');
        }
      }}
      title="Delete Reservation"
      description="Confirm reservation deletion"
      size="sm"
      footer={
        <>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setBookingToDelete(null);
              setDeleteError('');
            }}
            className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={confirmDeleteBooking}
            className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {deleting ? 'Deleting…' : 'Confirm Delete'}
          </button>
        </>
      }
    >
      {bookingToDelete && (() => {
        const member = membersById.get(bookingToDelete.memberId);
        const cl = classesById.get(bookingToDelete.classId);
        return (
          <div className="space-y-3">
            <p className="text-sm text-slate-800 dark:text-slate-200">
              Are you sure you want to delete the reservation for <strong>{member?.name || 'this member'}</strong> in <strong>{cl?.name || 'this class'}</strong>{cl ? ` (${dateLabel(cl.date)} · ${timeLabel(cl.startTime)})` : ''}?
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              This reservation will be removed from your current browser preview workspace. Server-side permanent database deletion requires backend API integration.
            </p>
            {deleteError && (
              <p role="alert" className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                {deleteError}
              </p>
            )}
          </div>
        );
      })()}
    </Modal>
  </div>;
}

export function ClassAttendancePage() {
  const { classes, bookings, attendance, setAttendance, members, setMembers, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();
  const rosterClasses = classes.filter((item) => item.status === 'Scheduled' && bookings.some((booking) => booking.classId === item.id && booking.status === 'Confirmed'));
  const [selectedClassId, setSelectedClassId] = useState(rosterClasses[0]?.id || 'ALL');
  const [trainerFilter, setTrainerFilter] = useState('All trainers');
  const [dateFilter, setDateFilter] = useState('');
  const [query, setQuery] = useState('');
  const [state, setState] = useState('All states');
  const [graceMinutes, setGraceMinutes] = useState(10);

  useEffect(() => {
    setGraceMinutes(readStudioBookingSettings().lateGraceMinutes);
  }, []);

  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const classesById = new Map(classes.map((item) => [item.id, item]));
  const membersById = new Map(members.map((item) => [item.id, item]));
  const allTrainers = Array.from(new Set([...readStaffTeamTrainers(), ...classes.map((item) => item.trainer)].filter(Boolean))).sort();
  const sessionBookings = bookings.filter((item) => {
    if (item.status !== 'Confirmed') return false;
    const cl = classesById.get(item.classId);
    if (!cl) return false;
    if (selectedClassId && selectedClassId !== 'ALL' && item.classId !== selectedClassId) return false;
    if (trainerFilter !== 'All trainers' && cl.trainer !== trainerFilter) return false;
    if (dateFilter && cl.date !== dateFilter) return false;
    return true;
  });
  const attendanceByBooking = new Map(attendance.map((item) => [item.bookingId, item]));
  const statusOf = (booking: StaffClassBooking) => attendanceByBooking.get(booking.id)?.status || 'Expected';
  const visible = sessionBookings.filter((booking) => {
    const member = membersById.get(booking.memberId);
    const cl = classesById.get(booking.classId);
    return Boolean(member && cl) && `${member?.name} ${member?.email} ${member?.phone} ${cl?.name} ${cl?.trainer}`.toLowerCase().includes(query.trim().toLowerCase()) && (state === 'All states' || statusOf(booking) === state);
  });
  const present = sessionBookings.filter((booking) => statusOf(booking) === 'Present').length;
  const late = sessionBookings.filter((booking) => statusOf(booking) === 'Late').length;
  const absent = sessionBookings.filter((booking) => statusOf(booking) === 'Absent').length;
  const expected = Math.max(0, sessionBookings.length - present - late - absent);
  const setMemberAttendance = async (booking: StaffClassBooking, nextStatus: StaffAttendanceStatus) => {
    const previous = attendanceByBooking.get(booking.id);
    try {
      if (previous) {
        await ApiClient.correctAttendance(previous.id, nextStatus, 'Status updated from class attendance page');
      } else {
        await ApiClient.createAttendance({
          booking_id: booking.id,
          status: nextStatus,
          checked_in_at: nextStatus === 'Present' || nextStatus === 'Late' ? new Date().toISOString() : undefined,
        });
      }
      await refresh();
      addToast({ type: 'success', title: `Marked ${nextStatus.toLowerCase()}`, message: 'The attendance roster now reflects this record.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Attendance failed', message: err.message || 'Could not record attendance.' });
    }
  };
  const markAllPresent = async () => {
    if (!sessionBookings.length) return;
    const pendingBookings = sessionBookings.filter((item) => statusOf(item) === 'Expected');
    if (!pendingBookings.length) {
      addToast({ type: 'info', title: 'No pending attendance', message: 'Every roster member already has a recorded status.' });
      return;
    }
    if (!window.confirm(`Mark ${pendingBookings.length} roster member${pendingBookings.length === 1 ? '' : 's'} with no record as present? Existing attendance records will be preserved.`)) return;
    const now = new Date().toISOString();
    try {
      await Promise.all(pendingBookings.map((item) => ApiClient.createAttendance({
        booking_id: item.id,
        status: 'Present',
        checked_in_at: now,
      })));
      await refresh();
      addToast({ type: 'success', title: 'Roster marked present', message: `${pendingBookings.length} pending member${pendingBookings.length === 1 ? '' : 's'} marked present.` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Attendance failed', message: err.message || 'Could not mark attendance.' });
    }
  };
  return <div className="mx-auto w-full max-w-[1440px]"><Header title="Attendance & Check-in" description="Review scheduled class rosters, filter by session/date/trainer, and record Present, Late, or Absent attendance." action={<div className="flex flex-wrap items-center gap-2"><Link href="/admin/classes" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200">Class Schedule</Link><Link href="/admin/bookings" className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200">Bookings &amp; Waitlists</Link></div>} /><PreviewNotice />
    <section className={`${panel} mb-4 p-4 sm:p-5`}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_repeat(2,minmax(160px,1fr))_auto]">
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Scheduled session
          <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)} className={input}>
            <option value="ALL">All scheduled sessions ({rosterClasses.length})</option>
            {rosterClasses.map((item) => <option key={item.id} value={item.id}>{item.name} · {dateLabel(item.date)} · {timeLabel(item.startTime)}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Trainer filter
          <select value={trainerFilter} onChange={(event) => setTrainerFilter(event.target.value)} className={input}>
            <option value="All trainers">All trainers</option>
            {allTrainers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          Session date
          <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className={input} />
        </label>
        <div className="flex items-end gap-2">
          <button type="button" disabled={!expected} onClick={markAllPresent} className="min-h-10 w-full rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:border-emerald-900 dark:text-emerald-200">Mark pending present</button>
        </div>
      </div>
      {selectedClass ? (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">{selectedClass.name} · {dateLabel(selectedClass.date, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })} · {timeLabel(selectedClass.startTime)} – {timeLabel(selectedClass.endTime)} · {selectedClass.trainer} · {selectedClass.room} · Late arrival threshold: {graceMinutes} min</p>
      ) : (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">Viewing attendance across all matching sessions · Configured late threshold: {graceMinutes} minutes after start time.</p>
      )}
    </section>
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Present" value={present} detail="Marked present on time" icon={CheckCircleIcon} color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" />
      <Metric label="Late" value={late} detail={`Checked in > ${graceMinutes}m after start`} icon={ClockIcon} color="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" />
      <Metric label="Expected" value={expected} detail="Confirmed booking · no record" icon={UsersIcon} color="bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" />
      <Metric label="Absent" value={absent} detail="Marked no-show / absent" icon={ActivityIcon} color="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" />
    </div>
    <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(200px,1fr)_auto_auto]"><label className="relative block"><span className="sr-only">Search attendance roster</span><SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search member, session, or trainer…" className={`${input} w-full pl-9`} /></label><select aria-label="Filter attendance status" value={state} onChange={(event) => setState(event.target.value)} className={input}><option>All states</option><option>Present</option><option>Late</option><option>Absent</option><option>Expected</option></select>{(query || state !== 'All states' || trainerFilter !== 'All trainers' || dateFilter || selectedClassId !== 'ALL') && <button type="button" onClick={() => { setQuery(''); setState('All states'); setTrainerFilter('All trainers'); setDateFilter(''); setSelectedClassId('ALL'); }} className="min-h-10 px-2 text-xs font-semibold text-rose-700 underline">Reset filters</button>}</div>
    <section className={`${panel} overflow-hidden`}><div className="border-b border-slate-100 px-4 py-3 dark:border-studio-800"><h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">Attendance Roster &amp; History <span className="font-sans text-xs font-medium text-slate-500">{visible.length} shown of {sessionBookings.length} confirmed</span></h2></div><div role="region" aria-label="Attendance roster; scroll horizontally for all columns" tabIndex={0} className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500"><table className="w-full min-w-[880px] text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500 dark:bg-studio-950 dark:text-slate-400"><tr><th className="px-4 py-3">Member</th><th className="px-3 py-3">Session &amp; Trainer</th><th className="px-3 py-3">Date &amp; 12h Time</th><th className="px-3 py-3">Attendance Status</th><th className="px-3 py-3">Check-in Time</th><th className="px-4 py-3">Record Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-studio-800">{visible.map((booking) => { const member = membersById.get(booking.memberId)!; const cl = classesById.get(booking.classId)!; const record = attendanceByBooking.get(booking.id); const status = record?.status || 'Expected'; return <tr key={booking.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-800/50"><td className="px-4 py-3"><p className="text-xs font-semibold text-slate-900 dark:text-white">{member.name}</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{member.email} · {member.phone}</p></td><td className="px-3 py-3"><p className="text-xs font-semibold text-slate-900 dark:text-white">{cl.name}</p><p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{cl.trainer} · {cl.room}</p></td><td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{dateLabel(cl.date)} · {timeLabel(cl.startTime)} – {timeLabel(cl.endTime)}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusTone(status)}`}>{status}</span></td><td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">{record?.checkedInAt ? new Date(record.checkedInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => setMemberAttendance(booking, 'Present')} className="min-h-8 rounded-lg border border-emerald-200 px-2.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-200">Present</button><button type="button" onClick={() => setMemberAttendance(booking, 'Late')} className="min-h-8 rounded-lg border border-amber-200 px-2.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-200">Late</button><button type="button" onClick={() => setMemberAttendance(booking, 'Absent')} className="min-h-8 rounded-lg border border-rose-200 px-2.5 text-[10px] font-semibold text-rose-800 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-200">Absent</button></div></td></tr>; })}{visible.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">No roster members match these filters.</td></tr>}</tbody></table></div><div className="border-t border-slate-100 p-4 dark:border-studio-800"><p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Manual check-in &amp; attendance log</p><p className="mt-1 text-[10px] leading-5 text-slate-500 dark:text-slate-400">Attendance records sync immediately across Admin, Reception, and Trainer Studio views.</p></div></section>
  </div>;
}

export {
  ClassOperationsPage as AdminClassesPage,
  ClassBookingsPage as AdminBookingsPage,
  ClassAttendancePage as AdminAttendancePage,
};
