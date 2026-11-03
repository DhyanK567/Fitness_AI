'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarIcon, ClockIcon, MapPinIcon } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { usePublishedStudioEvents, type StudioEvent } from '@/lib/studioEvents';
import { useAuthContext } from '@/lib/auth/AuthContext';

const dateTime = (value: string) => new Date(value).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const videoEmbed = (raw?: string) => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`;
    if (url.hostname.endsWith('youtube.com') && url.pathname === '/watch') return `https://www.youtube-nocookie.com/embed/${url.searchParams.get('v')}`;
    if (url.hostname.endsWith('youtube.com') && url.pathname.startsWith('/embed/')) return raw;
    if (url.hostname.endsWith('vimeo.com')) return `https://player.vimeo.com/video/${url.pathname.split('/').filter(Boolean).pop()}`;
  } catch { return null; }
  return null;
};

function MemberEventsContent() {
  const events = usePublishedStudioEvents();
  const searchParams = useSearchParams();
  const paramEventId = searchParams?.get('eventId');
  const { user } = useAuthContext();
  const { addToast } = useToast();
  const [selected, setSelected] = useState<StudioEvent | null>(null);
  const [registered, setRegistered] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem('fitness-studio:event-registrations') || '[]');
      if (Array.isArray(stored)) setRegistered(stored.filter((item) => item?.memberId === user?.memberId && item?.status === 'Registered').map((item) => item.eventId));
    } catch { setRegistered([]); }
  }, [user?.memberId]);

  useEffect(() => {
    if (paramEventId && events.length > 0) {
      const target = events.find((item) => String(item.id) === paramEventId);
      if (target) {
        setSelected(target);
      }
    }
  }, [paramEventId, events]);

  const upcoming = useMemo(() => events.filter((event) => new Date(event.endAt).getTime() >= Date.now()).sort((a, b) => a.startAt.localeCompare(b.startAt)), [events]);
  const past = useMemo(() => events.filter((event) => new Date(event.endAt).getTime() < Date.now()).sort((a, b) => b.startAt.localeCompare(a.startAt)), [events]);
  const register = (event: StudioEvent) => {
    if (!user?.memberId) { addToast({ type: 'error', title: 'Member profile unavailable', message: 'Sign in again to record your event registration.' }); return; }
    try {
      const key = 'fitness-studio:event-registrations';
      const prior = JSON.parse(window.localStorage.getItem(key) || '[]');
      const rows = Array.isArray(prior) ? prior : [];
      if (rows.some((item) => item?.eventId === event.id && item?.memberId === user.memberId && item?.status === 'Registered')) { setRegistered((current) => current.includes(event.id) ? current : [...current, event.id]); return; }
      rows.unshift({ id: globalThis.crypto.randomUUID(), eventId: event.id, memberId: user.memberId, registeredAt: new Date().toISOString(), status: 'Registered', checkedInAt: null });
      window.localStorage.setItem(key, JSON.stringify(rows));
      setRegistered((current) => [...current, event.id]);
      addToast({ type: 'success', title: 'Event registration recorded', message: `Your registration for ${event.title} is saved on this device. No external notification was sent.` });
    } catch { addToast({ type: 'error', title: 'Could not save registration', message: 'Browser storage is unavailable. Please try again.' }); }
  };
  const card = (event: StudioEvent) => <article key={event.id} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
    {event.coverImageUrl ? <img src={event.coverImageUrl} alt={event.title} className="aspect-[16/8] w-full bg-slate-100 object-cover" /> : <div className="flex aspect-[16/8] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-teal-50 text-sm font-semibold text-slate-500">{event.category}</div>}
    <div className="space-y-4 p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">{event.category}</span><span className="text-xs text-slate-500">{new Date(event.startAt).getTime() < Date.now() ? 'Past event' : 'Upcoming'}</span></div>
      <div><h2 className="font-serif text-xl font-bold text-slate-900">{event.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">{event.description}</p></div>
      <div className="space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600"><p className="flex gap-2"><CalendarIcon className="h-4 w-4 text-rose-600" />{dateTime(event.startAt)}</p><p className="flex gap-2"><ClockIcon className="h-4 w-4 text-teal-700" />Ends {dateTime(event.endAt)}</p><p className="flex gap-2"><MapPinIcon className="h-4 w-4 text-teal-700" />{event.venue}</p></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSelected(event)} className="min-h-10 rounded-full border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:border-rose-300">View details</button>{new Date(event.endAt).getTime() >= Date.now() && <button type="button" onClick={() => register(event)} disabled={registered.includes(event.id)} className="min-h-10 rounded-full bg-[#E11D48] px-4 text-xs font-bold text-white disabled:bg-emerald-700">{registered.includes(event.id) ? 'Interest noted' : 'I’m interested'}</button>}</div>
    </div>
  </article>;
  return <div className="space-y-8">
    <header className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8"><span className="mb-1 block text-xs font-bold uppercase tracking-[0.2em] text-[#E11D48]">RETREATS &amp; MASTERCLASSES</span><h1 className="font-serif text-3xl font-bold text-slate-900">Workshops &amp; Events</h1><p className="mt-2 text-sm text-slate-500">Studio events shared by your team.</p></header>
    {upcoming.length > 0 ? <section className="grid gap-6 md:grid-cols-2">{upcoming.map(card)}</section> : <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h2 className="font-serif text-xl font-bold text-slate-800">No upcoming events yet</h2><p className="mt-2 text-sm text-slate-500">Published studio events will appear here.</p></div>}
    {past.length > 0 && <section className="space-y-4"><h2 className="font-serif text-2xl font-bold text-slate-900">Past events</h2><div className="grid gap-6 md:grid-cols-2">{past.map(card)}</div></section>}
    <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.title} description={selected ? `${selected.category} · ${dateTime(selected.startAt)}` : undefined} size="lg" footer={<button type="button" onClick={() => setSelected(null)} className="min-h-10 rounded-full bg-[#E11D48] px-5 text-xs font-bold text-white">Close</button>}>{selected && <div className="space-y-4">{selected.coverImageUrl && <img src={selected.coverImageUrl} alt={selected.title} className="max-h-72 w-full rounded-2xl object-cover" />}<p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selected.description}</p><div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"><p><strong>Schedule:</strong> {dateTime(selected.startAt)} – {dateTime(selected.endAt)}</p><p className="mt-2"><strong>Location:</strong> {selected.venue}</p></div>{selected.videoUrl && (videoEmbed(selected.videoUrl) ? <iframe title={`${selected.title} video`} src={videoEmbed(selected.videoUrl)!} className="aspect-video w-full rounded-2xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <a href={selected.videoUrl} target="_blank" rel="noreferrer" className="inline-flex text-sm font-semibold text-rose-700 underline">Open event video</a>)}</div>}</Modal>
  </div>;
}

export default function MemberEventsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading events...</div>}>
      <MemberEventsContent />
    </Suspense>
  );
}
