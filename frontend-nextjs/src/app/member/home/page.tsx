'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { usePublishedStudioEvents } from '@/lib/studioEvents';
import { ApiClient } from '@/lib/api-client';
import {
  CalendarIcon,
  ClockIcon,
  CheckCircleIcon,
  QrCodeIcon,
  SparklesIcon,
  ArrowRightIcon,
  HeartPulseIcon,
  CheckIcon,
  MapPinIcon,
} from '@/components/ui/icons';

const UPCOMING_CLASSES = [
  {
    id: 'b1',
    classTitle: 'Dynamic Vinyasa Flow',
    category: 'Yoga',
    date: 'Tomorrow, Oct 2',
    time: '07:30 AM - 08:30 AM',
    location: 'Indiranagar Sanctuary',
    instructor: 'Ananya Sharma',
    bookingRef: 'WS-BK-9912',
    imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80',
    status: 'Confirmed',
  },
  {
    id: 'b2',
    classTitle: 'Tibetan Sound Bath & Meditation',
    category: 'Sound',
    date: 'Saturday, Oct 4',
    time: '06:30 PM - 07:15 PM',
    location: 'Bandra Sanctuary',
    instructor: 'Dr. Meera Rao',
    bookingRef: 'WS-BK-9938',
    imageUrl: 'https://images.unsplash.com/photo-1512290900672-1f4961817730?auto=format&fit=crop&w=600&q=80',
    status: 'Confirmed',
  },
  {
    id: 'b3',
    classTitle: 'Reformer Pilates Sculpt',
    category: 'Pilates',
    date: 'Monday, Oct 6',
    time: '09:00 AM - 09:50 AM',
    location: 'Indiranagar Sanctuary',
    instructor: 'Rohan Mehta',
    bookingRef: 'WS-BK-9954',
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=600&q=80',
    status: 'Confirmed',
  },
];

const FEATURED_DISCIPLINES = [
  {
    id: 'c1',
    title: 'High-Energy Zumba & Barre',
    category: 'Dance',
    duration: '55 min',
    time: '05:30 PM · Indiranagar',
    instructor: 'Priya Kapoor',
    price: 750,
    imageUrl: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=800&q=80',
  },
  {
    id: 'c2',
    title: 'Ashtanga Primary Immersion',
    category: 'Yoga',
    duration: '75 min',
    time: '06:30 AM · Bandra',
    instructor: 'Vikram Das',
    price: 900,
    imageUrl: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=800&q=80',
  },
];

const STUDIO_FEEDBACK_SESSIONS = [
  { sessionId: 'class-pilates-preview', label: 'Morning Pilates · 8:00 AM', trainerName: 'Ananya Sharma' },
  { sessionId: 'class-strength-preview', label: 'Strength & Conditioning · 10:30 AM', trainerName: 'Rahul Menon' },
  { sessionId: 'class-dance-preview', label: 'Beginner Dance · 1:00 PM', trainerName: 'Meera Nair' },
  { sessionId: 'class-flow-preview', label: 'Contemporary Flow · 5:30 PM', trainerName: 'Kavita Iyer' },
  { sessionId: 'class-foundations-preview', label: 'Dance Foundations · 7:00 PM', trainerName: 'Rohan Mehta' },
];

const FEEDBACK_STRENGTH_OPTIONS = [
  'Clear posture cues',
  'Welcoming atmosphere',
  'Great pacing',
  'Music & energy',
  'Personalised modifications',
];

const FEEDBACK_IMPROVEMENT_OPTIONS = [
  'Longer cool-down stretch',
  'More technique demos',
  'Room temperature / sound',
];

export default function MemberHomePage() {
  const { user, activeMembership } = useAuthContext();
  const { addToast } = useToast();
  const publishedEvents = usePublishedStudioEvents().filter((event) => new Date(event.endAt).getTime() >= Date.now()).sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 2);

  const [feedbackCategory, setFeedbackCategory] = React.useState<'Trainer' | 'Staff' | 'General'>('Trainer');
  const [selectedStaffMember, setSelectedStaffMember] = React.useState('Studio Team');
  const [selectedSessionId, setSelectedSessionId] = React.useState(STUDIO_FEEDBACK_SESSIONS[0].sessionId);
  const [rating, setRating] = React.useState(5);
  const [selectedStrengths, setSelectedStrengths] = React.useState<string[]>(['Clear posture cues', 'Great pacing']);
  const [selectedImprovements, setSelectedImprovements] = React.useState<string[]>([]);
  const [comment, setComment] = React.useState('');
  const [feedbackNotice, setFeedbackNotice] = React.useState('');

  const handleCancelBooking = (title: string, ref: string) => {
    addToast({
      type: 'info',
      title: 'Booking Cancelled',
      message: `Reservation ${ref} for ${title} has been cancelled. Session credit refunded.`,
    });
  };

  const toggleFeedbackTag = (value: string, list: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const handleSubmitMemberFeedback = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const isTrainer = feedbackCategory === 'Trainer';
    const isStaff = feedbackCategory === 'Staff';
    const sessionMeta = isTrainer
      ? STUDIO_FEEDBACK_SESSIONS.find((item) => item.sessionId === selectedSessionId) ?? STUDIO_FEEDBACK_SESSIONS[0]
      : null;
    const cleanComment =
      comment.trim() ||
      `Rated ${rating}/5 for ${
        isTrainer
          ? `${sessionMeta?.label} with ${sessionMeta?.trainerName}`
          : isStaff
            ? selectedStaffMember
            : 'General studio experience'
      }.`;

    const newEntry = {
      id: `member-feedback-${Date.now()}`,
      sessionId: sessionMeta?.sessionId || '',
      trainerName: sessionMeta?.trainerName || '',
      staffName: isStaff ? selectedStaffMember : '',
      category: feedbackCategory,
      memberId: user?.email || 'priya.n@example.com',
      rating,
      strengths: selectedStrengths,
      improvements: selectedImprovements,
      comment: cleanComment,
      submittedAt: new Date().toISOString(),
      reviewStatus: 'Awaiting Review' as const,
      followUpNote: '',
      source: 'Member portal' as const,
    };

    // 1. Submit through backend API gateway with authenticated session
    try {
      await ApiClient.submitMemberFeedback({
        sessionId: sessionMeta?.sessionId || undefined,
        rating,
        strengths: selectedStrengths,
        improvements: selectedImprovements,
        comment: cleanComment,
        category: feedbackCategory,
      });
    } catch (err: any) {
      console.error('Backend feedback submission failed:', err);
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err?.message || 'Unable to submit feedback to studio gateway. Please try again.',
      });
      return;
    }

    // 2. Preserve immediate client reactivity
    try {
      const existingRaw = window.localStorage.getItem('fitness-studio:feedback');
      const existingList = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [newEntry, ...(Array.isArray(existingList) ? existingList : [])];
      window.localStorage.setItem('fitness-studio:feedback', JSON.stringify(updated));
      window.dispatchEvent(new StorageEvent('storage', { key: 'fitness-studio:feedback' }));
    } catch {
      // Ignore storage errors in restricted environments
    }

    setComment('');
    const targetLabel = isTrainer
      ? `${sessionMeta?.trainerName} (${sessionMeta?.label})`
      : isStaff
        ? selectedStaffMember
        : 'Indiranagar Studio';
    setFeedbackNotice(`Thank you! Your ${rating}/5 review for ${targetLabel} has been submitted to the admin team.`);
    addToast({
      type: 'success',
      title: 'Feedback Submitted',
      message: `Your review for ${targetLabel} is now visible in the Member Feedback & Reviews queue.`,
    });
  };

  return (
    <div className="space-y-12">
      {/* SECTION A: DANZA-INSPIRED WELCOME HERO */}
      <section className="relative overflow-hidden bg-[#EBF2F7] rounded-3xl border border-[#DDE7EE] p-8 sm:p-12 lg:p-14">
        {/* Subtle Decorative Pastel Elements */}
        <div className="absolute -top-10 -left-10 w-44 h-44 rounded-full bg-gradient-to-br from-[#D9EFE8] to-[#BFDEE2] opacity-70 blur-sm pointer-events-none" />
        <div className="absolute -bottom-12 right-10 w-56 h-56 rounded-full border-[14px] border-[#FCE6EB]/60 pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          <div className="lg:col-span-7 space-y-5 text-left">
            <span className="text-xs uppercase font-bold tracking-[0.25em] text-[#E11D48] block">
              MEMBER SANCTUARY
            </span>
            <h1 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight text-[#1A1A1A] leading-[1.15]">
              Welcome back,<br />
              {user?.name?.split(' ')[0] || 'Arya'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 max-w-lg leading-relaxed">
              Your practice is active. You have <strong>{activeMembership?.remainingCredits} session credits</strong> remaining on your {activeMembership?.planName}.
            </p>

            <div className="pt-3 flex flex-wrap items-center gap-4">
              {/* Danza Signature Double-Box Outline Button */}
              <Link
                href="/member/book-class"
                className="relative inline-block px-7 py-3 text-xs uppercase tracking-widest font-semibold text-[#E11D48] border border-[#E11D48] outline outline-1 outline-[#E11D48] outline-offset-4 hover:bg-[#E11D48] hover:text-white transition-all duration-300 shadow-xs"
              >
                BOOK A CLASS
              </Link>
              <a
                href="#upcoming-classes"
                className="px-6 py-3 rounded-full bg-white text-slate-800 border border-slate-300 hover:border-slate-400 text-xs uppercase font-bold tracking-wider transition shadow-xs"
              >
                My Bookings
              </a>
            </div>
          </div>

          {/* Right Hero Image */}
          <div className="lg:col-span-5 relative flex items-center justify-center">
            <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden shadow-xl border-4 border-white">
              <Image
                src="https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=800&q=80"
                alt="Member Practice"
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: COMPACT MEMBERSHIP SUMMARY */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-[#E11D48] flex items-center justify-center font-bold flex-shrink-0">
            <CheckCircleIcon className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400 block">
              Active Studio Pass
            </span>
            <span className="font-serif text-xl font-bold text-slate-900 block">
              {activeMembership?.planName}
            </span>
            <span className="text-xs text-teal-800 font-semibold">
              Valid through {activeMembership?.expiryDate} &bull; Member ID: {user?.memberId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-6">
          <div>
            <span className="text-xs text-slate-400 block font-medium">Session Credits</span>
            <span className="font-serif text-2xl font-bold text-slate-900">
              {activeMembership?.remainingCredits} <span className="text-xs text-slate-500 font-sans">/ {activeMembership?.totalCredits} remaining</span>
            </span>
          </div>

          <Link
            href="/member/my-membership"
            className="px-4 py-2 text-xs uppercase tracking-wider font-semibold text-[#E11D48] border border-[#E11D48] hover:bg-[#E11D48] hover:text-white transition rounded-full"
          >
            Manage Pass
          </Link>
        </div>
      </section>

      {/* SECTION C: UPCOMING BOOKINGS */}
      <section id="upcoming-classes" className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-0.5">
              SCHEDULED PRACTICE
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
              Your Upcoming Classes
            </h2>
          </div>
          <Link
            href="/member/book-class"
            className="text-xs font-bold text-[#E11D48] hover:underline flex items-center gap-1"
          >
            <span>Book Another Session</span>
            <ArrowRightIcon className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {UPCOMING_CLASSES.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col justify-between"
            >
              <div className="relative aspect-[16/10] bg-slate-100 overflow-hidden">
                <Image src={booking.imageUrl} alt={booking.classTitle} fill className="object-cover" />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-white/95 text-[#E11D48] text-[10px] font-bold uppercase tracking-wider">
                  {booking.category}
                </div>
              </div>

              <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-serif text-lg font-bold text-slate-900">{booking.classTitle}</h3>
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                      <CalendarIcon className="w-3.5 h-3.5 text-[#E11D48]" />
                      {booking.date}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <ClockIcon className="w-3.5 h-3.5 text-teal-700" />
                      {booking.time}
                    </p>
                    <p className="text-[11px] text-slate-400">{booking.location} &bull; {booking.instructor}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">{booking.bookingRef}</span>
                  <button
                    type="button"
                    onClick={() => handleCancelBooking(booking.classTitle, booking.bookingRef)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION D: FEATURED CLASSES GRID */}
      <section className="space-y-6 pt-4 border-t border-slate-200/60">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-bold tracking-[0.2em] text-teal-800 block mb-0.5">
              EXPLORE DISCIPLINE CATALOG
            </span>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Featured Sanctuary Classes</h2>
          </div>
          <Link href="/classes" className="text-xs font-bold text-teal-800 hover:underline">
            View All Classes &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {FEATURED_DISCIPLINES.map((cls) => (
            <div
              key={cls.id}
              className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col sm:flex-row items-stretch"
            >
              <div className="relative aspect-[4/3] sm:w-48 bg-slate-100 flex-shrink-0">
                <Image src={cls.imageUrl} alt={cls.title} fill className="object-cover" />
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#E11D48]">
                    {cls.category} &bull; {cls.duration}
                  </span>
                  <h3 className="font-serif text-lg font-bold text-slate-900 mt-0.5">{cls.title}</h3>
                  <p className="text-xs text-slate-500 mt-1">{cls.time} &bull; Guide: {cls.instructor}</p>
                </div>
                <Link
                  href={`/classes/${cls.id}`}
                  className="inline-block self-start px-4 py-1.5 text-xs uppercase tracking-wider font-semibold text-[#E11D48] border border-[#E11D48] hover:bg-[#E11D48] hover:text-white transition"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION E: UPCOMING WORKSHOPS ROW */}
      <section className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-0.5">
              RETREATS &amp; INTENSIVES
            </span>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Featured Weekend Workshops</h2>
          </div>
          <Link href="/member/events" className="text-xs font-bold text-slate-700 hover:text-slate-900">
            View All Workshops &rarr;
          </Link>
        </div>

        {publishedEvents.length ? publishedEvents.map((w) => (
          <div
            key={w.id}
            className="flex flex-col md:flex-row items-center justify-between gap-6 p-6 rounded-2xl bg-[#FCFAF8] border border-slate-200/70"
          >
            <div className="flex items-center gap-4">
              {w.coverImageUrl ? <img src={w.coverImageUrl} alt={w.title} className="w-20 h-20 rounded-xl object-cover" /> : <div className="w-20 h-20 rounded-xl bg-rose-50 flex items-center justify-center text-xs font-bold text-rose-700">{w.category}</div>}
              <div>
                <h3 className="font-serif text-lg font-bold text-slate-900">{w.title}</h3>
                <p className="text-xs text-slate-500 mt-1">{new Date(w.startAt).toLocaleString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} &bull; {w.venue}</p>
              </div>
            </div>
            <Link
              href="/member/events"
              className="px-5 py-2.5 rounded-full bg-[#E11D48] text-white text-xs uppercase font-bold tracking-wider hover:bg-[#BE123C] transition shadow-xs whitespace-nowrap"
            >
              View Event Details
            </Link>
          </div>
        )) : <p className="rounded-2xl border border-dashed border-slate-300 bg-[#FCFAF8] p-6 text-sm text-slate-500">There are no upcoming published events at the moment.</p>}
      </section>

      {/* SECTION F: SUBMIT SESSION & TRAINER FEEDBACK */}
      <section id="session-feedback" className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-xs space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs uppercase font-bold tracking-[0.2em] text-[#E11D48] block mb-0.5">
              MEMBER VOICE &bull; STUDIO QUALITY
            </span>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Share Member Feedback &amp; Reviews</h2>
            <p className="mt-1 text-xs text-slate-500 max-w-2xl">
              Share your thoughts on trainer coaching, front desk reception, or overall studio experience. Your feedback flows directly to studio leadership.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-[#E11D48]">
            <SparklesIcon className="w-3.5 h-3.5" /> Synced with Member Feedback &amp; Reviews
          </span>
        </div>

        <form onSubmit={handleSubmitMemberFeedback} className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          <div className="lg:col-span-5 space-y-4">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">Feedback Category</span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(['Trainer', 'Staff', 'General'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFeedbackCategory(cat)}
                    className={`h-10 rounded-xl border text-xs font-bold transition ${
                      feedbackCategory === cat
                        ? 'border-[#E11D48] bg-rose-50 text-[#E11D48]'
                        : 'border-slate-200 bg-[#FCFAF8] text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {feedbackCategory === 'Trainer' && (
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Session &amp; Trainer
                <select
                  value={selectedSessionId}
                  onChange={(event) => setSelectedSessionId(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-[#FCFAF8] px-3 text-xs font-semibold text-slate-900 focus:border-[#E11D48] focus:outline-none"
                >
                  {STUDIO_FEEDBACK_SESSIONS.map((item) => (
                    <option key={item.sessionId} value={item.sessionId}>
                      {item.label} — {item.trainerName}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {feedbackCategory === 'Staff' && (
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Select Staff / Department
                <select
                  value={selectedStaffMember}
                  onChange={(event) => setSelectedStaffMember(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-[#FCFAF8] px-3 text-xs font-semibold text-slate-900 focus:border-[#E11D48] focus:outline-none"
                >
                  <option value="Studio Team">Studio Team · Front Desk &amp; Reception</option>
                  <option value="Meera Nair">Meera Nair · Studio Operations Manager</option>
                </select>
              </label>
            )}

            {feedbackCategory === 'General' && (
              <div className="rounded-xl border border-slate-200 bg-[#FCFAF8] p-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-900">General Studio Experience</p>
                <p className="mt-1 text-[11px] text-slate-500">Share suggestions regarding studio cleanliness, lighting, equipment, temperature, or booking convenience.</p>
              </div>
            )}

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">Overall Rating</span>
              <div className="mt-2 flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`h-10 w-11 rounded-xl border text-xs font-bold transition ${
                      rating >= value
                        ? 'border-[#E11D48] bg-[#E11D48] text-white shadow-xs'
                        : 'border-slate-200 bg-[#FCFAF8] text-slate-600 hover:border-rose-300'
                    }`}
                  >
                    {value} ★
                  </button>
                ))}
                <span className="ml-2 text-xs font-semibold text-slate-600">{rating} / 5 stars</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">What stood out positively?</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {FEEDBACK_STRENGTH_OPTIONS.map((tag) => {
                  const active = selectedStrengths.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleFeedbackTag(tag, selectedStrengths, setSelectedStrengths)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-teal-700 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}{tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">Any areas to improve? (optional)</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {FEEDBACK_IMPROVEMENT_OPTIONS.map((tag) => {
                  const active = selectedImprovements.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleFeedbackTag(tag, selectedImprovements, setSelectedImprovements)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-amber-600 bg-amber-50 text-amber-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      {active ? '✓ ' : '+ '}{tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Your Note for the Trainer &amp; Studio Team
              <textarea
                rows={3}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Share what you enjoyed about the class, coaching cues, or studio experience..."
                className="mt-2 w-full rounded-xl border border-slate-300 bg-[#FCFAF8] p-3 text-xs font-normal text-slate-800 focus:border-[#E11D48] focus:outline-none"
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500">
                Submitting as <strong>{user?.email || 'priya.n@example.com'}</strong>
              </p>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-full bg-[#E11D48] text-white text-xs uppercase font-bold tracking-wider hover:bg-[#BE123C] transition shadow-xs"
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </form>

        {feedbackNotice && (
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-900">
            {feedbackNotice}
          </div>
        )}
      </section>
    </div>
  );
}
