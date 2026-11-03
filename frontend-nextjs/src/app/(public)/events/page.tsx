'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicNavbar } from '@/components/layout/PublicNavbar';

const experiences = [
  { id: 'retreat', label: 'Illustrative past retreat · outdoor practice', title: 'A morning held by the mountains.', description: 'A restorative retreat shaped by quiet movement, open air and time away from the usual rhythm.', location: 'Illustrative past experience · Coorg', image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=85', alt: 'A peaceful mountain landscape at first light' },
  { id: 'sound', label: 'Illustrative past workshop · sound and stillness', title: 'Listening became the practice.', description: 'A sound-led evening brought together resonant instruments, guided rest and a shared moment of stillness.', location: 'Illustrative past experience · Bengaluru', image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1600&q=85', alt: 'Musical instruments prepared for a listening session' },
  { id: 'community', label: 'Illustrative past gathering · studio community', title: 'Good things grow in company.', description: 'A relaxed community gathering made room for conversation, connection and a welcome beyond the studio floor.', location: 'Illustrative past experience · Mumbai', image: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=1600&q=85', alt: 'Friends gathered together around a table' },
  { id: 'upcoming', label: 'Illustrative upcoming ritual · seasonal reset', title: 'A little space for a new season.', description: 'An upcoming studio gathering for gentle movement and reflection. Members can find its timing and details through their studio.', location: 'Illustrative upcoming experience · Details shared by each studio', image: 'https://images.unsplash.com/photo-1536623975707-c4b3b2af565d?auto=format&fit=crop&w=1600&q=85', alt: 'A person meditating peacefully outdoors' },
];

export default function EventsPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const experience = experiences[activeIndex];
  const move = (step: number) => setActiveIndex((current) => (current + step + experiences.length) % experiences.length);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotionPreference = () => setReducedMotion(media.matches);
    updateMotionPreference();
    media.addEventListener('change', updateMotionPreference);
    return () => media.removeEventListener('change', updateMotionPreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActiveIndex((current) => (current + 1) % experiences.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [reducedMotion]);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] font-sans text-slate-800">
      <PublicNavbar activeSection="events" />
      <main className="flex-1">
        <section className="mx-auto max-w-7xl px-4 pb-7 pt-12 sm:px-6 sm:pb-10 sm:pt-16 lg:px-8 lg:pt-20">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">Studio stories · past and upcoming</p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-5xl">Gatherings that stay with us.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">A living record of the retreats, workshops and studio rituals that bring people together. Each studio shares its own upcoming experience details with members.</p>
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Experience archive</span>
          </div>
        </section>

        <section
          aria-label="Featured events and experiences"
          aria-roledescription="carousel"
          className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-20 lg:px-8"
        >
          <article key={experience.id} className={`grid overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_25px_80px_rgba(15,23,42,0.10)] lg:grid-cols-[1.1fr_0.9fr] ${reducedMotion ? '' : 'animate-fadeIn'}`}>
            <div className="relative min-h-[310px] bg-slate-200 sm:min-h-[470px] lg:min-h-[560px]">
              <Image src={experience.image} alt={experience.alt} fill draggable={false} unoptimized priority={activeIndex === 0} loading={activeIndex === 0 ? 'eager' : 'lazy'} sizes="(max-width: 1023px) 100vw, 58vw" className="select-none object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent" />
              <span className="absolute bottom-5 left-5 rounded-full border border-white/40 bg-slate-950/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">Studio experience</span>
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-800">{experience.label}</p>
              <h2 className="mt-4 font-serif text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">{experience.title}</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">{experience.description}</p>
              <p className="mt-7 border-t border-slate-200 pt-5 text-xs font-medium leading-6 text-slate-600">{experience.location}</p>
            </div>
          </article>

          <div className="mt-5 flex justify-center gap-2" aria-label={`Experience ${activeIndex + 1} of ${experiences.length}`}>
            {experiences.map((item, index) => <span key={item.id} aria-hidden="true" className={`h-1.5 rounded-full transition-all duration-700 ${index === activeIndex ? 'w-8 bg-rose-800' : 'w-2 bg-slate-300'}`} />)}
          </div>

          <div className="mt-12 flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white/80 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-800">For members</p>
              <h2 className="mt-2 font-serif text-xl font-semibold text-slate-950">Find experiences shared by your studio.</h2>
            </div>
            <Link href="/member-login" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-rose-800 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 focus-visible:ring-offset-2">Member sign in</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
