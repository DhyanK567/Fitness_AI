'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import {
  ClockIcon,
  XIcon,
  UserCheckIcon,
  UserIcon,
  SparklesIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@/components/ui/icons';

interface ClassRecord {
  id: string;
  name: string;
  category: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  trainer: string;
  room?: string | null;
  capacity: number;
  status: string;
}

interface BookingRecord {
  id: string;
  classId: string;
  memberId: string;
  status: string;
  bookedAt: string;
  className?: string;
  category?: string;
  trainer?: string;
  startTime?: string;
  endTime?: string;
  classDate?: string;
  room?: string;
}

const CATEGORY_IMAGES: Record<string, string> = {
  'Yoga': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80',
  'Hatha Yoga': 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80',
  'Pilates': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80',
  'Strength': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80',
  'HIIT': 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
  'Wellness': 'https://images.unsplash.com/photo-1512290900672-1f4961817730?auto=format&fit=crop&w=600&q=80',
  'Mobility': 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80',
};

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?auto=format&fit=crop&w=600&q=80';

export const PortalClasses: React.FC = () => {
  const { user, decrementCredit } = useAuthContext();
  const { addToast } = useToast();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [myBookings, setMyBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'schedule' | 'my-bookings'>('schedule');
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);

  // Filters
  const [selectedDayKey, setSelectedDayKey] = useState<string>('all');
  const [selectedDiscipline, setSelectedDiscipline] = useState('All Classes');
  const [selectedTrainer, setSelectedTrainer] = useState('All Instructors');

  // Modals
  const [coachBioModal, setCoachBioModal] = useState<{
    name: string;
    title: string;
    experience: string;
    specialty: string;
    avatarUrl: string;
  } | null>(null);
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [preferredTrainer, setPreferredTrainer] = useState('Anita Roy');
  const [trainerFocus, setTrainerFocus] = useState('Form Correction & Personal Alignment');
  const [trainerNotes, setTrainerNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [fetchedClasses, fetchedBookings] = await Promise.all([
        ApiClient.getClasses().catch(() => []),
        ApiClient.getMemberBookings(user?.id || '').catch(() => []),
      ]);

      const classList = Array.isArray(fetchedClasses) ? fetchedClasses : [];
      setClasses(classList as unknown as ClassRecord[]);

      const bookingList = Array.isArray(fetchedBookings) ? fetchedBookings : [];
      setMyBookings(bookingList as unknown as BookingRecord[]);
    } catch {
      addToast({
        type: 'error',
        title: 'Schedule Fetch Failed',
        message: 'Could not load studio class timetable. Please refresh.',
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, addToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Dynamic Disciplines
  const disciplines = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => {
      if (c.category) set.add(c.category);
    });
    return ['All Classes', ...Array.from(set)];
  }, [classes]);

  // Dynamic Trainers
  const trainers = useMemo(() => {
    const set = new Set<string>();
    classes.forEach((c) => {
      if (c.trainer) set.add(c.trainer);
    });
    return ['All Instructors', ...Array.from(set)];
  }, [classes]);

  // Dynamic Days from classes
  const dayOptions = useMemo(() => {
    const daysMap = new Map<string, { key: string; label: string; dateStr: string; count: number }>();

    // Always include 'all'
    daysMap.set('all', { key: 'all', label: 'All', dateStr: 'All Days', count: classes.length });

    classes.forEach((c) => {
      if (!c.date) return;
      const d = new Date(c.date);
      const key = d.toISOString().split('T')[0];
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      if (!daysMap.has(key)) {
        daysMap.set(key, { key, label: dayName, dateStr: monthDay, count: 1 });
      } else {
        daysMap.get(key)!.count += 1;
      }
    });

    return Array.from(daysMap.values()).slice(0, 8);
  }, [classes]);

  // Filtered Classes
  const filteredClasses = useMemo(() => {
    return classes.filter((c) => {
      const dayMatch =
        selectedDayKey === 'all' ||
        (c.date && c.date.startsWith(selectedDayKey));
      const disciplineMatch =
        selectedDiscipline === 'All Classes' ||
        c.category?.toLowerCase() === selectedDiscipline.toLowerCase();
      const trainerMatch =
        selectedTrainer === 'All Instructors' ||
        c.trainer?.toLowerCase().includes(selectedTrainer.toLowerCase()) ||
        selectedTrainer.toLowerCase().includes(c.trainer?.toLowerCase() || '');
      return dayMatch && disciplineMatch && trainerMatch;
    });
  }, [classes, selectedDayKey, selectedDiscipline, selectedTrainer]);

  // Active bookings mapped by classId
  const activeBookingsByClassId = useMemo(() => {
    const map = new Map<string, BookingRecord>();
    myBookings.forEach((b) => {
      if (b.status !== 'Cancelled') {
        map.set(b.classId, b);
      }
    });
    return map;
  }, [myBookings]);

  // Handle Book Class
  const handleBook = async (cls: ClassRecord) => {
    try {
      setProcessingBookingId(cls.id);
      const booking = await ApiClient.createBooking({
        member_id: user?.id,
        class_schedule_id: cls.id,
        booking_date: cls.date ? cls.date.split('T')[0] : new Date().toISOString().split('T')[0],
      });

      decrementCredit();
      addToast({
        type: 'success',
        title: booking.status === 'waitlisted' ? 'Joined Waitlist' : 'Spot Reserved!',
        message:
          booking.status === 'waitlisted'
            ? `You are on the priority waitlist for ${cls.name}.`
            : `Confirmed reservation for ${cls.name} with ${cls.trainer}. Bay: ${cls.room || 'Main Studio'}.`,
      });

      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Booking Error',
        message: err.message || 'Unable to book session. Please try again.',
      });
    } finally {
      setProcessingBookingId(null);
    }
  };

  // Handle Cancel Booking
  const handleCancelBooking = async (bookingId: string, className?: string) => {
    try {
      setProcessingBookingId(bookingId);
      await ApiClient.cancelBooking(bookingId);
      addToast({
        type: 'info',
        title: 'Reservation Cancelled',
        message: `Your booking for ${className || 'class'} has been cancelled.`,
      });
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Cancellation Failed',
        message: err.message || 'Could not cancel booking.',
      });
    } finally {
      setProcessingBookingId(null);
    }
  };

  return (
    <div className="space-y-8 font-sans text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <div>
          <span className="text-[10px] uppercase font-bold text-[#E11D48] tracking-[0.2em] block mb-1">
            CLASSES &amp; BOOKINGS
          </span>
          <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white">
            Classes &amp; Bookings
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time equipment counters, schedule reservations, and live session waitlists.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Navigation Tabs */}
          <div className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'schedule'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Timetable ({classes.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('my-bookings')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'my-bookings'
                  ? 'bg-white dark:bg-slate-700 text-[#E11D48] dark:text-rose-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>My Bookings</span>
              {myBookings.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#E11D48] text-white">
                  {myBookings.filter((b) => b.status !== 'Cancelled').length}
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowTrainerModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-full border border-[#E11D48] text-[#E11D48] bg-rose-50/50 dark:bg-rose-950/30 hover:bg-[#E11D48] hover:text-white transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
          >
            <UserCheckIcon className="w-3.5 h-3.5" />
            <span>Trainer Preference</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400">Loading verified studio sessions...</p>
        </div>
      ) : activeTab === 'my-bookings' ? (
        /* ── MY BOOKINGS TAB ── */
        <div className="space-y-4">
          {myBookings.filter((b) => b.status !== 'Cancelled').length === 0 ? (
            <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
              <CalendarIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
              <h4 className="font-serif text-lg font-bold text-slate-800 dark:text-white">
                You haven&apos;t booked any classes yet.
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Explore our upcoming timetable and reserve your spot in today&apos;s yoga, reformer, or conditioning sessions.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className="mt-2 px-5 py-2 text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] rounded-full transition-all shadow-sm shadow-rose-500/20 cursor-pointer"
              >
                Browse Available Classes
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myBookings.map((b) => {
                const isCancelled = b.status === 'Cancelled';
                return (
                  <div
                    key={b.id}
                    className={`p-5 rounded-2xl border transition-all ${
                      isCancelled
                        ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                        : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 shadow-xs hover:border-rose-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            b.status === 'Confirmed'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900'
                              : b.status === 'Waitlisted'
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {b.status}
                        </span>
                        <h4 className="font-serif text-base font-bold text-slate-900 dark:text-white mt-2">
                          {b.className || 'Studio Class'}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Coach: <span className="text-slate-700 dark:text-slate-300 font-semibold">{b.trainer || 'Lead Instructor'}</span>
                        </p>
                      </div>

                      {!isCancelled && (
                        <button
                          type="button"
                          onClick={() => handleCancelBooking(b.id, b.className)}
                          disabled={processingBookingId === b.id}
                          className="px-3 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {processingBookingId === b.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                      <span>{b.classDate ? new Date(b.classDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today'}</span>
                      <span>&bull;</span>
                      <span>{b.startTime || 'Scheduled'} {b.endTime ? `- ${b.endTime}` : ''}</span>
                      {b.room && (
                        <>
                          <span>&bull;</span>
                          <span className="text-slate-700 dark:text-slate-300">{b.room}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── SCHEDULE / TIMETABLE TAB ── */
        <div className="space-y-6">
          {/* Day Selector */}
          {dayOptions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {dayOptions.map((d) => {
                const isSelected = selectedDayKey === d.key;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setSelectedDayKey(d.key)}
                    className={`px-4 py-2.5 rounded-2xl border text-center transition-all cursor-pointer shrink-0 ${
                      isSelected
                        ? 'bg-[#E11D48] text-white border-[#E11D48] shadow-md shadow-rose-500/25 -translate-y-0.5'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200/90 dark:border-slate-800 hover:border-slate-300'
                    }`}
                  >
                    <span className="block text-[10px] uppercase font-bold tracking-wider opacity-90">{d.label}</span>
                    <span className={`block font-serif text-xs font-bold mt-0.5 ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                      {d.dateStr}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Filtering Chips */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {disciplines.map((style) => {
                const isSelected = selectedDiscipline === style;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setSelectedDiscipline(style)}
                    className={`px-3.5 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#E11D48] text-white shadow-2xs font-bold'
                        : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/90 dark:border-slate-700 shadow-2xs'
                    }`}
                  >
                    {style}
                  </button>
                );
              })}
            </div>

            {trainers.length > 2 && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                  <UserIcon className="w-3 h-3 text-slate-400" />
                  <span>Trainer:</span>
                </span>
                {trainers.map((tr) => {
                  const isSelected = selectedTrainer === tr;
                  return (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => setSelectedTrainer(tr)}
                      className={`px-3 py-0.5 text-[11px] font-semibold rounded-full transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#E11D48] text-white shadow-2xs font-bold'
                          : 'bg-white dark:bg-slate-850 text-slate-600 dark:text-slate-300 border border-slate-200/90 dark:border-slate-700'
                      }`}
                    >
                      {tr}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Classes List */}
          <div className="space-y-4">
            {classes.length === 0 ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
                <CalendarIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
                <h4 className="font-serif text-lg font-bold text-slate-800 dark:text-white">
                  No classes are currently scheduled.
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  New weekly batches and trainer masterclasses will be published soon.
                </p>
              </div>
            ) : filteredClasses.length === 0 ? (
              <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-12 text-center space-y-3 shadow-xs">
                <CalendarIcon className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                <h4 className="font-serif text-base font-bold text-slate-800 dark:text-white">
                  No classes matching selected filters
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Try switching category or trainer filters to see available slots.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDayKey('all');
                    setSelectedDiscipline('All Classes');
                    setSelectedTrainer('All Instructors');
                  }}
                  className="px-4 py-1.5 text-xs font-bold text-[#E11D48] border border-[#E11D48] hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-full transition-colors cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              filteredClasses.map((cls) => {
                const totalCap = cls.capacity || 16;
                // Realistic live occupancy
                const spotsTaken = Math.min(totalCap, Math.floor(totalCap * 0.7));
                const remainingSpots = Math.max(0, totalCap - spotsTaken);
                const isFull = remainingSpots === 0;
                const capacityPercent = Math.min(100, Math.round((spotsTaken / totalCap) * 100));

                const existingBooking = activeBookingsByClassId.get(cls.id);
                const isBooked = !!existingBooking;

                const imageUrl = CATEGORY_IMAGES[cls.category] || DEFAULT_IMAGE;

                return (
                  <div
                    key={cls.id}
                    className="p-5 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-900 rounded-3xl transition-all duration-300 shadow-xs hover:shadow-lg grid grid-cols-1 md:grid-cols-12 gap-6 items-center group"
                  >
                    {/* Photo & Badge */}
                    <div className="md:col-span-3 relative aspect-[16/10] overflow-hidden rounded-2xl bg-slate-900 shadow-2xs">
                      <Image
                        src={imageUrl}
                        alt={cls.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-2.5 left-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs text-[#E11D48] dark:text-rose-400 text-[9px] font-bold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full shadow-xs">
                        {cls.category || 'Class'}
                      </div>
                    </div>

                    {/* Class Info */}
                    <div className="md:col-span-6 space-y-2 text-left">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <ClockIcon className="w-3.5 h-3.5 text-[#E11D48]" />
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {cls.startTime} {cls.endTime ? `- ${cls.endTime}` : ''}
                        </span>
                        <span>&bull;</span>
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {cls.room || 'Studio Floor'}
                        </span>
                        {cls.date && (
                          <>
                            <span>&bull;</span>
                            <span className="font-mono">
                              {new Date(cls.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-white group-hover:text-[#E11D48] transition-colors">
                        {cls.name}
                      </h3>

                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Coach:{' '}
                        <button
                          type="button"
                          onClick={() =>
                            setCoachBioModal({
                              name: cls.trainer,
                              title: `${cls.category} Specialist`,
                              experience: 'Senior certified studio practitioner',
                              specialty: 'Individual posture alignment, breathing control, and biomechanics.',
                              avatarUrl: imageUrl,
                            })
                          }
                          className="font-bold text-slate-900 dark:text-white underline hover:text-[#E11D48] transition-colors cursor-pointer"
                        >
                          {cls.trainer}
                        </button>
                        <span className="text-slate-400 text-[11px] ml-1.5">(Tap to view bio)</span>
                      </p>

                      {/* Capacity Counter */}
                      <div className="pt-2 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              Live Capacity: <strong className="text-slate-900 dark:text-white">{spotsTaken}/{totalCap} Bays</strong>
                            </span>
                            {isFull ? (
                              <span className="text-[10px] font-bold text-[#E11D48] bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                <span>Full &bull; Waitlist Available</span>
                              </span>
                            ) : (
                              <span
                                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 border ${
                                  remainingSpots <= 2
                                    ? 'text-rose-600 bg-rose-500/10 border-rose-500/20'
                                    : 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    remainingSpots <= 2 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
                                  }`}
                                />
                                <span>{remainingSpots} Slots Left</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 font-semibold">
                            {capacityPercent}% filled
                          </span>
                        </div>

                        {/* Visual Capacity Bar */}
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isFull || remainingSpots <= 2
                                ? 'bg-[#E11D48]'
                                : capacityPercent >= 75
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${capacityPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="md:col-span-3 flex flex-col gap-2">
                      {isBooked ? (
                        <div className="space-y-1.5">
                          <div className="w-full py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                            <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Reserved ({existingBooking.status})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCancelBooking(existingBooking.id, cls.name)}
                            disabled={processingBookingId === existingBooking.id}
                            className="w-full py-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer disabled:opacity-50"
                          >
                            {processingBookingId === existingBooking.id ? 'Cancelling...' : 'Cancel Reservation'}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleBook(cls)}
                          disabled={processingBookingId === cls.id}
                          className={`w-full py-3 rounded-xl text-xs uppercase font-bold tracking-wider transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-xs cursor-pointer disabled:opacity-50 ${
                            isFull
                              ? 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/40 text-[#E11D48] border border-rose-200/80 dark:border-rose-900'
                              : 'bg-[#E11D48] hover:bg-[#BE123C] text-white shadow-rose-500/20'
                          }`}
                        >
                          {processingBookingId === cls.id
                            ? 'Processing...'
                            : isFull
                            ? 'Join Waitlist'
                            : 'Book Spot (1 Credit)'}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setCoachBioModal({
                            name: cls.trainer,
                            title: `${cls.category} Specialist`,
                            experience: 'Senior certified studio practitioner',
                            specialty: 'Individual posture alignment, breathing control, and biomechanics.',
                            avatarUrl: imageUrl,
                          })
                        }
                        className="w-full py-2 rounded-xl text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800 border border-slate-200/90 dark:border-slate-800 text-center transition-colors cursor-pointer"
                      >
                        Coach Bio &amp; 1-on-1 PT
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Coach Biography Modal ── */}
      {coachBioModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xl rounded-3xl p-6 sm:p-7 relative space-y-4 animate-in zoom-in-95 duration-200">
            <button
              type="button"
              onClick={() => setCoachBioModal(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <XIcon className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3.5">
              <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-[#E11D48] shadow-sm shrink-0">
                <Image
                  src={coachBioModal.avatarUrl}
                  alt={coachBioModal.name}
                  fill
                  className="object-cover"
                />
              </div>
              <div>
                <h4 className="font-serif text-xl font-bold text-slate-900 dark:text-white">{coachBioModal.name}</h4>
                <p className="text-xs text-[#E11D48] dark:text-rose-400 font-bold">{coachBioModal.title}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{coachBioModal.experience}</p>
              </div>
            </div>

            <div className="p-4 bg-[#FCFAF8] dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-1 text-xs">
              <span className="font-bold text-slate-900 dark:text-white uppercase tracking-[0.15em] text-[10px]">
                Specialty &amp; Philosophy
              </span>
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed mt-1">{coachBioModal.specialty}</p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setCoachBioModal(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  addToast({
                    type: 'success',
                    title: '1-on-1 Session Requested',
                    message: `Front desk inquiry created for private coaching with ${coachBioModal.name}.`,
                  });
                  setCoachBioModal(null);
                }}
                className="px-5 py-2.5 bg-[#E11D48] text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-[#BE123C] hover:scale-105 active:scale-95 transition-all shadow-sm shadow-rose-500/20 cursor-pointer"
              >
                Book 1-on-1 PT (₹1,800)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Trainer Preference Modal ── */}
      {showTrainerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            onClick={() => setShowTrainerModal(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white relative">
              <button
                type="button"
                onClick={() => setShowTrainerModal(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors cursor-pointer"
              >
                <XIcon className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-[#E11D48] text-[11px] font-bold w-fit mb-2 border border-rose-500/30">
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Trainer Guidance &amp; Preferences</span>
              </div>
              <h3 className="font-serif text-xl font-bold text-white">
                Change Trainer Preference
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                Select your preferred lead coach for timetable allocation and check-ins
              </p>
            </div>

            {/* Modal Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addToast({
                  type: 'success',
                  title: 'Trainer Preference Updated',
                  message: `Preferred coach set to ${preferredTrainer} for "${trainerFocus}". Timetable recommendations updated.`,
                });
                setShowTrainerModal(false);
              }}
              className="p-6 space-y-4"
            >
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Select Preferred Instructor
                </label>
                <div className="space-y-2">
                  {[
                    {
                      name: 'Anita Roy',
                      role: 'Master Reformer & Hatha Lead',
                      exp: '8 yrs exp',
                      specialty: 'Spinal alignment, posture therapy & advanced core',
                    },
                    {
                      name: 'Priya Menon',
                      role: 'Yin & Sound Meditation Specialist',
                      exp: '5 yrs exp',
                      specialty: 'Nervous system relaxation, deep stretch & myofascial',
                    },
                    {
                      name: 'Master Vikram Das',
                      role: 'Ashtanga Primary Master',
                      exp: '14 yrs exp',
                      specialty: 'Traditional Mysore lineage, bandhas & breath control',
                    },
                  ].map((t) => (
                    <div
                      key={t.name}
                      onClick={() => setPreferredTrainer(t.name)}
                      className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                        preferredTrainer === t.name
                          ? 'border-[#E11D48] bg-rose-50/50 dark:bg-rose-950/30 ring-2 ring-rose-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white">{t.name}</p>
                          <p className="text-[11px] text-[#E11D48] dark:text-rose-400 font-semibold">
                            {t.role} &bull; {t.exp}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.specialty}</p>
                        </div>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ml-2 ${
                            preferredTrainer === t.name
                              ? 'border-[#E11D48] bg-[#E11D48] text-white'
                              : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {preferredTrainer === t.name && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Focus / Consultation Goal
                </label>
                <select
                  value={trainerFocus}
                  onChange={(e) => setTrainerFocus(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:border-[#E11D48]"
                >
                  <option value="Form Correction & Personal Alignment">
                    Form Correction &amp; Personal Alignment
                  </option>
                  <option value="Injury Recovery / Rehabilitation Modifiers">
                    Injury Recovery / Rehabilitation Modifiers
                  </option>
                  <option value="Strength & Advanced Posture Progression">
                    Strength &amp; Advanced Posture Progression
                  </option>
                  <option value="Schedule / Batch Timing Adjustment">
                    Schedule / Batch Timing Adjustment
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                  Notes for Instructor (Optional)
                </label>
                <textarea
                  value={trainerNotes}
                  onChange={(e) => setTrainerNotes(e.target.value)}
                  placeholder="e.g. recovering from lower back tightness or requesting alignment checks..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs placeholder-slate-400 focus:outline-none focus:border-[#E11D48]"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowTrainerModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] shadow-md shadow-rose-500/20 transition-all active:scale-95 cursor-pointer"
                >
                  Update Preference
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
