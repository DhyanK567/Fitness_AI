'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import { formatIstDateTime } from '@/lib/localization/india';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  MapPinIcon,
  UsersIcon,
  SparklesIcon,
  ArrowRightIcon,
  LockIcon,
} from '@/components/ui/icons';

export interface StudioEventItem {
  id: string;
  title: string;
  category: string;
  description?: string;
  startAt: string;
  endAt?: string;
  venue: string;
  organizer: string;
  capacity?: number | null;
  imageUrl?: string;
}

interface MemberExploreEventsProps {
  studioName?: string;
}

function parseEventDate(startAt: string) {
  try {
    const d = new Date(startAt);
    if (isNaN(d.getTime())) return null;
    const month = d.toLocaleDateString('en-IN', { month: 'short', timeZone: 'Asia/Kolkata' }).toUpperCase();
    const day = d.toLocaleDateString('en-IN', { day: '2-digit', timeZone: 'Asia/Kolkata' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).toUpperCase();
    return { month, day, time };
  } catch {
    return null;
  }
}

/**
 * Category-specific visual palettes and decorative geometry
 * Eliminates repetitive dark placeholders without assigning fake photographs.
 */
function getCategoryVisualConfig(category: string) {
  const cat = (category || '').toLowerCase();

  if (cat.includes('wellness') || cat.includes('meditat') || cat.includes('sound') || cat.includes('breath')) {
    return {
      gradient: 'from-emerald-950 via-teal-900 to-slate-900',
      badgeBg: 'bg-emerald-950/70 border-emerald-400/30 text-emerald-200',
      accentColor: 'text-emerald-300',
      iconBg: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30',
      ringColor: 'border-emerald-500/20',
      motif: 'Restorative Vitality',
    };
  }

  if (cat.includes('workshop') || cat.includes('master') || cat.includes('intensiv') || cat.includes('learn')) {
    return {
      gradient: 'from-purple-950 via-rose-950 to-slate-900',
      badgeBg: 'bg-purple-950/70 border-rose-400/30 text-rose-200',
      accentColor: 'text-rose-300',
      iconBg: 'bg-rose-500/20 text-rose-200 border-rose-400/30',
      ringColor: 'border-rose-500/20',
      motif: 'Studio Masterclass',
    };
  }

  if (cat.includes('community') || cat.includes('open') || cat.includes('house') || cat.includes('circle')) {
    return {
      gradient: 'from-amber-950 via-stone-900 to-slate-950',
      badgeBg: 'bg-amber-950/70 border-amber-400/30 text-amber-200',
      accentColor: 'text-amber-300',
      iconBg: 'bg-amber-500/20 text-amber-200 border-amber-400/30',
      ringColor: 'border-amber-400/20',
      motif: 'Collective Gathering',
    };
  }

  if (cat.includes('yoga') || cat.includes('pilates') || cat.includes('flow') || cat.includes('movement')) {
    return {
      gradient: 'from-rose-950 via-pink-950 to-slate-900',
      badgeBg: 'bg-rose-950/70 border-pink-400/30 text-pink-200',
      accentColor: 'text-pink-300',
      iconBg: 'bg-pink-500/20 text-pink-200 border-pink-400/30',
      ringColor: 'border-pink-500/20',
      motif: 'Mindful Practice',
    };
  }

  // Default General Palette
  return {
    gradient: 'from-slate-900 via-rose-950 to-slate-950',
    badgeBg: 'bg-slate-900/70 border-white/20 text-rose-200',
    accentColor: 'text-rose-300',
    iconBg: 'bg-white/10 text-rose-200 border-white/20',
    ringColor: 'border-rose-400/15',
    motif: 'Studio Event',
  };
}

export function MemberExploreEvents({ studioName = 'Fitness AI' }: MemberExploreEventsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<StudioEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StudioEventItem | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (tenantHost) {
        headers['x-tenant-host'] = tenantHost;
      }

      const apiBase = resolveClientApiBaseUrl();
      const res = await fetch(`${apiBase}/api/v1/events/public`, {
        method: 'GET',
        headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        if (res.status === 404) {
          setEvents([]);
          return;
        }
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const payload = await res.json();
      let rawList: unknown[] = [];
      if (Array.isArray(payload)) {
        rawList = payload;
      } else if (payload && typeof payload === 'object' && Array.isArray((payload as any).data)) {
        rawList = (payload as any).data;
      } else if (payload && typeof payload === 'object' && Array.isArray((payload as any).events)) {
        rawList = (payload as any).events;
      }

      const now = new Date();
      // Genuine filtering: published upcoming events only, strictly excluding draft, cancelled, or past events
      const upcoming = rawList
        .filter((item: any) => {
          if (!item || typeof item !== 'object') return false;
          if (item.cancelled === true || String(item.cancelled).toLowerCase() === 'true') return false;
          if (item.published === false || item.isPublished === false || item.status === 'draft' || item.status === 'Draft') return false;
          const s = new Date(item.startAt);
          return !isNaN(s.getTime()) && s >= now;
        })
        .sort((a: any, b: any) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
        .map((item: any) => ({
          id: String(item.id),
          title: String(item.title || 'Studio Gathering'),
          category: String(item.category || 'Workshop'),
          description: item.description ? String(item.description) : undefined,
          startAt: item.startAt,
          endAt: item.endAt,
          venue: String(item.venue || 'Main Studio Floor'),
          organizer: String(item.organizer || 'Lead Instructor'),
          capacity: typeof item.capacity === 'number' ? item.capacity : null,
          imageUrl: item.imageUrl ? String(item.imageUrl) : undefined,
        }));

      setEvents(upcoming);
    } catch (err: any) {
      setError(err?.message || 'Unable to load studio events.');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const updateScrollButtons = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  useEffect(() => {
    if (showAllEvents) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    updateScrollButtons();
    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [events, showAllEvents, updateScrollButtons]);

  const scrollByDirection = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth < 640 ? el.clientWidth * 0.88 : el.clientWidth < 1024 ? (el.clientWidth - 24) / 2 : (el.clientWidth - 48) / 3;
    const offset = direction === 'left' ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const renderEventCard = (event: StudioEventItem, isCarousel: boolean) => {
    const parsedDate = parseEventDate(event.startAt);
    const visual = getCategoryVisualConfig(event.category);
    const cardWidthClasses = isCarousel
      ? 'w-[85vw] max-w-[340px] sm:w-[360px] md:w-[calc((100%-24px)/2)] md:max-w-none lg:w-[calc((100%-48px)/3)] shrink-0 snap-start'
      : 'w-full';

    return (
      <article
        key={event.id}
        className={`${cardWidthClasses} rounded-[2.25rem] border border-slate-200/90 bg-white overflow-hidden shadow-[0_10px_35px_rgba(15,23,42,0.06)] hover:shadow-[0_20px_50px_rgba(15,23,42,0.12)] hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between min-h-[520px]`}
      >
        <div>
          {/* Media Header Container with Distinct Category Visuals */}
          <div className={`relative h-48 sm:h-52 w-full overflow-hidden bg-gradient-to-br ${visual.gradient}`}>
            {event.imageUrl ? (
              <Image
                src={event.imageUrl}
                alt={event.title}
                fill
                unoptimized
                className="object-cover transition-transform duration-700 hover:scale-105 motion-reduce:transform-none"
              />
            ) : (
              /* Category-Specific Decorative Composition */
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
                <div className={`absolute -right-8 -top-8 h-40 w-40 rounded-full border ${visual.ringColor}`} />
                <div className={`absolute -left-10 -bottom-10 h-48 w-48 rounded-full border ${visual.ringColor}`} />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.08),transparent_70%)]" />

                <span className={`relative flex h-13 w-13 items-center justify-center rounded-2xl ${visual.iconBg} backdrop-blur-md mb-2 shadow-inner border`}>
                  <SparklesIcon className="h-6 w-6" />
                </span>
                
                <span className="relative font-serif text-sm font-semibold tracking-wide text-white/95 drop-shadow-sm">
                  {event.category}
                </span>
                <span className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60 mt-0.5">
                  {visual.motif}
                </span>
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/15 to-transparent pointer-events-none" />

            {/* Top-Left Floating Date Badge */}
            {parsedDate && (
              <div className="absolute top-4 left-4 flex flex-col items-center rounded-xl bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md text-slate-900 leading-tight border border-white/50">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800">
                  {parsedDate.month}
                </span>
                <span className="font-serif text-xl font-black">
                  {parsedDate.day}
                </span>
              </div>
            )}

            {/* Top-Right Category Pill */}
            <div className={`absolute top-4 right-4 inline-flex items-center gap-1.5 rounded-full ${visual.badgeBg} px-3 py-1 text-[10px] font-bold uppercase tracking-wider backdrop-blur-md border shadow-sm`}>
              <SparklesIcon className="h-2.5 w-2.5" />
              <span>{event.category}</span>
            </div>
          </div>

          {/* Content Section */}
          <div className="p-6 sm:p-7">
            <h3 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-slate-950 min-h-[3rem] flex items-center">
              {event.title}
            </h3>

            {event.description && (
              <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-2">
                {event.description}
              </p>
            )}

            {/* Event Metadata with Clear Hierarchy & Readability */}
            <div className="mt-5 space-y-3.5 border-t border-slate-100 pt-5">
              <div className="flex items-start gap-2.5">
                <CalendarIcon className="h-4.5 w-4.5 text-rose-800 shrink-0 mt-0.5" />
                <div>
                  <span className="block text-[15px] sm:text-base font-bold text-slate-950 tracking-tight">
                    {formatIstDateTime(event.startAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <MapPinIcon className="h-4.5 w-4.5 text-rose-800 shrink-0" />
                <span className="text-[14.5px] font-medium text-slate-800 line-clamp-1">{event.venue}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <UsersIcon className="h-4.5 w-4.5 text-rose-800 shrink-0" />
                <span className="text-xs text-slate-600">
                  Led by <strong className="text-slate-900 font-semibold">{event.organizer}</strong>
                  {typeof event.capacity === 'number' && event.capacity > 0 && (
                    <span className="text-slate-400"> &bull; {event.capacity} total spots</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Informational Action Area: View Event Details without Registration */}
        <div className="mt-auto p-6 sm:p-7 pt-0">
          <button
            type="button"
            onClick={() => setSelectedEvent(event)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-300/90 bg-white px-5 text-xs font-bold uppercase tracking-wider text-slate-800 transition-all duration-200 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900 shadow-xs active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2"
          >
            <span>View Event Details</span>
            <ArrowRightIcon className="h-3.5 w-3.5 text-rose-800" />
          </button>
        </div>
      </article>
    );
  };

  return (
    <section id="events" className="relative bg-white px-4 py-16 sm:px-6 sm:py-24 lg:px-8 border-t border-slate-200/70">
      <div className="mx-auto max-w-7xl">
        
        {/* Section Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-800">
              <CalendarIcon className="h-3.5 w-3.5 text-rose-700" />
              <span>{studioName} &bull; Gatherings &amp; Intensives</span>
            </span>
            <h2 className="mt-3 font-serif text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
              Upcoming Studio Events
            </h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              Join resident teachers and visiting practitioners for immersive masterclasses, community circles, and seasonal movement intensives.
            </p>
          </div>

          {/* Action Area: View All Events Toggle & Carousel Arrows */}
          {events.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setShowAllEvents((prev) => !prev)}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full border border-slate-300/90 bg-white px-5 text-xs font-bold uppercase tracking-wider text-slate-800 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95"
              >
                <span>{showAllEvents ? 'Show Carousel' : 'View All Events'}</span>
              </button>

              {!showAllEvents && events.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollByDirection('left')}
                    disabled={!canScrollLeft}
                    aria-label="Previous events"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-700 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollByDirection('right')}
                    disabled={!canScrollRight}
                    aria-label="Next events"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-700 shadow-sm transition-all hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRightIcon className="h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="mt-10">
          {loading ? (
            <div className="flex min-h-[340px] items-center justify-center rounded-[2.5rem] border border-slate-200/80 bg-[#FAF8F5] p-12">
              <div className="flex flex-col items-center gap-3">
                <div className="h-9 w-9 animate-spin rounded-full border-2 border-rose-800 border-t-transparent" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Loading studio events schedule...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-8 text-center text-xs text-amber-900 shadow-sm">
              <p className="font-semibold text-sm">{error}</p>
              <button
                type="button"
                onClick={fetchEvents}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-amber-800 px-6 text-xs font-bold uppercase tracking-wider text-white hover:bg-amber-900 transition"
              >
                Retry
              </button>
            </div>
          ) : events.length === 0 ? (
            /* Clean compact empty state */
            <div className="mx-auto max-w-lg rounded-[2rem] border border-slate-200/80 bg-[#FAF8F5] p-8 sm:p-10 text-center shadow-sm">
              <div className="mx-auto flex h-13 w-13 items-center justify-center rounded-full bg-rose-50 text-rose-800 mb-4">
                <CalendarIcon className="h-7 w-7" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900">
                Upcoming Studio Events
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                No upcoming events scheduled at this time. New workshops and masterclasses are announced weekly.
              </p>
            </div>
          ) : showAllEvents ? (
            /* View All Events: All upcoming events revealed in full responsive grid */
            <div
              role="region"
              aria-label="All upcoming studio events"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2"
            >
              {events.map((event) => renderEventCard(event, false))}
            </div>
          ) : (
            /* Carousel View */
            <div
              ref={scrollContainerRef}
              tabIndex={0}
              role="region"
              aria-label="Upcoming studio events carousel"
              /* Responsive sizing: exactly 3 cards on desktop (lg), 2 cards on tablet (md), 1 card on mobile */
              className="flex gap-6 overflow-x-auto pb-8 pt-2 scroll-smooth snap-x snap-mandatory focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 rounded-3xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {events.map((event) => renderEventCard(event, true))}
            </div>
          )}
        </div>
      </div>

      {/* Informational Event Details Modal (No registration navigation required) */}
      {selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[2.25rem] bg-white border border-slate-200/90 shadow-2xl p-6 sm:p-8 text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4">
              <span className="inline-block rounded-full bg-rose-50 border border-rose-200/80 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-rose-900">
                {selectedEvent.category} &bull; Studio Gathering
              </span>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                aria-label="Close event details"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
              >
                ✕
              </button>
            </div>

            <h3 id="event-modal-title" className="mt-4 font-serif text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
              {selectedEvent.title}
            </h3>

            {/* Event Metadata */}
            <div className="mt-6 rounded-2xl bg-[#FAF8F5] border border-slate-200/80 p-5 space-y-3.5 text-sm">
              <div className="flex items-start gap-3">
                <CalendarIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Date &amp; Schedule</span>
                  <span className="font-bold text-slate-900 text-base">{formatIstDateTime(selectedEvent.startAt)}</span>
                  {selectedEvent.endAt && (
                    <span className="text-xs text-slate-600 block mt-0.5">Concludes: {formatIstDateTime(selectedEvent.endAt)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPinIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Studio Sanctuary</span>
                  <span className="font-semibold text-slate-900">{selectedEvent.venue}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <UsersIcon className="h-5 w-5 text-rose-800 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Lead Facilitator</span>
                  <span className="font-semibold text-slate-900">{selectedEvent.organizer}</span>
                  {typeof selectedEvent.capacity === 'number' && selectedEvent.capacity > 0 && (
                    <span className="text-xs text-slate-600 block mt-0.5">Maximum Capacity: {selectedEvent.capacity} attendees</span>
                  )}
                </div>
              </div>
            </div>

            {/* Event Overview & Description */}
            <div className="mt-6">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">About This Gathering</h4>
              <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                {selectedEvent.description || 'Join our resident instructors for this curated movement and mindfulness intensive designed to cultivate mindful presence, precision, and physical balance.'}
              </p>
            </div>

            {/* Informational Guidance Notice (No registration form) */}
            <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-slate-600 flex items-start gap-2.5">
              <SparklesIcon className="h-4 w-4 text-rose-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="text-slate-900">Studio Informational Notice:</strong> This event schedule is informational. For inquiries or studio bookings, please visit the studio front desk or sign in through your member portal.
              </p>
            </div>

            {/* Close Button */}
            <div className="mt-6 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="w-full rounded-full bg-slate-900 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-slate-800 transition-colors"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
