'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicNavbar } from '@/components/layout/PublicNavbar';

const classes = [
  { id: 'yoga', discipline: 'Yoga', title: 'A steady return to breath.', name: 'Vinyasa Flow', duration: '60 minutes', intensity: 'Moderate', description: 'Move through a fluid sequence where breath sets the pace and each posture creates room for focus and balance.', image: 'https://images.unsplash.com/photo-1575052814086-f385e2e2ad1b?auto=format&fit=crop&w=1600&q=85', alt: 'Yoga practice in a quiet studio' },
  { id: 'zumba', discipline: 'Zumba', title: 'Let the rhythm lead.', name: 'Latin Dance Fitness', duration: '50 minutes', intensity: 'High energy', description: 'A music-led movement session built from easy-to-follow combinations, lively rhythms and the shared energy of the room.', image: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?auto=format&fit=crop&w=1600&q=85', alt: 'A dynamic group movement practice' },
  { id: 'strength', discipline: 'Strength', title: 'Build strength with intention.', name: 'Progressive Strength', duration: '55 minutes', intensity: 'Challenging', description: 'A coached strength practice pairing deliberate resistance work with attentive form and a steady pace.', image: 'https://images.unsplash.com/photo-1517963628607-235ccdd5476c?auto=format&fit=crop&w=1600&q=85', alt: 'Strength training with free weights' },
  { id: 'dance', discipline: 'Dance', title: 'Find a little more freedom.', name: 'Contemporary Movement', duration: '60 minutes', intensity: 'Expressive', description: 'Explore musicality, grounded movement and personal expression through a guided contemporary dance practice.', image: 'https://images.unsplash.com/photo-1524594154908-edd665c4be5f?auto=format&fit=crop&w=1600&q=85', alt: 'Contemporary dancer in motion' },
  { id: 'pilates', discipline: 'Pilates', title: 'Precision in every movement.', name: 'Pilates Core & Control', duration: '50 minutes', intensity: 'Focused', description: 'A mat-based session centered on controlled transitions, core stability and the small details that support alignment.', image: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=1600&q=85', alt: 'A focused Pilates training session' },
  { id: 'mobility', discipline: 'Mobility', title: 'Make space to move well.', name: 'Mobility & Recovery', duration: '45 minutes', intensity: 'Gentle', description: 'Unhurried mobility work and restorative stretches help bring attention back to range, ease and recovery.', image: 'https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1600&q=85', alt: 'A calm stretching and mobility practice' },
];

export default function ClassesPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const session = classes[activeIndex];

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(preference.matches);
    updatePreference();
    preference.addEventListener('change', updatePreference);
    return () => preference.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveIndex((index) => (index + 1) % classes.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] font-sans text-slate-800">
      <PublicNavbar activeSection="classes" />
      <main className="flex flex-1 flex-col">
        <section className="mx-auto w-full max-w-7xl px-4 pb-8 pt-12 sm:px-6 sm:pb-12 sm:pt-16 lg:px-8 lg:pt-20">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">A closer look at studio practice</p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">Sessions, shaped around the way you move.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">From grounded yoga to high-energy dance, discover the different ways a studio practice can feel. Member class details are available through your studio.</p>
            </div>
            <p className="shrink-0 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{String(activeIndex + 1).padStart(2, '0')} <span className="text-rose-700">/</span> {String(classes.length).padStart(2, '0')}</p>
          </div>
        </section>

        <section aria-label="Featured studio class" aria-live="polite" className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-8 px-4 pb-14 sm:px-6 sm:pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-8">
          <div key={session.id} className={`relative min-h-[340px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[460px] lg:min-h-[560px] ${reducedMotion ? '' : 'animate-fadeIn'}`}>
            <Image src={session.image} alt={session.alt} fill unoptimized priority={activeIndex === 0} loading={activeIndex === 0 ? 'eager' : 'lazy'} sizes="(max-width: 1023px) 100vw, 52vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
            <span className="absolute bottom-5 left-5 rounded-full border border-white/35 bg-slate-950/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-sm">{session.discipline} · Studio practice</span>
          </div>

          <article key={`${session.id}-story`} className={`flex flex-col justify-center py-2 sm:py-5 lg:pl-3 ${reducedMotion ? '' : 'animate-fadeIn'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">Featured practice · {session.discipline}</p>
            <h2 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">{session.title}</h2>
            <p className="mt-2 text-lg font-medium text-slate-800">{session.name}</p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">{session.description}</p>
            <dl className="mt-8 grid grid-cols-2 gap-x-5 gap-y-6 border-y border-slate-200 py-6 text-sm">
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Duration</dt><dd className="mt-1.5 font-medium text-slate-900">{session.duration}</dd></div>
              <div><dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Intensity</dt><dd className="mt-1.5 font-medium text-slate-900">{session.intensity}</dd></div>
            </dl>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/member-login" className="inline-flex min-h-12 items-center justify-center rounded-full bg-rose-800 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2">Member sign in</Link>
              <p className="text-xs text-slate-500">Class access is managed by your studio.</p>
            </div>
            <div className="mt-8 flex items-center justify-between gap-4">
              <div className="flex gap-2" aria-label={`Class ${activeIndex + 1} of ${classes.length}`}>
                {classes.map((item, index) => <span key={item.id} aria-hidden="true" className={`h-1.5 rounded-full transition-all duration-500 ${index === activeIndex ? 'w-8 bg-rose-800' : 'w-2 bg-slate-300'}`} />)}
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">A studio practice, in focus</span>
            </div>
          </article>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
