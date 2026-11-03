'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon, ClockIcon, MapPinIcon, PlusIcon, SearchIcon, UsersIcon } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { currentStaffStudio, useAdminWorkspaceData, type StaffEvent, type StaffEventRegistration } from './AdminDataProvider';

type EventStatus = 'Upcoming' | 'Happening now' | 'Completed' | 'Cancelled';
type EventQuickView = 'All' | 'Upcoming' | 'Past' | 'Cancelled';

const input = 'min-h-10 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-600/20 dark:border-studio-700 dark:bg-studio-950 dark:text-white';
const panel = 'min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-subtle dark:border-studio-700 dark:bg-studio-900';

const eventStatus = (item: StaffEvent, now = Date.now()): EventStatus =>
  item.cancelled
    ? 'Cancelled'
    : now < new Date(item.startAt).getTime()
      ? 'Upcoming'
      : now < new Date(item.endAt).getTime()
        ? 'Happening now'
        : 'Completed';

const dateTimeLabel = (value: string) =>
  new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

const isValidMediaUrl = (value?: string) => {
  if (!value?.trim()) return true;
  if (value.startsWith('data:image/')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const durationLabel = (startAt: string, endAt: string) => {
  const minutes = Math.max(0, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`
    : `${minutes} min`;
};

const categoryTheme = (category: string) => {
  const value = category.toLowerCase();
  if (value.includes('workshop'))
    return {
      band: 'from-violet-50 to-white dark:from-violet-950/40 dark:to-studio-900',
      icon: 'bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-200',
    };
  if (value.includes('retreat'))
    return {
      band: 'from-teal-50 to-white dark:from-teal-950/40 dark:to-studio-900',
      icon: 'bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-200',
    };
  if (value.includes('community'))
    return {
      band: 'from-amber-50 to-white dark:from-amber-950/40 dark:to-studio-900',
      icon: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    };
  return {
    band: 'from-rose-50 to-white dark:from-rose-950/40 dark:to-studio-900',
    icon: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
  };
};

const emptyEvent = (): Omit<StaffEvent, 'id'> => ({
  title: '',
  category: '',
  description: '',
  startAt: '',
  endAt: '',
  venue: currentStaffStudio.name,
  organizer: '',
  capacity: null,
  cancelled: false,
  published: false,
  coverImageUrl: '',
});

export function AdminEventsPage() {
  const { events, setEvents, eventRegistrations, setEventRegistrations, members, refresh } = useAdminWorkspaceData();
  const { addToast } = useToast();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All events');
  const [publicationFilter, setPublicationFilter] = useState('All publication states');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [quickView, setQuickView] = useState<EventQuickView>('All');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'registrations'>('date');

  const [eventOpen, setEventOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<StaffEvent, 'id'>>(emptyEvent());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saving = useRef(false);

  const [attendeeModalEvent, setAttendeeModalEvent] = useState<StaffEvent | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const registering = useRef(false);
  const [memberId, setMemberId] = useState('');
  const [attendeeQuery, setAttendeeQuery] = useState('');
  const [attendeeStatusFilter, setAttendeeStatusFilter] = useState('All statuses');

  const [detailEvent, setDetailEvent] = useState<StaffEvent | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StaffEvent | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffEvent | null>(null);
  const [registrationToCancel, setRegistrationToCancel] = useState<StaffEventRegistration | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const activeEvents = events.filter((item) => !item.cancelled);
  const allRegistered = eventRegistrations.filter((item) => item.status === 'Registered');
  const activeRegistrations = allRegistered.filter((item) =>
    events.some((event) => event.id === item.eventId && !event.cancelled)
  );

  const categories = [...new Set(events.map((item) => item.category).filter(Boolean))].sort();

  const filteredEvents = useMemo(() => {
    return events
      .filter((item) => {
        const text = `${item.title} ${item.description} ${item.category} ${item.venue} ${item.organizer}`.toLowerCase();
        const state = eventStatus(item, now);
        const date = item.startAt.slice(0, 10);
        const quickMatch =
          quickView === 'All' ||
          (quickView === 'Upcoming' && (state === 'Upcoming' || state === 'Happening now')) ||
          (quickView === 'Past' && state === 'Completed') ||
          (quickView === 'Cancelled' && state === 'Cancelled');
        return (
          text.includes(query.trim().toLowerCase()) &&
          quickMatch &&
          (statusFilter === 'All events' || state === statusFilter) &&
          (publicationFilter === 'All publication states' ||
            (publicationFilter === 'Published' ? Boolean(item.published) : !item.published)) &&
          (categoryFilter === 'All categories' || item.category === categoryFilter) &&
          (!dateFrom || date >= dateFrom) &&
          (!dateTo || date <= dateTo)
        );
      })
      .sort((a, b) =>
        sortBy === 'title'
          ? a.title.localeCompare(b.title)
          : sortBy === 'registrations'
            ? allRegistered.filter((reg) => reg.eventId === b.id).length -
              allRegistered.filter((reg) => reg.eventId === a.id).length
            : a.startAt.localeCompare(b.startAt)
      );
  }, [events, query, statusFilter, publicationFilter, categoryFilter, quickView, dateFrom, dateTo, sortBy, now, allRegistered]);

  const upcomingCount = activeEvents.filter((item) => eventStatus(item, now) === 'Upcoming').length;
  const happeningCount = activeEvents.filter((item) => eventStatus(item, now) === 'Happening now').length;
  const completedCount = activeEvents.filter((item) => eventStatus(item, now) === 'Completed').length;

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyEvent());
    setErrors({});
    setEventOpen(true);
  };

  const openEdit = (item: StaffEvent) => {
    const { videoUrl: _unusedVideoUrl, ...rest } = item;
    setEditingId(item.id);
    setForm({ ...rest, startAt: item.startAt.slice(0, 16), endAt: item.endAt.slice(0, 16) });
    setErrors({});
    setDetailEvent(null);
    setEventOpen(true);
  };

  const closeForm = () => {
    setEventOpen(false);
    setEditingId(null);
    setForm(emptyEvent());
    setErrors({});
  };

  const handleCoverImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setForm((current) => ({ ...current, coverImageUrl: reader.result as string }));
        setErrors((current) => ({ ...current, coverImageUrl: '' }));
      }
    };
    reader.readAsDataURL(file);
  };

  const saveEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving.current) return;
    const mode = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
    const nextErrors: Record<string, string> = {};
    const start = new Date(form.startAt).getTime();
    const end = new Date(form.endAt).getTime();
    if (!form.title.trim()) nextErrors.title = 'Enter an event title.';
    if (!form.category.trim()) nextErrors.category = 'Enter an event type.';
    if (!form.venue.trim()) nextErrors.venue = 'Enter a venue or location.';
    if (!form.startAt || !Number.isFinite(start)) nextErrors.startAt = 'Choose a valid start date and time.';
    if (!form.endAt || !Number.isFinite(end)) nextErrors.endAt = 'Choose a valid end date and time.';
    else if (Number.isFinite(start) && end <= start) nextErrors.endAt = 'The end must be after the start.';
    if (mode === 'publish') {
      if (!form.description.trim()) nextErrors.description = 'Add a description before publishing.';
      if (!form.coverImageUrl?.trim()) nextErrors.coverImageUrl = 'Add a cover image before publishing.';
      if (Number.isFinite(end) && end <= Date.now()) nextErrors.endAt = 'Published events must end in the future.';
    }
    if (form.coverImageUrl?.trim() && !isValidMediaUrl(form.coverImageUrl))
      nextErrors.coverImageUrl = 'Use a valid image URL or uploaded image.';
    if (form.capacity !== null && (!Number.isInteger(form.capacity) || form.capacity < 1))
      nextErrors.capacity = 'Enter a positive whole number, or leave capacity blank.';
    const currentCount = editingId ? allRegistered.filter((item) => item.eventId === editingId).length : 0;
    if (form.capacity !== null && form.capacity < currentCount)
      nextErrors.capacity = `Capacity cannot be lower than its ${currentCount} active registration${currentCount === 1 ? '' : 's'}.`;
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    saving.current = true;
    const { videoUrl: _removedVideo, ...cleanForm } = form;
    const payload = {
      title: form.title.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      startAt: new Date(form.startAt).toISOString(),
      endAt: new Date(form.endAt).toISOString(),
      venue: form.venue.trim(),
      organizer: form.organizer.trim(),
      capacity: form.capacity ?? undefined,
      published: mode === 'draft' ? false : mode === 'publish' ? true : Boolean(form.published),
    };
    try {
      if (editingId) {
        await ApiClient.updateEvent(editingId, payload);
      } else {
        await ApiClient.createEvent(payload);
      }
      await refresh();
      closeForm();
      saving.current = false;
      addToast({
        type: 'success',
        title: editingId ? 'Event updated' : 'Event saved',
        message: payload.published
          ? 'The published event is now available in the member portal.'
          : 'Saved as an unpublished draft.',
      });
    } catch (err: any) {
      saving.current = false;
      setErrors({ _form: err.message || 'Failed to save event.' });
      addToast({ type: 'error', title: 'Save failed', message: err.message || 'Could not save event.' });
    }
  };

  const togglePublished = async (item: StaffEvent) => {
    if (!item.published) {
      const missing = [
        !item.title.trim() && 'title',
        !item.category.trim() && 'category',
        !item.description.trim() && 'description',
        !item.venue.trim() && 'location',
        !item.coverImageUrl?.trim() && 'cover image',
        !item.startAt && 'start date',
        !item.endAt && 'end date',
      ].filter(Boolean);
      if (
        missing.length ||
        new Date(item.endAt).getTime() <= Date.now() ||
        new Date(item.endAt).getTime() <= new Date(item.startAt).getTime()
      ) {
        addToast({
          type: 'error',
          title: 'Event is not ready to publish',
          message: missing.length ? `Add ${missing.join(', ')} before publishing.` : 'Choose a valid future event schedule before publishing.',
        });
        return;
      }
    }
    try {
      await ApiClient.updateEvent(item.id, { published: !item.published });
      await refresh();
      addToast({
        type: 'success',
        title: item.published ? 'Event unpublished' : 'Event published',
        message: item.published ? 'It is no longer visible in the member portal.' : 'It is now visible in the member portal.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Publish failed', message: err.message || 'Could not update publication status.' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      await ApiClient.deleteEvent(id);
      await refresh();
      setDeleteTarget(null);
      setDetailEvent(null);
      setAttendeeModalEvent(null);
      addToast({ type: 'success', title: 'Event deleted', message: 'The event and its registrations were removed.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Deletion failed', message: err.message || 'Could not delete event.' });
    }
  };

  const confirmCancellation = async () => {
    if (!cancelTarget || cancelTarget.cancelled) return;
    try {
      await ApiClient.deleteEvent(cancelTarget.id);
      await refresh();
      addToast({
        type: 'info',
        title: 'Event cancelled',
        message: 'Registrations and check-in history remain for review; no notifications were sent.',
      });
      setCancelTarget(null);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cancellation failed', message: err.message || 'Could not cancel event.' });
    }
  };

  const registerMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (registering.current) return;
    registering.current = true;
    const target = attendeeModalEvent || detailEvent;
    if (!target || target.cancelled) {
      registering.current = false;
      return;
    }
    if (eventStatus(target, now) !== 'Upcoming') {
      addToast({ type: 'error', title: 'Registration is closed', message: 'Registration is available only before the event starts.' });
      registering.current = false;
      return;
    }
    if (!memberId) {
      addToast({ type: 'error', title: 'Choose a member', message: 'Select an existing member record to register.' });
      registering.current = false;
      return;
    }
    if (activeRegistrations.some((item) => item.eventId === target.id && item.memberId === memberId)) {
      addToast({ type: 'error', title: 'Already registered', message: 'This member already has an active registration for this event.' });
      registering.current = false;
      return;
    }
    const currentRegs = allRegistered.filter((item) => item.eventId === target.id).length;
    if (target.capacity !== null && currentRegs >= target.capacity) {
      addToast({ type: 'error', title: 'Event is at capacity', message: 'This event has reached its maximum capacity limit.' });
      registering.current = false;
      return;
    }
    const member = members.find((m) => m.id === memberId);
    try {
      await ApiClient.registerForEvent(target.id, {
        registrant_name: member?.name || memberId,
        member_id: memberId,
        registrant_phone: member?.phone,
        registrant_email: member?.email,
      });
      await refresh();
      setRegisterOpen(false);
      setMemberId('');
      registering.current = false;
      addToast({
        type: 'success',
        title: 'Registration added',
        message: 'The member has been added to the attendee roster for this event.',
      });
    } catch (err: any) {
      registering.current = false;
      addToast({ type: 'error', title: 'Registration failed', message: err.message || 'Could not register member for event.' });
    }
  };

  const cancelRegistration = async () => {
    if (!registrationToCancel || registrationToCancel.status !== 'Registered') return;
    try {
      const target = attendeeModalEvent || detailEvent;
      const eventId = target?.id || registrationToCancel.eventId;
      await ApiClient.cancelEventRegistration(eventId, registrationToCancel.id);
      await refresh();
      setRegistrationToCancel(null);
      addToast({
        type: 'info',
        title: 'Registration cancelled',
        message: 'The registration was cancelled and capacity was freed.',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Cancellation failed', message: err.message || 'Could not cancel registration.' });
    }
  };

  const checkIn = async (registration: StaffEventRegistration) => {
    const target = attendeeModalEvent || detailEvent;
    if (!target || eventStatus(target, now) !== 'Happening now') return;
    if (registration.checkedInAt) {
      addToast({ type: 'info', title: 'Already checked in', message: 'Duplicate check-in was prevented.' });
      return;
    }
    try {
      const eventId = target.id;
      await ApiClient.checkInEventRegistration(eventId, registration.id);
      await refresh();
      addToast({ type: 'success', title: 'Check-in recorded', message: 'Member check-in was recorded for this event.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Check-in failed', message: err.message || 'Could not record check-in.' });
    }
  };

  const clearFilters = () => {
    setQuery('');
    setStatusFilter('All events');
    setCategoryFilter('All categories');
    setPublicationFilter('All publication states');
    setQuickView('All');
    setDateFrom('');
    setDateTo('');
    setSortBy('date');
  };

  const tone = (status: EventStatus) =>
    status === 'Happening now'
      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
      : status === 'Upcoming'
        ? 'bg-sky-50 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200'
        : status === 'Completed'
          ? 'bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-300'
          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200';

  const fieldError = (key: string) =>
    errors[key] && <span role="alert" className="text-[11px] font-medium text-rose-700 dark:text-rose-300">{errors[key]}</span>;

  // Active modal attendee roster
  const activeModalTarget = attendeeModalEvent || detailEvent;
  const modalRoster = activeModalTarget
    ? eventRegistrations
        .filter((item) => item.eventId === activeModalTarget.id)
        .filter((item) => attendeeStatusFilter === 'All statuses' || item.status === attendeeStatusFilter)
        .map((reg) => ({ registration: reg, member: members.find((m) => m.id === reg.memberId) }))
        .filter((row) => row.member && `${row.member.name} ${row.member.email} ${row.member.phone}`.toLowerCase().includes(attendeeQuery.trim().toLowerCase()))
    : [];

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end dark:border-studio-800">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700 dark:text-rose-300">
            Studio workspace · {currentStaffStudio.name} · Preview records
          </p>
          <h1 className="mt-2 font-serif text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">
            Events
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Plan studio experiences, manage attendee registrations, and record event-day check-ins in one unified workspace.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          <PlusIcon size="sm" />
          Create Event
        </button>
      </header>

      {/* Top Essential Metric Cards */}
      <section aria-label="Events overview metrics" className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Total Events</p>
              <p className="mt-2 font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{events.length}</p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
              <CalendarIcon size="sm" />
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">All studio workshops and retreat sessions</p>
        </div>

        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Upcoming Events</p>
              <p className="mt-2 font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-white">
                {upcomingCount + happeningCount}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-200">
              <ClockIcon size="sm" />
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Scheduled and actively happening events</p>
        </div>

        <div className={`${panel} p-4 sm:p-5`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Active Registrations</p>
              <p className="mt-2 font-serif text-3xl font-bold tabular-nums text-slate-950 dark:text-white">
                {activeRegistrations.length}
              </p>
            </div>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">
              <UsersIcon size="sm" />
            </span>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Confirmed member registrations across events</p>
        </div>
      </section>

      {/* ONE UNIFIED EVENTS WORKSPACE */}
      <section className={`${panel} overflow-hidden`}>
        {/* Search & Filter Toolbar */}
        <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-studio-800">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-950 dark:text-white">Events Workspace</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Showing {filteredEvents.length} of {events.length} studio events
              </p>
            </div>
            <label className="relative w-full sm:max-w-sm">
              <span className="sr-only">Search event title, description, venue or organizer</span>
              <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events, venues, hosts…"
                className={`${input} w-full pl-9`}
              />
            </label>
          </div>

          <div className="mt-4 flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Quick event views">
            {(['All', 'Upcoming', 'Past', 'Cancelled'] as EventQuickView[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={quickView === item}
                onClick={() => {
                  setQuickView(item);
                  setStatusFilter('All events');
                }}
                className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                  quickView === item
                    ? 'bg-rose-700 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-studio-800'
                }`}
              >
                {item}
                {item === 'All'
                  ? ` · ${events.length}`
                  : item === 'Upcoming'
                    ? ` · ${upcomingCount + happeningCount}`
                    : item === 'Past'
                      ? ` · ${completedCount}`
                      : ` · ${events.filter((event) => event.cancelled).length}`}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(130px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)_auto]">
            <select
              aria-label="Filter events by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={input}
            >
              <option>All events</option>
              {(['Upcoming', 'Happening now', 'Completed', 'Cancelled'] as EventStatus[]).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <select
              aria-label="Filter by publication state"
              value={publicationFilter}
              onChange={(event) => setPublicationFilter(event.target.value)}
              className={input}
            >
              <option>All publication states</option>
              <option>Published</option>
              <option>Draft</option>
            </select>
            <select
              aria-label="Filter events by category"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={input}
            >
              <option>All categories</option>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-500 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-400">
              From
              <input
                aria-label="Filter start date"
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none dark:text-white"
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 text-[10px] font-semibold text-slate-500 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-400">
              To
              <input
                aria-label="Filter end date"
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-800 outline-none dark:text-white"
              />
            </label>
            <select
              aria-label="Sort events"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
              className={input}
            >
              <option value="date">Sort: date</option>
              <option value="title">Sort: title</option>
              <option value="registrations">Sort: registrations</option>
            </select>
          </div>
        </div>

        {/* Unified Event List */}
        {filteredEvents.length ? (
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 sm:p-5">
            {filteredEvents.map((item) => {
              const status = eventStatus(item, now);
              const eventRegistrationsList = eventRegistrations.filter((reg) => reg.eventId === item.id);
              const registrations = eventRegistrationsList.filter((reg) => reg.status === 'Registered').length;
              const checkInCount = eventRegistrationsList.filter((reg) => reg.status === 'Registered' && reg.checkedInAt).length;
              const style = categoryTheme(item.category);
              const isFull = !item.cancelled && item.capacity !== null && registrations >= item.capacity;

              return (
                <article
                  key={item.id}
                  className={`${panel} flex flex-col justify-between overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md`}
                >
                  <div>
                    {item.coverImageUrl && (
                      <img src={item.coverImageUrl} alt={item.title} className="h-36 w-full object-cover" />
                    )}
                    <div className={`flex min-h-[96px] items-start justify-between bg-gradient-to-br ${style.band} p-4`}>
                      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${style.icon}`}>
                        <CalendarIcon size="md" />
                      </span>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tone(status)}`}>
                          {status}
                        </span>
                        {item.published ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-200">
                            Published
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600 dark:bg-studio-800 dark:text-slate-300">
                            Draft
                          </span>
                        )}
                        {isFull && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-100">
                            Full
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4 pb-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-studio-800 dark:text-slate-200">
                          {item.category}
                        </span>
                      </div>
                      <h3 className="mt-2 font-serif text-lg font-bold leading-snug text-slate-950 dark:text-white">
                        {item.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        {item.description || 'No event description added yet.'}
                      </p>

                      <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-600 dark:border-studio-800 dark:text-slate-300">
                        <p className="flex items-start gap-2">
                          <ClockIcon size="xs" className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            {dateTimeLabel(item.startAt)} · {durationLabel(item.startAt, item.endAt)}
                          </span>
                        </p>
                        <p className="flex items-start gap-2">
                          <MapPinIcon size="xs" className="mt-0.5 shrink-0 text-slate-400" />
                          <span>
                            {item.venue}
                            {item.organizer ? ` · Host: ${item.organizer}` : ''}
                          </span>
                        </p>
                      </div>

                      {/* Registration & Check-in Details */}
                      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-studio-800 dark:bg-studio-950">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-300 font-medium">Registrations</span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                            {registrations}
                            {item.capacity === null ? ' registered' : ` / ${item.capacity}`}
                          </span>
                        </div>
                        {item.capacity !== null && (
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-studio-800">
                            <span
                              className="block h-full rounded-full bg-rose-600"
                              style={{ width: `${Math.min(100, (registrations / item.capacity) * 100)}%` }}
                            />
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span>
                            {item.capacity === null
                              ? 'No capacity limit'
                              : `${Math.max(0, item.capacity - registrations)} seats available`}
                          </span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">
                            {checkInCount} checked in
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Toolbar — Exactly 3 buttons: Edit, Delete, Cancel */}
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 p-4 pt-3 dark:border-studio-800">
                    <button
                      type="button"
                      onClick={() => openEdit(item)}
                      className="flex-1 min-h-9 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:text-slate-200 dark:hover:bg-studio-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      className="flex-1 min-h-9 rounded-lg border border-rose-200 px-3 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setCancelTarget(item)}
                      disabled={item.cancelled}
                      className="flex-1 min-h-9 rounded-lg border border-amber-200 px-3 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-900/60 dark:text-amber-300 dark:hover:bg-amber-950/40"
                    >
                      {item.cancelled ? 'Cancelled' : 'Cancel'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-14 text-center">
            <CalendarIcon size="lg" className="mx-auto text-rose-700" />
            <h3 className="mt-3 font-serif text-xl font-bold text-slate-950 dark:text-white">
              {events.length ? 'No events match these filters' : 'Your studio calendar is ready'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500 dark:text-slate-400">
              {events.length
                ? 'Adjust your search or filters to see more events.'
                : 'Create an event to start planning studio experiences and member workshops.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              {events.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold dark:border-studio-700"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-3 text-xs font-semibold text-white"
              >
                <PlusIcon size="sm" />
                Create Event
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CREATE / EDIT EVENT MODAL */}
      <Modal
        isOpen={eventOpen}
        onClose={closeForm}
        title={editingId ? 'Edit event' : 'Create event'}
        description="Save a draft for later or publish it to the member portal on this device."
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeForm}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              value="draft"
              form="staff-event-form"
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Save draft
            </button>
            <button
              type="submit"
              value="publish"
              form="staff-event-form"
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Save &amp; publish
            </button>
          </>
        }
      >
        <form id="staff-event-form" onSubmit={saveEvent} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 sm:col-span-2 dark:text-slate-200">
            Event title
            <input
              autoFocus
              required
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              className={input}
            />
            {fieldError('title')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Type / category
            <input
              required
              list="staff-event-categories"
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value })}
              className={input}
            />
            <datalist id="staff-event-categories">
              {categories.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            {fieldError('category')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Venue / location
            <input
              required
              value={form.venue}
              onChange={(event) => setForm({ ...form, venue: event.target.value })}
              className={input}
            />
            {fieldError('venue')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Starts
            <input
              required
              type="datetime-local"
              value={form.startAt}
              onChange={(event) => setForm({ ...form, startAt: event.target.value })}
              className={input}
            />
            {fieldError('startAt')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Ends
            <input
              required
              type="datetime-local"
              value={form.endAt}
              onChange={(event) => setForm({ ...form, endAt: event.target.value })}
              className={input}
            />
            {fieldError('endAt')}
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Organizer / host
            <input
              value={form.organizer}
              onChange={(event) => setForm({ ...form, organizer: event.target.value })}
              className={input}
              placeholder="Optional"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Capacity
            <input
              type="number"
              min="1"
              step="1"
              value={form.capacity ?? ''}
              onChange={(event) =>
                setForm({ ...form, capacity: event.target.value === '' ? null : Number(event.target.value) })
              }
              className={input}
              placeholder="Leave blank for no limit"
            />
            {fieldError('capacity')}
          </label>
          <div className="grid gap-1.5 sm:col-span-2">
            <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Cover image URL
              <input
                type="url"
                value={form.coverImageUrl ?? ''}
                onChange={(event) => setForm({ ...form, coverImageUrl: event.target.value })}
                className={input}
                placeholder="https://…"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Sample covers:</span>
                {[
                  ['Pilates / Reformer', 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80'],
                  ['Mobility / Retreat', 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80'],
                  ['Dance / Movement', 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?auto=format&fit=crop&w=1200&q=80'],
                ].map(([label, url]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setForm({ ...form, coverImageUrl: url })}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-300"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:border-rose-300 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200">
                <span>Upload image file</span>
                <input type="file" accept="image/*" onChange={handleCoverImageUpload} className="sr-only" />
              </label>
            </div>
            {form.coverImageUrl && isValidMediaUrl(form.coverImageUrl) && (
              <img src={form.coverImageUrl} alt="Event cover preview" className="mt-1 h-28 w-full rounded-xl object-cover" />
            )}
            {fieldError('coverImageUrl')}
          </div>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 sm:col-span-2 dark:text-slate-200">
            Description
            <textarea
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              className={`${input} min-h-20 py-2`}
              placeholder="Describe this event for members."
            />
          </label>
          {fieldError('description')}
          <p className="text-[10px] leading-5 text-slate-500 sm:col-span-2 dark:text-slate-400">
            Publishing requires a future schedule, description and cover image. Changes are stored on this device and shared with the member portal.
          </p>
        </form>
      </Modal>

      {/* EVENT DETAILS MODAL */}
      <Modal
        isOpen={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        title={detailEvent?.title}
        description={detailEvent ? `${detailEvent.category} · ${eventStatus(detailEvent, now)}` : undefined}
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                if (!detailEvent) return;
                setAttendeeModalEvent(detailEvent);
                setDetailEvent(null);
              }}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Manage attendees ({allRegistered.filter((item) => item.eventId === detailEvent?.id).length})
            </button>
            <button
              type="button"
              onClick={() => detailEvent && openEdit(detailEvent)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Edit event
            </button>
            <button
              type="button"
              onClick={() => setDetailEvent(null)}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Close
            </button>
          </>
        }
      >
        {detailEvent && (
          <div className="space-y-3 text-xs text-slate-700 dark:text-slate-200">
            <p>
              <strong>Schedule:</strong> {dateTimeLabel(detailEvent.startAt)} · {durationLabel(detailEvent.startAt, detailEvent.endAt)}
            </p>
            <p>
              <strong>Ends:</strong> {dateTimeLabel(detailEvent.endAt)}
            </p>
            <p>
              <strong>Venue:</strong> {detailEvent.venue}
            </p>
            {detailEvent.coverImageUrl && (
              <img src={detailEvent.coverImageUrl} alt={detailEvent.title} className="max-h-56 w-full rounded-xl object-cover" />
            )}
            <p>
              <strong>Publication:</strong> {detailEvent.published ? 'Published to members' : 'Draft · admin only'}
            </p>
            {detailEvent.organizer && (
              <p>
                <strong>Host:</strong> {detailEvent.organizer}
              </p>
            )}
            <p>
              <strong>Capacity:</strong> {detailEvent.capacity ?? 'No limit set'}
            </p>
            <p>
              <strong>{detailEvent.cancelled ? 'Retained registrations' : 'Active registrations'}:</strong>{' '}
              {allRegistered.filter((item) => item.eventId === detailEvent.id).length}
              {detailEvent.capacity === null ? '' : ` / ${detailEvent.capacity}`}
            </p>
            <div className="rounded-xl border border-slate-200 p-3 dark:border-studio-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">Attendee roster preview</h3>
              {allRegistered
                .filter((item) => item.eventId === detailEvent.id)
                .map((registration) => members.find((member) => member.id === registration.memberId))
                .filter((member): member is (typeof members)[number] => !!member)
                .map((member) => (
                  <p key={member.id} className="mt-2 text-slate-600 dark:text-slate-300">
                    {member.name} · {member.email}
                  </p>
                ))}
              {allRegistered.every((item) => item.eventId !== detailEvent.id) && (
                <p className="mt-2 text-slate-500 dark:text-slate-400">No active member registrations.</p>
              )}
            </div>
            <p>{detailEvent.description || 'No event description was added.'}</p>
          </div>
        )}
      </Modal>

      {/* ATTENDEE MANAGEMENT & CHECK-IN MODAL */}
      <Modal
        isOpen={!!attendeeModalEvent}
        onClose={() => setAttendeeModalEvent(null)}
        title={attendeeModalEvent ? `${attendeeModalEvent.title} — Attendees & Check-in` : 'Attendees'}
        description={
          attendeeModalEvent
            ? `${dateTimeLabel(attendeeModalEvent.startAt)} · ${attendeeModalEvent.venue} · ${allRegistered.filter((r) => r.eventId === attendeeModalEvent.id).length}${attendeeModalEvent.capacity !== null ? ` / ${attendeeModalEvent.capacity}` : ''} registered`
            : undefined
        }
        size="lg"
        footer={
          <>
            {attendeeModalEvent && (
              <button
                type="button"
                onClick={() => {
                  setMemberId(members[0]?.id ?? '');
                  setRegisterOpen(true);
                }}
                disabled={
                  !members.length ||
                  eventStatus(attendeeModalEvent, now) !== 'Upcoming' ||
                  attendeeModalEvent.cancelled ||
                  (attendeeModalEvent.capacity !== null &&
                    allRegistered.filter((r) => r.eventId === attendeeModalEvent.id).length >= attendeeModalEvent.capacity)
                }
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-3.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlusIcon size="xs" />
                Register member
              </button>
            )}
            <button
              type="button"
              onClick={() => setAttendeeModalEvent(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200"
            >
              Close
            </button>
          </>
        }
      >
        {attendeeModalEvent && (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="relative flex-1">
                <span className="sr-only">Search attendees</span>
                <SearchIcon size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={attendeeQuery}
                  onChange={(e) => setAttendeeQuery(e.target.value)}
                  placeholder="Search attendee name, email, phone…"
                  className={`${input} w-full pl-9`}
                />
              </label>
              <select
                aria-label="Filter attendee status"
                value={attendeeStatusFilter}
                onChange={(e) => setAttendeeStatusFilter(e.target.value)}
                className={`${input} shrink-0`}
              >
                <option>All statuses</option>
                <option>Registered</option>
                <option>Cancelled</option>
              </select>
            </div>

            {modalRoster.length ? (
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-studio-800 dark:border-studio-700">
                {modalRoster.map(
                  ({ registration, member }) =>
                    member && (
                      <div key={registration.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900 dark:text-white">{member.name}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                registration.status === 'Registered'
                                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                                  : 'bg-slate-100 text-slate-600 dark:bg-studio-800 dark:text-slate-300'
                              }`}
                            >
                              {registration.status}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {member.email} · {member.phone} · Registered {dateTimeLabel(registration.registeredAt)}
                          </p>
                          {registration.checkedInAt && (
                            <p className="mt-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              ✓ Checked in {dateTimeLabel(registration.checkedInAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => checkIn(registration)}
                            disabled={
                              !!registration.checkedInAt ||
                              registration.status !== 'Registered' ||
                              eventStatus(attendeeModalEvent, now) !== 'Happening now'
                            }
                            className="min-h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            {registration.checkedInAt ? 'Checked in' : 'Manual check-in'}
                          </button>
                          {registration.status === 'Registered' && (
                            <button
                              type="button"
                              onClick={() => setRegistrationToCancel(registration)}
                              className="min-h-8 rounded-lg border border-rose-200 px-2.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300"
                            >
                              Cancel registration
                            </button>
                          )}
                        </div>
                      </div>
                    )
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-500 dark:border-studio-800 dark:text-slate-400">
                No attendee registrations found for this event.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* REGISTER MEMBER MODAL */}
      <Modal
        isOpen={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="Register existing member"
        description="Select a member record to register for this event."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRegisterOpen(false)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="event-register-form"
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Add registration
            </button>
          </>
        }
      >
        <form id="event-register-form" onSubmit={registerMember}>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
            Member
            <select
              required
              value={memberId}
              onChange={(event) => setMemberId(event.target.value)}
              className={`${input} w-full`}
            >
              {members.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.email}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-[10px] leading-5 text-slate-500 dark:text-slate-400">
            No payment or external registration message will be created.
          </p>
        </form>
      </Modal>

      {/* CANCEL EVENT CONFIRMATION */}
      <Modal
        isOpen={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel this event?"
        description="The event will remain in the preview history and registrations will be retained."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Keep event
            </button>
            <button
              type="button"
              onClick={confirmCancellation}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Confirm cancellation
            </button>
          </>
        }
      >
        {cancelTarget && (
          <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
            Cancel <strong>{cancelTarget.title}</strong>? This changes its status to Cancelled.
          </p>
        )}
      </Modal>

      {/* DELETE EVENT CONFIRMATION */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete this event?"
        description="This removes the event and its registrations from this device."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Keep event
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Delete event
            </button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.
          </p>
        )}
      </Modal>

      {/* CANCEL REGISTRATION CONFIRMATION */}
      <Modal
        isOpen={!!registrationToCancel}
        onClose={() => setRegistrationToCancel(null)}
        title="Cancel registration?"
        description="The registration is retained in history and its place becomes available."
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setRegistrationToCancel(null)}
              className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold dark:border-studio-700 dark:text-slate-200"
            >
              Keep registration
            </button>
            <button
              type="button"
              onClick={cancelRegistration}
              className="min-h-10 rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white"
            >
              Cancel registration
            </button>
          </>
        }
      >
        {registrationToCancel && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            This action changes the registration status to Cancelled.
          </p>
        )}
      </Modal>
    </div>
  );
}
