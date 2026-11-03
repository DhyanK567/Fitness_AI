'use client';

import React, { useState, useEffect } from 'react';
import {
  LandingPageConfig,
  DEFAULT_LANDING_PAGE_CONFIG,
  calculateConfigPayloadSize,
  SETTINGS_MAX_PAYLOAD_BYTES,
} from '../types/landing-customization.types';
import { ImageCustomizationField } from './ImageCustomizationField';
import { LandingPageLivePreview } from './LandingPageLivePreview';
import {
  loadLandingPageDraft,
  saveLandingPageDraft,
  getStaffAuthStatus,
} from '../api/settings-api';

interface LandingCustomizationEditorProps {
  onNotify?: (type: 'success' | 'error' | 'info', title: string, message: string) => void;
}

export const LandingCustomizationEditor: React.FC<LandingCustomizationEditorProps> = ({ onNotify }) => {
  const [config, setConfig] = useState<LandingPageConfig>(DEFAULT_LANDING_PAGE_CONFIG);
  const [initialConfig, setInitialConfig] = useState<LandingPageConfig>(DEFAULT_LANDING_PAGE_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState<{ isAuthenticated: boolean; tenantHost: string | null }>({
    isAuthenticated: false,
    tenantHost: null,
  });

  // Track active section tab
  const [activeTab, setActiveTab] = useState<string>('header');

  // Load saved configuration on mount
  useEffect(() => {
    const auth = getStaffAuthStatus();
    setAuthStatus({
      isAuthenticated: auth.isAuthenticated,
      tenantHost: auth.tenantHost,
    });

    async function fetchConfiguration() {
      setIsLoading(true);
      const result = await loadLandingPageDraft();
      if (result.success && result.data) {
        // Merge with default to guarantee all fields exist even if partial
        const merged: LandingPageConfig = {
          isPublished: result.data.isPublished !== false,
          header: { ...DEFAULT_LANDING_PAGE_CONFIG.header, ...(result.data.header || {}) },
          hero: { ...DEFAULT_LANDING_PAGE_CONFIG.hero, ...(result.data.hero || {}) },
          movementCategories: {
            ...DEFAULT_LANDING_PAGE_CONFIG.movementCategories,
            ...(result.data.movementCategories || {}),
            items: result.data.movementCategories?.items?.length
              ? result.data.movementCategories.items
              : DEFAULT_LANDING_PAGE_CONFIG.movementCategories.items,
          },
          l3StudioManagement: { ...DEFAULT_LANDING_PAGE_CONFIG.l3StudioManagement, ...(result.data.l3StudioManagement || {}) },
          l4MembershipExperience: { ...DEFAULT_LANDING_PAGE_CONFIG.l4MembershipExperience, ...(result.data.l4MembershipExperience || {}) },
          l5ConnectedJourneys: { ...DEFAULT_LANDING_PAGE_CONFIG.l5ConnectedJourneys, ...(result.data.l5ConnectedJourneys || {}) },
          l6AiAssistance: { ...DEFAULT_LANDING_PAGE_CONFIG.l6AiAssistance, ...(result.data.l6AiAssistance || {}) },
          l7Features: {
            ...DEFAULT_LANDING_PAGE_CONFIG.l7Features,
            ...(result.data.l7Features || {}),
            cards: result.data.l7Features?.cards?.length
              ? result.data.l7Features.cards
              : DEFAULT_LANDING_PAGE_CONFIG.l7Features.cards,
          },
          l8FinalCta: { ...DEFAULT_LANDING_PAGE_CONFIG.l8FinalCta, ...(result.data.l8FinalCta || {}) },
          footer: { ...DEFAULT_LANDING_PAGE_CONFIG.footer, ...(result.data.footer || {}) },
        };
        setConfig(merged);
        setInitialConfig(merged);
        setStatusMessage({
          type: 'info',
          text: `Loaded existing configuration for studio tenant (${auth.tenantHost || 'active studio'}).`,
        });
      } else {
        setConfig(DEFAULT_LANDING_PAGE_CONFIG);
        setInitialConfig(DEFAULT_LANDING_PAGE_CONFIG);
        if (!auth.isAuthenticated) {
          setStatusMessage({
            type: 'info',
            text: 'Editing in local preview mode. Active staff session required to persist changes to PostgreSQL.',
          });
        }
      }
      setIsLoading(false);
    }

    fetchConfiguration();
  }, []);

  const payloadSize = calculateConfigPayloadSize(config);
  const isPayloadTooLarge = payloadSize > SETTINGS_MAX_PAYLOAD_BYTES;
  const hasChanges = JSON.stringify(config) !== JSON.stringify(initialConfig);

  const handleReset = () => {
    setConfig(initialConfig);
    setStatusMessage({ type: 'info', text: 'Unsaved customizations were reset to last saved state.' });
    if (onNotify) {
      onNotify('info', 'Changes Reverted', 'Customizations restored to the last saved configuration.');
    }
  };

  const handleResetToFactoryDefaults = () => {
    setConfig(DEFAULT_LANDING_PAGE_CONFIG);
    setStatusMessage({ type: 'info', text: 'Reset editor to original factory defaults.' });
  };

  const handleSaveAndPublish = async (publish: boolean) => {
    if (!authStatus.isAuthenticated) {
      setStatusMessage({
        type: 'error',
        text: 'Cannot save: You must be logged in with studio management staff credentials.',
      });
      if (onNotify) {
        onNotify('error', 'Authentication Required', 'Please log in as studio staff to save changes.');
      }
      return;
    }

    if (isPayloadTooLarge) {
      setStatusMessage({
        type: 'error',
        text: `Configuration exceeds the 16KB limit (${payloadSize} bytes). Please shorten text or reduce URL lengths.`,
      });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    const result = await saveLandingPageDraft(config, publish);
    setIsSaving(false);

    if (result.success && result.data) {
      setInitialConfig(result.data);
      setConfig(result.data);
      if (typeof window !== 'undefined' && publish) {
        window.dispatchEvent(
          new CustomEvent('fitness-studio-branding-updated', { detail: result.data })
        );
      }
      setStatusMessage({
        type: 'success',
        text: publish
          ? `Changes published live to studio database (${result.payloadSize} bytes). Tenant: ${authStatus.tenantHost || 'active studio'}.`
          : `Draft saved to database (${result.payloadSize} bytes).`,
      });
      if (onNotify) {
        onNotify(
          'success',
          publish ? 'Published Live' : 'Draft Saved',
          publish
            ? 'Landing page updated and visible to public visitors.'
            : 'Draft saved in studio database.'
        );
      }
    } else {
      setStatusMessage({
        type: 'error',
        text: result.message || 'Failed to persist configuration to backend.',
      });
      if (onNotify) {
        onNotify('error', 'Save Failed', result.message || 'The settings service rejected the configuration.');
      }
    }
  };

  // Helper classes for standard inputs
  const inputClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-rose-900';

  const textareaClass =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-rose-900';

  const sectionTabs = [
    { id: 'header', label: 'Header & Brand' },
    { id: 'l1', label: 'L1 — Hero' },
    { id: 'l2', label: 'L2 — Modalities' },
    { id: 'l3', label: 'L3 — Studio Management' },
    { id: 'l4', label: 'L4 — Member Portal' },
    { id: 'l5', label: 'L5 — Workflows' },
    { id: 'l6', label: 'L6 — AI Assistance' },
    { id: 'l7', label: 'L7 — Features (Pricing Replacement)' },
    { id: 'l8', label: 'L8 — Call to Action' },
    { id: 'footer', label: 'Footer' },
  ];

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-rose-600 border-t-transparent" />
        <p className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">Loading studio landing page settings...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* Top Banner / Actions Header */}
      <div className="border-b border-slate-200 p-5 dark:border-slate-800">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-xl">
                Landing Page Customization
              </h2>
              {config.isPublished !== false ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  Published Live
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Draft (Unpublished)
                </span>
              )}
              {authStatus.tenantHost && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Tenant: {authStatus.tenantHost}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Customize your studio&apos;s public landing page branding, hero headline, movement categories, stories, and feature cards.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Payload size indicator */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <span className="font-medium">Payload:</span>
              <span className={isPayloadTooLarge ? 'font-bold text-rose-600' : 'text-slate-700 dark:text-slate-200'}>
                {(payloadSize / 1024).toFixed(1)} KB / 16 KB
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
            >
              👁 Preview Changes
            </button>

            <button
              type="button"
              disabled={!hasChanges}
              onClick={handleReset}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Reset Unsaved
            </button>

            <button
              type="button"
              onClick={handleResetToFactoryDefaults}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-500 hover:bg-slate-50 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-800"
              title="Reset all fields to factory defaults"
            >
              Restore Defaults
            </button>

            <button
              type="button"
              disabled={isSaving || isPayloadTooLarge}
              onClick={() => handleSaveAndPublish(false)}
              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {isSaving ? 'Saving...' : 'Save Draft'}
            </button>

            <button
              type="button"
              disabled={isSaving || isPayloadTooLarge}
              onClick={() => handleSaveAndPublish(true)}
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-rose-700 px-4 text-xs font-semibold text-white shadow-sm hover:bg-rose-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
            >
              {isSaving ? (
                <>
                  <span className="mr-1.5 h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Publishing...
                </>
              ) : (
                '🚀 Publish to Live'
              )}
            </button>
          </div>
        </div>

        {/* Status notification */}
        {statusMessage && (
          <div
            className={`mt-4 rounded-lg p-3 text-xs flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200'
                : statusMessage.type === 'error'
                ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-200'
            }`}
          >
            <span>{statusMessage.text}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="ml-2 font-bold text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
        )}

        {!authStatus.isAuthenticated && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Note:</strong> You are currently editing without an active staff session. You can preview changes immediately, but saving drafts requires authentication as studio staff.
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50/75 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50 scrollbar-thin">
        {sectionTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white font-semibold text-rose-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-rose-200 dark:ring-slate-700'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="p-5 sm:p-6 space-y-6">
        {/* HEADER */}
        {activeTab === 'header' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Header Branding & Navigation</h3>
              <p className="text-xs text-slate-500">Configure studio name, navbar brand logo, and navigation destinations.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Studio Name
                </label>
                <input
                  type="text"
                  value={config.header.studioName}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      header: { ...c.header, studioName: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <ImageCustomizationField
              label="Studio Logo URL"
              description="Displays in the top navigation header bar alongside studio name."
              value={config.header.logoUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  header: { ...c.header, logoUrl: url },
                }))
              }
              recommendedDimensions="120 × 40 px or 48 × 48 px"
              recommendedAspectRatio="1:1 or 3:1"
              placeholder="https://your-studio.com/logo.svg"
            />

            <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
              <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">Header Navigation Links</h4>
              <div className="space-y-2">
                {config.header.navLinks.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...config.header.navLinks];
                        next[idx] = { ...next[idx], label: e.target.value };
                        setConfig((c) => ({ ...c, header: { ...c.header, navLinks: next } }));
                      }}
                      className={`${inputClass} max-w-[180px]`}
                      placeholder="Link Label"
                    />
                    <input
                      type="text"
                      value={item.href}
                      onChange={(e) => {
                        const next = [...config.header.navLinks];
                        next[idx] = { ...next[idx], href: e.target.value };
                        setConfig((c) => ({ ...c, header: { ...c.header, navLinks: next } }));
                      }}
                      className={inputClass}
                      placeholder="/classes or /#programs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* L1 HERO */}
        {activeTab === 'l1' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L1 — Hero Section</h3>
              <p className="text-xs text-slate-500">Configure main welcome headline, subtext, hero image, and action buttons.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Introductory Label (Eyebrow Badge)
                </label>
                <input
                  type="text"
                  value={config.hero.badge}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, badge: e.target.value } }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Main Headline
                </label>
                <input
                  type="text"
                  value={config.hero.heading}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, heading: e.target.value } }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description Subtitle
              </label>
              <textarea
                rows={2}
                value={config.hero.description}
                onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, description: e.target.value } }))}
                className={textareaClass}
              />
            </div>

            <ImageCustomizationField
              label="Hero Feature Image"
              description="Primary image featured on the right side of the hero section."
              value={config.hero.imageUrl}
              onChange={(url) => setConfig((c) => ({ ...c, hero: { ...c.hero, imageUrl: url } }))}
              recommendedDimensions="900 × 900 px (min 600 × 600 px)"
              recommendedAspectRatio="1:1 or 4:3"
            />

            <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Image Overlay Label
                </label>
                <input
                  type="text"
                  value={config.hero.overlayBadge}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, overlayBadge: e.target.value } }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Image Overlay Headline
                </label>
                <input
                  type="text"
                  value={config.hero.overlayHeading}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, overlayHeading: e.target.value } }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Primary Button Label (Links to /member-login)
                </label>
                <input
                  type="text"
                  value={config.hero.primaryButtonText}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, primaryButtonText: e.target.value } }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Secondary Button Label (Links to /staff-login)
                </label>
                <input
                  type="text"
                  value={config.hero.secondaryButtonText}
                  onChange={(e) => setConfig((c) => ({ ...c, hero: { ...c.hero, secondaryButtonText: e.target.value } }))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* L2 MODALITIES */}
        {activeTab === 'l2' && (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L2 — Movement Categories</h3>
              <p className="text-xs text-slate-500">Edit the 6 movement category cards displayed in the programs grid.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.movementCategories.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      movementCategories: { ...c.movementCategories, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Description
                </label>
                <input
                  type="text"
                  value={config.movementCategories.description}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      movementCategories: { ...c.movementCategories, description: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Movement Category Cards (6 items)
              </h4>

              {config.movementCategories.items.map((item, index) => (
                <div
                  key={item.id || index}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                      Card #{index + 1}: {item.title || 'Untitled'}
                    </span>
                    {index === 0 && (
                      <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">
                        Featured Large Card
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 mb-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Category Title
                      </label>
                      <input
                        type="text"
                        value={item.title}
                        onChange={(e) => {
                          const next = [...config.movementCategories.items];
                          next[index] = { ...next[index], title: e.target.value };
                          setConfig((c) => ({
                            ...c,
                            movementCategories: { ...c.movementCategories, items: next },
                          }));
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Descriptive Label
                      </label>
                      <input
                        type="text"
                        value={item.categoryLabel}
                        onChange={(e) => {
                          const next = [...config.movementCategories.items];
                          next[index] = { ...next[index], categoryLabel: e.target.value };
                          setConfig((c) => ({
                            ...c,
                            movementCategories: { ...c.movementCategories, items: next },
                          }));
                        }}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <ImageCustomizationField
                    label={`${item.title} Background Image`}
                    value={item.imageUrl}
                    onChange={(url) => {
                      const next = [...config.movementCategories.items];
                      next[index] = { ...next[index], imageUrl: url };
                      setConfig((c) => ({
                        ...c,
                        movementCategories: { ...c.movementCategories, items: next },
                      }));
                    }}
                    recommendedDimensions="900 × 900 px"
                    recommendedAspectRatio="1:1 (Square) or 4:3"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* L3 STUDIO MANAGEMENT */}
        {activeTab === 'l3' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L3 — Studio Management</h3>
              <p className="text-xs text-slate-500">First editorial section highlighting core studio operations.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Label (Eyebrow)
                </label>
                <input
                  type="text"
                  value={config.l3StudioManagement.label}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l3StudioManagement: { ...c.l3StudioManagement, label: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.l3StudioManagement.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l3StudioManagement: { ...c.l3StudioManagement, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={config.l3StudioManagement.description}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    l3StudioManagement: { ...c.l3StudioManagement, description: e.target.value },
                  }))
                }
                className={textareaClass}
              />
            </div>

            <ImageCustomizationField
              label="Editorial Image"
              value={config.l3StudioManagement.imageUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  l3StudioManagement: { ...c.l3StudioManagement, imageUrl: url },
                }))
              }
              recommendedDimensions="900 × 600 px"
              recommendedAspectRatio="3:2"
            />
          </div>
        )}

        {/* L4 MEMBER EXPERIENCE */}
        {activeTab === 'l4' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L4 — Membership Experience</h3>
              <p className="text-xs text-slate-500">Second editorial section showcasing the member portal experience.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Label (Eyebrow)
                </label>
                <input
                  type="text"
                  value={config.l4MembershipExperience.label}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l4MembershipExperience: { ...c.l4MembershipExperience, label: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.l4MembershipExperience.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l4MembershipExperience: { ...c.l4MembershipExperience, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={config.l4MembershipExperience.description}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    l4MembershipExperience: { ...c.l4MembershipExperience, description: e.target.value },
                  }))
                }
                className={textareaClass}
              />
            </div>

            <ImageCustomizationField
              label="Editorial Image"
              value={config.l4MembershipExperience.imageUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  l4MembershipExperience: { ...c.l4MembershipExperience, imageUrl: url },
                }))
              }
              recommendedDimensions="900 × 600 px"
              recommendedAspectRatio="3:2"
            />
          </div>
        )}

        {/* L5 CONNECTED JOURNEYS */}
        {activeTab === 'l5' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L5 — Connected Studio Journeys</h3>
              <p className="text-xs text-slate-500">Third editorial section illustrating connected workflows.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Label (Eyebrow)
                </label>
                <input
                  type="text"
                  value={config.l5ConnectedJourneys.label}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l5ConnectedJourneys: { ...c.l5ConnectedJourneys, label: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.l5ConnectedJourneys.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l5ConnectedJourneys: { ...c.l5ConnectedJourneys, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={config.l5ConnectedJourneys.description}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    l5ConnectedJourneys: { ...c.l5ConnectedJourneys, description: e.target.value },
                  }))
                }
                className={textareaClass}
              />
            </div>

            <ImageCustomizationField
              label="Editorial Image"
              value={config.l5ConnectedJourneys.imageUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  l5ConnectedJourneys: { ...c.l5ConnectedJourneys, imageUrl: url },
                }))
              }
              recommendedDimensions="900 × 600 px"
              recommendedAspectRatio="3:2"
            />
          </div>
        )}

        {/* L6 AI ASSISTANCE */}
        {activeTab === 'l6' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L6 — AI Assistance</h3>
              <p className="text-xs text-slate-500">Fourth editorial section explaining assistive studio AI.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Label (Eyebrow)
                </label>
                <input
                  type="text"
                  value={config.l6AiAssistance.label}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l6AiAssistance: { ...c.l6AiAssistance, label: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.l6AiAssistance.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l6AiAssistance: { ...c.l6AiAssistance, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={3}
                value={config.l6AiAssistance.description}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    l6AiAssistance: { ...c.l6AiAssistance, description: e.target.value },
                  }))
                }
                className={textareaClass}
              />
            </div>

            <ImageCustomizationField
              label="Editorial Image"
              value={config.l6AiAssistance.imageUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  l6AiAssistance: { ...c.l6AiAssistance, imageUrl: url },
                }))
              }
              recommendedDimensions="900 × 600 px"
              recommendedAspectRatio="3:2"
            />
          </div>
        )}

        {/* L7 FEATURES (PRICING REPLACEMENT) */}
        {activeTab === 'l7' && (
          <div className="space-y-6">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                L7 — Feature Cards (Replacing Public Pricing)
              </h3>
              <p className="text-xs text-slate-500">
                Replaces public pricing plans with the four core studio capability cards.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Heading
                </label>
                <input
                  type="text"
                  value={config.l7Features.heading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l7Features: { ...c.l7Features, heading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Description
                </label>
                <input
                  type="text"
                  value={config.l7Features.description}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l7Features: { ...c.l7Features, description: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Four Platform Capability Cards
              </h4>

              {config.l7Features.cards.map((card, idx) => (
                <div
                  key={card.id || idx}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                      Feature #{idx + 1}:
                    </span>
                    <span className="text-xs text-slate-500 capitalize">({card.icon} icon)</span>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Feature Title
                      </label>
                      <input
                        type="text"
                        value={card.title}
                        onChange={(e) => {
                          const next = [...config.l7Features.cards];
                          next[idx] = { ...next[idx], title: e.target.value };
                          setConfig((c) => ({
                            ...c,
                            l7Features: { ...c.l7Features, cards: next },
                          }));
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Feature Description
                      </label>
                      <textarea
                        rows={2}
                        value={card.description}
                        onChange={(e) => {
                          const next = [...config.l7Features.cards];
                          next[idx] = { ...next[idx], description: e.target.value };
                          setConfig((c) => ({
                            ...c,
                            l7Features: { ...c.l7Features, cards: next },
                          }));
                        }}
                        className={textareaClass}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* L8 FINAL CTA */}
        {activeTab === 'l8' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">L8 — Final Call to Action</h3>
              <p className="text-xs text-slate-500">Edit bottom dark-navy section heading, description, and button text.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Section Label (Eyebrow)
                </label>
                <input
                  type="text"
                  value={config.l8FinalCta.label}
                  onChange={(e) => setConfig((c) => ({ ...c, l8FinalCta: { ...c.l8FinalCta, label: e.target.value } }))}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Heading
                </label>
                <input
                  type="text"
                  value={config.l8FinalCta.heading}
                  onChange={(e) => setConfig((c) => ({ ...c, l8FinalCta: { ...c.l8FinalCta, heading: e.target.value } }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description
              </label>
              <textarea
                rows={2}
                value={config.l8FinalCta.description}
                onChange={(e) => setConfig((c) => ({ ...c, l8FinalCta: { ...c.l8FinalCta, description: e.target.value } }))}
                className={textareaClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Primary Button Label (Links to /member-login)
                </label>
                <input
                  type="text"
                  value={config.l8FinalCta.primaryButtonText}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l8FinalCta: { ...c.l8FinalCta, primaryButtonText: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Secondary Button Label (Links to /staff-login)
                </label>
                <input
                  type="text"
                  value={config.l8FinalCta.secondaryButtonText}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      l8FinalCta: { ...c.l8FinalCta, secondaryButtonText: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        )}

        {/* FOOTER */}
        {activeTab === 'footer' && (
          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-2 dark:border-slate-800">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Footer Configuration</h3>
              <p className="text-xs text-slate-500">Configure footer brand name, logo, summary description, explore/access links, and copyright note.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Footer Studio Name
                </label>
                <input
                  type="text"
                  value={config.footer.studioName}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      footer: { ...c.footer, studioName: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Copyright Text
                </label>
                <input
                  type="text"
                  value={config.footer.copyright}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      footer: { ...c.footer, copyright: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <ImageCustomizationField
              label="Footer Logo URL"
              description="Custom logo displayed in the dark footer area."
              value={config.footer.logoUrl}
              onChange={(url) =>
                setConfig((c) => ({
                  ...c,
                  footer: { ...c.footer, logoUrl: url },
                }))
              }
              recommendedDimensions="120 × 40 px or 48 × 48 px"
              recommendedAspectRatio="1:1 or 3:1"
              placeholder="https://your-studio.com/logo-light.svg"
            />

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Footer Description
              </label>
              <textarea
                rows={2}
                value={config.footer.description}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    footer: { ...c.footer, description: e.target.value },
                  }))
                }
                className={textareaClass}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Explore Section Heading
                </label>
                <input
                  type="text"
                  value={config.footer.exploreHeading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      footer: { ...c.footer, exploreHeading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
                <div className="mt-2 space-y-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Explore Links</span>
                  {config.footer.exploreLinks.map((item, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => {
                          const next = [...config.footer.exploreLinks];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setConfig((c) => ({ ...c, footer: { ...c.footer, exploreLinks: next } }));
                        }}
                        className={`${inputClass} max-w-[120px]`}
                        placeholder="Label"
                      />
                      <input
                        type="text"
                        value={item.href}
                        onChange={(e) => {
                          const next = [...config.footer.exploreLinks];
                          next[idx] = { ...next[idx], href: e.target.value };
                          setConfig((c) => ({ ...c, footer: { ...c.footer, exploreLinks: next } }));
                        }}
                        className={inputClass}
                        placeholder="/path"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Access Section Heading
                </label>
                <input
                  type="text"
                  value={config.footer.accessHeading}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      footer: { ...c.footer, accessHeading: e.target.value },
                    }))
                  }
                  className={inputClass}
                />
                <div className="mt-2 space-y-1.5">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Access Links</span>
                  {config.footer.accessLinks.map((item, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => {
                          const next = [...config.footer.accessLinks];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setConfig((c) => ({ ...c, footer: { ...c.footer, accessLinks: next } }));
                        }}
                        className={`${inputClass} max-w-[120px]`}
                        placeholder="Label"
                      />
                      <input
                        type="text"
                        value={item.href}
                        onChange={(e) => {
                          const next = [...config.footer.accessLinks];
                          next[idx] = { ...next[idx], href: e.target.value };
                          setConfig((c) => ({ ...c, footer: { ...c.footer, accessLinks: next } }));
                        }}
                        className={inputClass}
                        placeholder="/path"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Preview Modal */}
      {isPreviewOpen && (
        <LandingPageLivePreview config={config} onClose={() => setIsPreviewOpen(false)} />
      )}
    </div>
  );
};
