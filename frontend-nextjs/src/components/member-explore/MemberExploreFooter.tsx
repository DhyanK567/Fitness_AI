'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface MemberExploreFooterProps {
  studioName?: string;
  logoUrl?: string;
}

export function MemberExploreFooter({
  studioName = 'Fitness AI',
  logoUrl,
}: MemberExploreFooterProps) {
  return (
    <footer className="border-t border-slate-200/80 bg-white py-14 sm:py-18">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          
          {/* Brand Info */}
          <div className="flex flex-col items-center text-center md:items-start md:text-left">
            <Link
              href="/member-explore"
              className="inline-flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800"
            >
              {logoUrl ? (
                <span className="relative flex h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-rose-100 shadow-2xs">
                  <Image
                    src={logoUrl}
                    alt={studioName}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50/80 text-rose-800 border border-rose-200/60 shadow-2xs" aria-hidden="true">
                  <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                  </svg>
                </span>
              )}
              <span className="font-serif text-xl font-bold tracking-tight text-slate-950">
                {studioName}
              </span>
            </Link>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 max-w-sm">
              Mindful movement, guided practice, and community connection for holistic physical vitality.
            </p>
          </div>

          {/* Customer Navigation Links */}
          <nav aria-label="Customer Footer Navigation" className="flex flex-wrap items-center justify-center gap-7 text-xs font-bold uppercase tracking-wider text-slate-600">
            <a href="#memberships" className="hover:text-rose-800 transition-colors py-1">
              Memberships
            </a>
            <a href="#events" className="hover:text-rose-800 transition-colors py-1">
              Events
            </a>
            <a href="#about" className="hover:text-rose-800 transition-colors py-1">
              About
            </a>
            <Link href="/member-login" className="hover:text-rose-800 transition-colors py-1">
              Member Login
            </Link>
          </nav>
        </div>

        {/* Legal & Copyright */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-6 sm:flex-row text-xs text-slate-500">
          <p>&copy; 2026 Fitness AI Studio OS. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="/privacy" className="hover:text-slate-800 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-800 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
