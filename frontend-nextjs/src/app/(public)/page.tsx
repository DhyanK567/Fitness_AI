'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { PublicFooter } from '@/components/layout/PublicFooter';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import {
  DEFAULT_LANDING_PAGE_CONFIG,
  LandingPageConfig,
  EditorialStoryItemConfig,
  loadPublicLandingPageConfig,
} from '@/features/settings';
import { LandingPageFeaturesSection } from '@/features/settings/components/LandingPageFeaturesSection';
import { FloatingAIChat } from '@/components/chat/FloatingAIChat';

function EditorialStory({
  story,
  reverse = false,
}: {
  story: EditorialStoryItemConfig;
  reverse?: boolean;
}) {
  return (
    <article id={story.id} className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
      <div
        className={`relative min-h-[300px] overflow-hidden rounded-[1.75rem] bg-slate-200 sm:min-h-[390px] ${
          reverse ? 'lg:order-2' : ''
        }`}
      >
        {story.imageUrl && (
          <Image
            src={story.imageUrl}
            alt={story.imageAlt || story.heading}
            fill
            unoptimized
            loading="lazy"
            sizes="(max-width: 1023px) 100vw, 50vw"
            className="object-cover transition-transform duration-700 hover:scale-[1.025] motion-reduce:transform-none"
          />
        )}
      </div>
      <div className={`max-w-xl py-2 ${reverse ? 'lg:order-1 lg:ml-auto' : ''}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-rose-800">
          {story.label}
        </p>
        <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-slate-950 sm:text-4xl">
          {story.heading}
        </h2>
        <p className="mt-5 text-sm leading-7 text-slate-600 sm:text-base sm:leading-8">
          {story.description}
        </p>
      </div>
    </article>
  );
}

export default function PublicHomePage() {
  const [config, setConfig] = useState<LandingPageConfig>(DEFAULT_LANDING_PAGE_CONFIG);

  useEffect(() => {
    async function initTenantLandingPage() {
      try {
        const publicConfig = await loadPublicLandingPageConfig();
        if (publicConfig && publicConfig.isPublished !== false) {
          // Safeguard: Ensure no accidental demonstration Flexibility branding overrides Fitness AI
          const studioName = publicConfig.header?.studioName || '';
          const badge = publicConfig.hero?.badge || '';
          const heading = publicConfig.hero?.heading || '';
          if (
            /flexibility/i.test(studioName) ||
            /flexibility/i.test(badge) ||
            /flexibility/i.test(heading)
          ) {
            return;
          }
          setConfig(publicConfig);
        }
      } catch {
        // Fall back to default Fitness AI config if network or setting absent
      }
    }
    initTenantLandingPage();
  }, []);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#FAF8F5] text-slate-900">
      <PublicNavbar
        brandName={config.header.studioName || 'Fitness AI'}
        logoUrl={config.header.logoUrl || undefined}
        navLinks={config.header.navLinks}
      />

      <main>
        {/* L1 — Hero Section */}
        <section className="relative isolate overflow-hidden bg-[#f1efeb]">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_rgba(159,18,57,0.10),_transparent_48%),linear-gradient(135deg,_#f5f0ec,_#faf8f5_55%,_#ebe7e2)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-14 lg:px-8 lg:py-20">
            <div className="animate-fadeIn">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-800">
                {config.hero.badge}
              </p>
              <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-6xl lg:text-[4.5rem]">
                {config.hero.heading}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                {config.hero.description}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/member-explore"
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-rose-800 px-6 text-sm font-semibold text-white shadow-lg shadow-rose-950/15 transition duration-200 hover:-translate-y-0.5 hover:bg-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2 motion-reduce:transform-none"
                >
                  {config.hero.primaryButtonText}
                </Link>
                <Link
                  href="/staff-login"
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-slate-300 bg-white/80 px-6 text-sm font-semibold text-slate-800 transition-colors hover:border-rose-800 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800 focus-visible:ring-offset-2"
                >
                  {config.hero.secondaryButtonText}
                </Link>
              </div>
              <p className="mt-7 text-xs font-medium text-slate-500">
                Configurable operations · Member access · Governed AI assistance
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-[560px] animate-fadeIn lg:ml-auto">
              <div className="relative min-h-[360px] overflow-hidden rounded-[1.8rem] bg-slate-300 shadow-[0_30px_75px_rgba(15,23,42,0.18)] sm:min-h-[470px]">
                {config.hero.imageUrl && (
                  <Image
                    src={config.hero.imageUrl}
                    alt={config.hero.imageAlt || 'Hero visual'}
                    fill
                    priority
                    unoptimized
                    sizes="(max-width: 1023px) 100vw, 48vw"
                    className="object-cover object-center"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-slate-950/5 to-transparent" />
                <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/20 bg-slate-950/45 p-4 text-white backdrop-blur-md sm:inset-x-6 sm:bottom-6 sm:p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-rose-200">
                    {config.hero.overlayBadge}
                  </p>
                  <p className="mt-2 max-w-sm text-xl font-semibold leading-7 sm:text-2xl">
                    {config.hero.overlayHeading}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* L2 — Movement Categories */}
        <section id="programs" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-20">
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
                key={modality.id || modality.title}
                id={modality.title.toLowerCase()}
                className={`group relative isolate flex min-h-44 flex-col justify-end overflow-hidden rounded-2xl bg-slate-300 p-4 text-white sm:min-h-56 sm:p-5 ${
                  index === 0 ? 'sm:col-span-2 sm:row-span-2 sm:min-h-[29rem]' : ''
                }`}
              >
                {modality.imageUrl && (
                  <Image
                    src={modality.imageUrl}
                    alt={modality.title}
                    fill
                    unoptimized
                    priority={index === 3}
                    loading={index === 3 ? 'eager' : 'lazy'}
                    sizes={index === 0 ? '(max-width: 639px) 50vw, 66vw' : '(max-width: 639px) 50vw, 33vw'}
                    className="-z-10 object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transform-none"
                  />
                )}
                <span className="absolute inset-0 -z-10 bg-gradient-to-t from-slate-950/80 via-slate-950/5 to-transparent" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-white/75">
                  {modality.categoryLabel}
                </span>
                <h3 className="mt-1 flex items-center justify-between gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  <span>{modality.title}</span>
                  <span aria-hidden="true" className="text-lg transition-transform duration-200 group-hover:translate-x-1">
                    ↗
                  </span>
                </h3>
              </article>
            ))}
          </div>
        </section>

        {/* L3 - L6: Editorial Stories */}
        <section
          id="studio-operations"
          aria-label="Fitness AI platform stories"
          className="space-y-14 bg-white px-4 py-16 sm:space-y-20 sm:px-6 sm:py-20 lg:space-y-24 lg:px-8 lg:py-24"
        >
          {/* L3 — Studio Management */}
          <div className="mx-auto max-w-7xl">
            <EditorialStory story={config.l3StudioManagement} />
          </div>
          {/* L4 — Member Portal Experience */}
          <div className="mx-auto max-w-7xl">
            <EditorialStory story={config.l4MembershipExperience} reverse />
          </div>
          {/* L5 — Connected Workflows */}
          <div className="mx-auto max-w-7xl">
            <EditorialStory story={config.l5ConnectedJourneys} />
          </div>
          {/* L6 — Assistive AI */}
          <div className="mx-auto max-w-7xl">
            <EditorialStory story={config.l6AiAssistance} reverse />
          </div>
        </section>

        {/* L7 — Studio Platform Features */}
        <LandingPageFeaturesSection config={config.l7Features} />

        {/* L8 — Final Call to Action */}
        <section id="access" className="bg-slate-950 px-4 py-16 text-white sm:px-6 sm:py-20 lg:px-8">
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
              <Link
                href="/member-explore"
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                {config.l8FinalCta.primaryButtonText}
              </Link>
              <Link
                href="/staff-login"
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/30 px-5 text-sm font-semibold text-white transition-colors hover:border-rose-300 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                {config.l8FinalCta.secondaryButtonText}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter
        brandName={config.footer.studioName || config.header.studioName || 'Fitness AI'}
        logoUrl={config.footer.logoUrl || config.header.logoUrl || undefined}
        description={config.footer.description}
        exploreHeading={config.footer.exploreHeading}
        exploreLinks={config.footer.exploreLinks}
        accessHeading={config.footer.accessHeading}
        accessLinks={config.footer.accessLinks}
        copyright={config.footer.copyright || 'Fitness AI. All rights reserved.'}
      />

      {/* Floating Enquiry AI Assistant */}
      <FloatingAIChat
        variant="enquiry"
        title="Enquiry AI"
        subtitle="Your studio assistant"
        welcomeMessage="Hi there! 👋 Welcome to Fitness AI. How can we help you today?"
        studioName={config.header.studioName || 'Fitness AI'}
      />
    </div>
  );
}
