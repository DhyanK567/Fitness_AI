'use client';

import React from 'react';
import { FeaturesSectionConfig } from '../types/landing-customization.types';

interface LandingPageFeaturesSectionProps {
  config: FeaturesSectionConfig;
}

function FeatureIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'studio':
      return (
        <svg className="h-6 w-6 text-rose-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'members':
      return (
        <svg className="h-6 w-6 text-rose-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'classes':
      return (
        <svg className="h-6 w-6 text-rose-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'ai':
    default:
      return (
        <svg className="h-6 w-6 text-rose-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      );
  }
}

export const LandingPageFeaturesSection: React.FC<LandingPageFeaturesSectionProps> = ({ config }) => {
  return (
    <section id="features" aria-label="Studio Platform Capabilities" className="relative isolate overflow-hidden bg-[#FAF5F0] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      {/* Subtle background ambient gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(244,63,94,0.06),_transparent_60%)]" />

      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
            Platform Capabilities
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
            {config.heading || 'Everything your studio needs, in one place.'}
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
            {config.description || 'A unified platform built specifically for high-touch boutique wellness studios and gyms.'}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-8">
          {config.cards.map((card) => (
            <div
              key={card.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-rose-100/80 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-rose-300 hover:shadow-lg hover:shadow-rose-950/5"
            >
              <div>
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 ring-1 ring-inset ring-rose-200/60 transition-colors group-hover:bg-rose-100">
                  <FeatureIcon icon={card.icon} />
                </div>
                <h3 className="mt-5 font-serif text-lg font-bold tracking-tight text-slate-900 group-hover:text-rose-950 sm:text-xl">
                  {card.title}
                </h3>
                <p className="mt-2.5 text-sm leading-6 text-slate-600">
                  {card.description}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-xs font-semibold text-rose-800">
                <span>Integrated capability</span>
                <span className="ml-1 text-rose-500" aria-hidden="true">✓</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
