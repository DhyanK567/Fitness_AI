'use client';

import { useEffect, useState } from 'react';

export type StudioEvent = {
  id: string;
  title: string;
  category: string;
  description: string;
  startAt: string;
  endAt: string;
  venue: string;
  organizer: string;
  capacity: number | null;
  cancelled: boolean;
  published?: boolean;
  coverImageUrl?: string;
  videoUrl?: string;
};

export const STUDIO_EVENTS_KEY = 'fitness-studio:events';

const futureDateOffset = (days: number, time: string) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${time}`;
};

export const DEFAULT_STUDIO_EVENTS: StudioEvent[] = [
  {
    id: 'evt-reformer-masterclass',
    title: 'Spine & Core Reformer Masterclass',
    category: 'Workshop',
    description: 'An intensive 90-minute reformer and mat alignment workshop focused on deep core control, thoracic mobility, and breath pacing. Includes individualized posture feedback.',
    startAt: futureDateOffset(4, '10:00'),
    endAt: futureDateOffset(4, '11:30'),
    venue: 'Indiranagar Studio · Studio A',
    organizer: 'Ananya Sharma',
    capacity: 16,
    cancelled: false,
    published: true,
    coverImageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80',
    videoUrl: '',
  },
  {
    id: 'evt-recovery-soundbath',
    title: 'Sunday Mobility & Sound Bath Retreat',
    category: 'Retreat',
    description: 'Guided myofascial release, restorative breathwork, and acoustic sound bath session designed for active recovery after high-volume training weeks.',
    startAt: futureDateOffset(8, '17:00'),
    endAt: futureDateOffset(8, '18:30'),
    venue: 'Indiranagar Studio · Studio B',
    organizer: 'Kavita Iyer',
    capacity: 20,
    cancelled: false,
    published: true,
    coverImageUrl: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1200&q=80',
    videoUrl: '',
  },
  {
    id: 'evt-choreo-lab-draft',
    title: 'Contemporary Rhythm & Floorwork Lab',
    category: 'Community',
    description: 'Open-level movement lab exploring musicality, transitions, and expressive floorwork sequences ahead of the seasonal studio showcase.',
    startAt: futureDateOffset(12, '18:00'),
    endAt: futureDateOffset(12, '19:30'),
    venue: 'Indiranagar Studio · Studio C',
    organizer: 'Meera Nair',
    capacity: 24,
    cancelled: false,
    published: false,
    coverImageUrl: 'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?auto=format&fit=crop&w=1200&q=80',
    videoUrl: '',
  },
];

const isStudioEvent = (item: unknown): item is StudioEvent => {
  if (!item || typeof item !== 'object') return false;
  const event = item as Partial<StudioEvent>;
  return typeof event.id === 'string' && typeof event.title === 'string' && typeof event.category === 'string'
    && typeof event.description === 'string' && typeof event.startAt === 'string' && Number.isFinite(new Date(event.startAt).getTime())
    && typeof event.endAt === 'string' && Number.isFinite(new Date(event.endAt).getTime())
    && typeof event.venue === 'string' && typeof event.organizer === 'string' && typeof event.cancelled === 'boolean'
    && (event.capacity === null || typeof event.capacity === 'number')
    && (event.published === undefined || typeof event.published === 'boolean')
    && (event.coverImageUrl === undefined || typeof event.coverImageUrl === 'string')
    && (event.videoUrl === undefined || typeof event.videoUrl === 'string');
};

export function readStudioEvents(): StudioEvent[] {
  try {
    const raw = window.localStorage.getItem(STUDIO_EVENTS_KEY);
    if (raw === null) return DEFAULT_STUDIO_EVENTS;
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isStudioEvent) : [];
  } catch {
    return DEFAULT_STUDIO_EVENTS;
  }
}

export function usePublishedStudioEvents() {
  const [events, setEvents] = useState<StudioEvent[]>([]);
  useEffect(() => {
    const refresh = () => setEvents(readStudioEvents().filter((event) => event.published && !event.cancelled));
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('fitness-studio:events-updated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('fitness-studio:events-updated', refresh);
    };
  }, []);
  return events;
}

export function publishStudioEvents(events: StudioEvent[]) {
  try {
    window.localStorage.setItem(STUDIO_EVENTS_KEY, JSON.stringify(events));
    window.dispatchEvent(new Event('fitness-studio:events-updated'));
    return true;
  } catch {
    return false;
  }
}
