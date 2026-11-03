'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';

interface MemberExploreHeaderProps {
  studioName?: string;
  logoUrl?: string;
}

export function MemberExploreHeader({
  studioName = 'Fitness AI',
  logoUrl,
}: MemberExploreHeaderProps) {
  const searchParams = useSearchParams();
  const tenant = searchParams?.get('tenant') || '';
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const exploreUrl = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';
  const loginUrl = tenant ? `/member-login?tenant=${encodeURIComponent(tenant)}` : '/member-login';

  const navItems = [
    { label: 'Memberships', href: '#memberships' },
    { label: 'Events', href: '#events' },
    { label: 'About', href: '#about' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md transition-shadow duration-200">
      {/* Top Utility Bar with Clear Return to Main Platform */}
      <div className="border-b border-slate-100 bg-[#FAF8F5]/90 px-4 py-1.5 sm:px-6 lg:px-8 text-xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-rose-900 transition-colors"
          >
            ← Back to Fitness AI
          </Link>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Studio Operating System &bull; Member Sanctuary
          </span>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
        
        {/* Brand Logo & Studio Identity (Prominent & Refined) */}
        <Link
          href={exploreUrl}
          className="group inline-flex min-h-12 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800"
          aria-label={`${studioName} Member Sanctuary`}
        >
          {logoUrl ? (
            <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-rose-100 shadow-2xs">
              <Image
                src={logoUrl}
                alt={studioName}
                fill
                unoptimized
                className="object-cover"
              />
            </span>
          ) : (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50/80 text-rose-800 border border-rose-200/60 shadow-2xs transition-transform duration-200 group-hover:scale-105"
              aria-hidden="true"
            >
              <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
              </svg>
            </span>
          )}
          <span className="flex flex-col leading-tight">
            <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-slate-950 group-hover:text-rose-950 transition-colors">
              {studioName}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-800">
              Member Sanctuary
            </span>
          </span>
        </Link>

        {/* Desktop Navigation (High Readability & Balanced Spacing) */}
        <nav aria-label="Customer Navigation" className="hidden items-center gap-8 md:flex">
          <div className="flex items-center gap-6 text-[14px] font-semibold text-slate-700">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="relative py-2 px-1 text-slate-700 transition-colors duration-150 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 rounded-md after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:origin-bottom-right after:scale-x-0 after:bg-rose-800 after:transition-transform hover:after:origin-bottom-left hover:after:scale-x-100"
              >
                {item.label}
              </a>
            ))}
          </div>

          <Link
            href={loginUrl}
            className="inline-flex min-h-10 items-center justify-center rounded-full bg-rose-800 px-5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all duration-200 hover:bg-rose-900 hover:shadow hover:-translate-y-0.5 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2 motion-reduce:transform-none"
          >
            Member Login
          </Link>
        </nav>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen((open) => !open)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition-colors hover:border-rose-700 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 md:hidden"
        >
          <span className="flex flex-col gap-1.5" aria-hidden="true">
            <span className={`block h-0.5 w-4 rounded-full bg-current transition-transform duration-200 ${mobileMenuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-4 rounded-full bg-current transition-opacity duration-200 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-4 rounded-full bg-current transition-transform duration-200 ${mobileMenuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </span>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-200/90 bg-white md:hidden animate-fadeIn">
          <nav aria-label="Mobile Customer Navigation" className="flex flex-col gap-1 px-4 py-4 sm:px-6">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-rose-50 hover:text-rose-900"
              >
                {item.label}
              </a>
            ))}
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href={loginUrl}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-11 w-full items-center justify-center rounded-full bg-rose-800 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-rose-900"
              >
                Member Login
              </Link>
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-10 w-full items-center justify-center rounded-full border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                ← Back to Fitness AI
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
