'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export interface PublicNavbarProps {
  activeSection?: string;
  brandName?: string;
  brandSubtitle?: string;
  logoUrl?: string;
  navLinks?: Array<{ href: string; label: string }>;
}

const modalities = ['Dance', 'Yoga', 'Zumba', 'Fitness', 'Meditation', 'Wellness'];
const defaultNavItems = [
  { href: '/classes', label: 'Classes', active: 'classes' },
  { href: '/#studio-operations', label: 'Platform' },
  { href: '/#member-experience', label: 'Members' },
  { href: '/#features', label: 'Features' },
  { href: '/events', label: 'Events', active: 'events' },
];

export const PublicNavbar: React.FC<PublicNavbarProps> = ({
  activeSection = '',
  brandName = 'Fitness AI',
  brandSubtitle = 'Studio platform',
  logoUrl,
  navLinks,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [programsOpen, setProgramsOpen] = useState(false);
  const items = navLinks && navLinks.length > 0 ? navLinks : defaultNavItems;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="group inline-flex min-h-12 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700" aria-label={`${brandName} home`}>
          {logoUrl ? (
            <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-lg">
              <Image
                src={logoUrl}
                alt={brandName}
                fill
                unoptimized
                className="object-cover"
              />
            </span>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center text-rose-700 transition-transform group-hover:scale-105" aria-hidden="true">
              <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
              </svg>
            </span>
          )}
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{brandName}</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">{brandSubtitle}</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-5 text-[13px] font-medium text-slate-700 xl:flex">
          <Link href="/" className="rounded-md px-1 py-2 transition-colors hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">Home</Link>
          <div className="relative" onMouseEnter={() => setProgramsOpen(true)} onMouseLeave={() => setProgramsOpen(false)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProgramsOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') setProgramsOpen(false); }}>
            <button type="button" aria-haspopup="true" aria-expanded={programsOpen} aria-controls="programs-menu" onFocus={() => setProgramsOpen(true)} onClick={() => setProgramsOpen(true)} className={`inline-flex min-h-10 items-center gap-1 rounded-md px-1 transition-colors hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 ${programsOpen ? 'text-rose-800' : ''}`}>
              Programs <span aria-hidden="true" className={`text-[10px] transition-transform duration-200 ${programsOpen ? 'rotate-180' : ''}`}>⌄</span>
            </button>
            <div id="programs-menu" className={`absolute left-0 top-full w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl transition duration-200 ${programsOpen ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'}`}>
              <p className="px-3 pb-2 pt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-400">Explore modalities</p>
              {modalities.map((name) => (
                <Link key={name} href={`/#${name.toLowerCase()}`} onClick={() => setProgramsOpen(false)} className="flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">
                  {name}<span aria-hidden="true" className="text-rose-700">↗</span>
                </Link>
              ))}
            </div>
          </div>
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={'active' in item && item.active && activeSection === item.active ? 'page' : undefined}
              className={`rounded-md px-1 py-2 transition-colors hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 ${
                'active' in item && item.active && activeSection === item.active ? 'text-rose-800' : ''
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button type="button" aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="public-mobile-navigation" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-rose-700 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700 lg:hidden">
          <span className="flex flex-col gap-1.5" aria-hidden="true"><span className="block h-0.5 w-4 rounded-full bg-current" /><span className="block h-0.5 w-4 rounded-full bg-current" /><span className="block h-0.5 w-4 rounded-full bg-current" /></span>
        </button>
      </div>

      {mobileMenuOpen && (
        <div id="public-mobile-navigation" className="border-t border-slate-200 bg-white lg:hidden">
          <nav aria-label="Mobile navigation" className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 text-sm font-medium text-slate-700 sm:px-6">
            <Link href="/" onClick={() => setMobileMenuOpen(false)} className="min-h-10 rounded-lg px-3 py-2 hover:bg-slate-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">Home</Link>
            <details className="group rounded-lg">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">Programs <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span></summary>
              <div className="grid grid-cols-2 gap-1 pb-2 pl-3 pt-1">
                {modalities.map((name) => <Link key={name} href={`/#${name.toLowerCase()}`} onClick={() => setMobileMenuOpen(false)} className="min-h-10 rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-rose-50 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">{name}</Link>)}
              </div>
            </details>
            {items.map((item) => <Link key={item.label} href={item.href} onClick={() => setMobileMenuOpen(false)} className="min-h-10 rounded-lg px-3 py-2 hover:bg-slate-50 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-700">{item.label}</Link>)}
          </nav>
        </div>
      )}
    </header>
  );
};
