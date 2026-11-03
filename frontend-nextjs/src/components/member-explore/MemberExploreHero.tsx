'use client';

import React from 'react';
import Image from 'next/image';
import { useTenantBranding } from '@/features/settings';
import {
  ArrowRightIcon,
  SparklesIcon,
  CheckIcon,
} from '@/components/ui/icons';

interface MemberExploreHeroProps {
  studioName?: string;
}

export function MemberExploreHero({ studioName }: MemberExploreHeroProps) {
  const branding = useTenantBranding();
  const activeStudioName = studioName || branding.studioName || 'Fitness AI';

  return (
    <section className="relative isolate overflow-hidden bg-[#FAF8F5] pt-10 pb-16 sm:pt-14 sm:pb-24 lg:pt-18 lg:pb-28">
      {/* Ambient delicate background lighting */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_15%_15%,rgba(225,29,72,0.06),transparent_70%),radial-gradient(ellipse_65%_50%_at_85%_85%,rgba(244,236,227,0.75),transparent_60%)]"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
          
          {/* Left Column: Value Proposition & Single CTA */}
          <div className="flex flex-col items-start lg:col-span-6">
            
            {/* Studio Identity Pill */}
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/90 bg-rose-50/80 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-rose-900 shadow-2xs backdrop-blur-xs">
              <SparklesIcon className="h-3.5 w-3.5 text-rose-700" />
              <span>{activeStudioName} &bull; Member Sanctuary</span>
            </div>

            {/* Editorial Headline */}
            <h1 className="mt-6 font-serif text-4xl sm:text-5xl lg:text-[3.65rem] font-extrabold tracking-tight text-slate-950 leading-[1.12]">
              Find your balance. <br />
              <span className="text-rose-900">Elevate your practice.</span>
            </h1>

            {/* Welcoming Description (Enlarged for Readability) */}
            <p className="mt-6 max-w-xl text-lg sm:text-xl lg:text-[1.28rem] leading-relaxed text-slate-700 font-normal">
              Step into an intentional space crafted for mindful movement, strength, and intelligent recovery. Discover transparent studio passes, instructor-led workshops, and a welcoming community dedicated to your well-being.
            </p>

            {/* Single Primary Action Button */}
            <div className="mt-8 flex items-center">
              <a
                href="#memberships"
                className="group inline-flex min-h-13 items-center justify-center gap-3 rounded-full bg-rose-800 px-8 text-sm font-semibold text-white shadow-xl shadow-rose-950/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2 motion-reduce:transform-none"
              >
                <span>Explore Memberships</span>
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>

            {/* Studio Quality Commitments */}
            <div className="mt-10 grid grid-cols-2 gap-4 border-t border-slate-200/80 pt-6 sm:grid-cols-3 sm:gap-6 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Unlimited studio flow</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Certified mentors</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Instant confirmation</span>
              </div>
            </div>
          </div>

          {/* Right Column: Prominent Large Wellness Photography */}
          <div className="lg:col-span-6">
            <div className="relative mx-auto w-full max-w-[540px] lg:max-w-none">
              
              {/* Soft Ambient Depth Glow */}
              <div
                className="absolute -inset-3 rounded-[3rem] bg-gradient-to-tr from-rose-200/50 via-amber-100/40 to-transparent blur-xl -z-10"
                aria-hidden="true"
              />

              {/* Main Wellness Frame */}
              <div className="relative aspect-[4/5] min-h-[460px] sm:min-h-[520px] w-full overflow-hidden rounded-[2.5rem] border border-white/80 bg-stone-100 shadow-[0_25px_60px_rgba(15,23,42,0.10)]">
                <Image
                  src="https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=1400&q=85"
                  alt={`${activeStudioName} Boutique Pilates Studio`}
                  fill
                  priority
                  unoptimized
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  className="object-cover object-center transition-transform duration-1000 hover:scale-[1.025] motion-reduce:transform-none"
                />

                {/* Delicate Ambient Vignette (Eliminates heavy dark overlays) */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent pointer-events-none" />

                {/* Floating Glass Label Inside Frame — Bright & Refined */}
                <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/80 bg-white/90 p-4.5 text-slate-900 backdrop-blur-md shadow-lg sm:inset-x-6 sm:bottom-6 sm:p-5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-800">
                    <SparklesIcon className="h-3 w-3" />
                    <span>Holistic Sanctuary</span>
                  </div>
                  <p className="mt-1 font-serif text-lg font-bold text-slate-950 sm:text-xl">
                    Mindful Pilates &bull; Restorative Movement
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    Precision alignment, core vitality, and transformative strength in sunlit studio spaces.
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
