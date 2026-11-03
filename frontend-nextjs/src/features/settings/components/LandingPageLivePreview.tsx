'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { LandingPageConfig } from '../types/landing-customization.types';
import { LandingPageFeaturesSection } from './LandingPageFeaturesSection';

interface LandingPageLivePreviewProps {
  config: LandingPageConfig;
  onClose: () => void;
}

export const LandingPageLivePreview: React.FC<LandingPageLivePreviewProps> = ({ config, onClose }) => {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/90 backdrop-blur-md">
      {/* Top control bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-700 bg-slate-900 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Live Preview · Draft Mode
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            (Changes are reflected here in real time without publishing publicly)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Device switch */}
          <div className="flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setDevice('desktop')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                device === 'desktop'
                  ? 'bg-rose-700 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Desktop
            </button>
            <button
              type="button"
              onClick={() => setDevice('mobile')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                device === 'mobile'
                  ? 'bg-rose-700 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Mobile (380px)
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700"
          >
            ✕ Exit Preview
          </button>
        </div>
      </header>

      {/* Preview container */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-6 flex justify-center bg-slate-950/40">
        <div
          className={`w-full overflow-hidden rounded-2xl bg-[#FAF8F5] text-slate-900 shadow-2xl transition-all duration-300 ${
            device === 'mobile' ? 'max-w-[400px] border-8 border-slate-800 my-auto rounded-[2.5rem]' : 'max-w-7xl'
          }`}
        >
          {/* Rendered Landing Page */}
          <div>
            {/* Header / Navbar Preview */}
            <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
              <div className="mx-auto flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  {config.header.logoUrl ? (
                    <div className="relative h-9 w-9 overflow-hidden rounded-lg">
                      <Image
                        src={config.header.logoUrl}
                        alt={config.header.studioName}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center text-rose-700">
                      <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24">
                        <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                      </svg>
                    </span>
                  )}
                  <span className="flex flex-col leading-tight">
                    <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
                      {config.header.studioName || 'Fitness AI'}
                    </span>
                    <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Studio platform
                    </span>
                  </span>
                </div>

                <nav className="hidden items-center gap-5 text-[13px] font-medium text-slate-700 md:flex">
                  <span className="text-rose-800">Home</span>
                  {config.header.navLinks.map((item, idx) => (
                    <span key={idx} className="hover:text-rose-800 cursor-default">
                      {item.label}
                    </span>
                  ))}
                </nav>
              </div>
            </div>

            {/* L1: Hero Section */}
            <section className="relative isolate overflow-hidden bg-[#f1efeb]">
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_rgba(159,18,57,0.10),_transparent_48%),linear-gradient(135deg,_#f5f0ec,_#faf8f5_55%,_#ebe7e2)]" />
              <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-14 lg:px-8">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-800">
                    {config.hero.badge}
                  </p>
                  <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-slate-950 sm:text-5xl lg:text-6xl">
                    {config.hero.heading}
                  </h1>
                  <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                    {config.hero.description}
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <span className="inline-flex min-h-12 items-center justify-center rounded-full bg-rose-800 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-950/15">
                      {config.hero.primaryButtonText}
                    </span>
                    <span className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white/80 px-6 text-sm font-semibold text-slate-800">
                      {config.hero.secondaryButtonText}
                    </span>
                  </div>
                </div>

                <div className="relative mx-auto w-full max-w-[560px]">
                  <div className="relative min-h-[320px] overflow-hidden rounded-[1.8rem] bg-slate-300 shadow-xl sm:min-h-[440px]">
                    {config.hero.imageUrl && (
                      <Image
                        src={config.hero.imageUrl}
                        alt={config.hero.imageAlt || 'Studio hero image'}
                        fill
                        unoptimized
                        className="object-cover object-center"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/5 to-transparent" />
                    <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/20 bg-slate-950/45 p-4 text-white backdrop-blur-md sm:p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200">
                        {config.hero.overlayBadge}
                      </p>
                      <p className="mt-2 text-lg font-semibold leading-6 sm:text-xl">
                        {config.hero.overlayHeading}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* L2: Movement Categories */}
            <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
                    Programs and modalities
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                    {config.movementCategories.heading}
                  </h2>
                </div>
                <p className="max-w-md text-sm leading-6 text-slate-600">
                  {config.movementCategories.description}
                </p>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {config.movementCategories.items.map((modality, index) => (
                  <article
                    key={modality.id || index}
                    className={`group relative isolate flex min-h-44 flex-col justify-end overflow-hidden rounded-2xl bg-slate-300 p-4 text-white sm:min-h-56 sm:p-5 ${
                      index === 0 ? 'sm:col-span-2 sm:row-span-2 sm:min-h-[26rem]' : ''
                    }`}
                  >
                    {modality.imageUrl && (
                      <Image
                        src={modality.imageUrl}
                        alt={modality.title}
                        fill
                        unoptimized
                        className="-z-10 object-cover"
                      />
                    )}
                    <span className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-slate-950/5 to-transparent" />
                    <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/75">
                      {modality.categoryLabel}
                    </span>
                    <h3 className="mt-1 flex items-center justify-between gap-2 text-xl font-semibold tracking-tight">
                      <span>{modality.title}</span>
                      <span aria-hidden="true" className="text-lg">↗</span>
                    </h3>
                  </article>
                ))}
              </div>
            </section>

            {/* L3 - L6: Editorial Stories */}
            <section className="space-y-14 bg-white px-4 py-16 sm:space-y-20 sm:px-6 sm:py-20 lg:space-y-24 lg:px-8">
              {/* L3 */}
              <div className="mx-auto max-w-7xl">
                <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                  <div className="relative min-h-[280px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[360px]">
                    {config.l3StudioManagement.imageUrl && (
                      <Image
                        src={config.l3StudioManagement.imageUrl}
                        alt={config.l3StudioManagement.imageAlt}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="max-w-xl py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
                      {config.l3StudioManagement.label}
                    </p>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                      {config.l3StudioManagement.heading}
                    </h2>
                    <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">
                      {config.l3StudioManagement.description}
                    </p>
                  </div>
                </article>
              </div>

              {/* L4 */}
              <div className="mx-auto max-w-7xl">
                <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                  <div className="relative min-h-[280px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[360px] lg:order-2">
                    {config.l4MembershipExperience.imageUrl && (
                      <Image
                        src={config.l4MembershipExperience.imageUrl}
                        alt={config.l4MembershipExperience.imageAlt}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="max-w-xl py-2 lg:order-1 lg:ml-auto">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
                      {config.l4MembershipExperience.label}
                    </p>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                      {config.l4MembershipExperience.heading}
                    </h2>
                    <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">
                      {config.l4MembershipExperience.description}
                    </p>
                  </div>
                </article>
              </div>

              {/* L5 */}
              <div className="mx-auto max-w-7xl">
                <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                  <div className="relative min-h-[280px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[360px]">
                    {config.l5ConnectedJourneys.imageUrl && (
                      <Image
                        src={config.l5ConnectedJourneys.imageUrl}
                        alt={config.l5ConnectedJourneys.imageAlt}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="max-w-xl py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
                      {config.l5ConnectedJourneys.label}
                    </p>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                      {config.l5ConnectedJourneys.heading}
                    </h2>
                    <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">
                      {config.l5ConnectedJourneys.description}
                    </p>
                  </div>
                </article>
              </div>

              {/* L6 */}
              <div className="mx-auto max-w-7xl">
                <article className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                  <div className="relative min-h-[280px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[360px] lg:order-2">
                    {config.l6AiAssistance.imageUrl && (
                      <Image
                        src={config.l6AiAssistance.imageUrl}
                        alt={config.l6AiAssistance.imageAlt}
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="max-w-xl py-2 lg:order-1 lg:ml-auto">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
                      {config.l6AiAssistance.label}
                    </p>
                    <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
                      {config.l6AiAssistance.heading}
                    </h2>
                    <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base">
                      {config.l6AiAssistance.description}
                    </p>
                  </div>
                </article>
              </div>
            </section>

            {/* L7: Features Section (Replacing Pricing) */}
            <LandingPageFeaturesSection config={config.l7Features} />

            {/* L8: Final Call to Action */}
            <section className="bg-slate-950 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
              <div className="mx-auto flex max-w-7xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-300">
                    {config.l8FinalCta.label}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                    {config.l8FinalCta.heading}
                  </h2>
                  <p className="mt-4 text-sm leading-7 text-slate-300">
                    {config.l8FinalCta.description}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-700 px-5 text-sm font-semibold text-white">
                    {config.l8FinalCta.primaryButtonText}
                  </span>
                  <span className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/30 px-5 text-sm font-semibold text-white">
                    {config.l8FinalCta.secondaryButtonText}
                  </span>
                </div>
              </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-slate-800 bg-slate-950 text-slate-300">
              <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8 lg:py-16">
                <div className="md:col-span-2">
                  <div className="inline-flex items-center gap-3">
                    {config.footer.logoUrl ? (
                      <div className="relative h-9 w-9 overflow-hidden rounded-lg">
                        <Image
                          src={config.footer.logoUrl}
                          alt={config.footer.studioName}
                          fill
                          unoptimized
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center text-rose-400">
                        <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24">
                          <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                        </svg>
                      </span>
                    )}
                    <span className="font-serif text-xl font-bold tracking-tight text-white">
                      {config.footer.studioName}
                    </span>
                  </div>
                  <p className="mt-5 max-w-md text-sm leading-7 text-slate-400">
                    {config.footer.description}
                  </p>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
                    {config.footer.exploreHeading}
                  </h3>
                  <ul className="mt-5 space-y-3 text-sm text-slate-400">
                    {config.footer.exploreLinks.map((item, idx) => (
                      <li key={idx}>
                        <span className="cursor-default hover:text-white">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
                    {config.footer.accessHeading}
                  </h3>
                  <ul className="mt-5 space-y-3 text-sm text-slate-400">
                    {config.footer.accessLinks.map((item, idx) => (
                      <li key={idx}>
                        <span className="cursor-default hover:text-white">{item.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="border-t border-slate-800">
                <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
                  <p>© {new Date().getFullYear()} {config.footer.copyright}</p>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};
