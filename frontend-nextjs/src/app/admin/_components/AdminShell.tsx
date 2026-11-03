'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from '@/components/ui/icons';
import { studioRoleLabel } from '@/lib/auth/studio-session';
import { AdminThemeProvider, type AdminTheme } from './AdminThemeProvider';
import {
  AdminWorkspaceDataProvider,
  currentStaffStudio,
  generateAdminAuraResponse,
  staffAssistantName,
  staffAssistantPromptMarker,
  useAdminWorkspaceData,
  type LocalAuraAnswer,
} from './AdminDataProvider';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';

const AURA_STORAGE_KEY = 'fitness-studio:aura-turns';

const ADMIN_PROMPTS: string[] = [
  'Which memberships need follow-up this week?',
  'Summarize today’s studio schedule and occupancy.',
  'Which leads need follow-up today?',
  'Which payments are pending or under review?',
  'What is trainer feedback looking like?',
];

function AdminFloatingAuraAssistant() {
  const workspaceState = useAdminWorkspaceData();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [turns, setTurns] = useState<{ id: number; prompt: string; answer: LocalAuraAnswer }[]>([]);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(AURA_STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved));
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(AURA_STORAGE_KEY, JSON.stringify(turns));
    } catch {
      // ignore storage errors
    }
  }, [turns]);

  function askAura(rawText: string) {
    const clean = rawText.trim();
    if (!clean) return;
    const answer = generateAdminAuraResponse(clean, workspaceState);
    setTurns((current) => [...current, { id: Date.now() + Math.floor(Math.random() * 1000), prompt: clean, answer }]);
    setPrompt('');
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7">
      {open && (
        <section
          aria-label={`${staffAssistantName} Studio AI Assistant`}
          className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,.22)] dark:border-studio-700 dark:bg-studio-900"
        >
          <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-studio-800 dark:bg-studio-950">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <SparklesIcon size="sm" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{staffAssistantName} · Studio AI</h2>
                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    {studioRoleLabel('admin')}
                  </span>
                </div>
                <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  {currentStaffStudio.name} · Live Workspace Grounded
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close studio assistant"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-300 dark:hover:bg-studio-800"
            >
              ×
            </button>
          </header>

          <div className="space-y-3 p-4">
            <div
              aria-live="polite"
              className="max-h-72 space-y-2.5 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-studio-800 dark:bg-studio-950/60"
            >
              {turns.length === 0 ? (
                <div className="space-y-2.5">
                  <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Ask {staffAssistantName} about classes, bookings, renewals, CRM leads, trainer feedback, or studio workflows:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ADMIN_PROMPTS.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => askAura(chip)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-left text-[10px] font-semibold text-slate-700 transition hover:border-rose-300 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200 dark:hover:border-rose-500"
                      >
                        {staffAssistantPromptMarker(chip)} {chip}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                turns.map((turn) => (
                  <div key={turn.id} className="space-y-1.5 text-xs">
                    <p className="ml-auto w-fit max-w-[90%] rounded-xl rounded-br-sm bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white">
                      {turn.prompt}
                    </p>
                    <div className="rounded-xl rounded-bl-sm border border-slate-200 bg-white p-2.5 text-slate-800 shadow-sm dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100">
                      <p className="font-semibold text-slate-900 dark:text-white">{turn.answer.topic}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{turn.answer.summary}</p>
                      <ul className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-600 dark:text-slate-300">
                        {turn.answer.bullets.slice(0, 4).map((b, i) => (
                          <li key={i}>• {b}</li>
                        ))}
                      </ul>
                      {turn.answer.actionHref && turn.answer.actionLabel && (
                        <Link
                          href={turn.answer.actionHref}
                          onClick={() => setOpen(false)}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/50 dark:text-rose-300"
                        >
                          {turn.answer.actionLabel}
                          <ArrowRightIcon size="xs" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                askAura(prompt);
              }}
              className="flex gap-2"
            >
              <label className="sr-only" htmlFor="admin-global-aura-prompt">
                Ask Aura Studio Assistant
              </label>
              <input
                id="admin-global-aura-prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Ask about classes, renewals, leads, attendance…"
                className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100 dark:border-studio-700 dark:bg-studio-950 dark:text-white"
              />
              <button
                type="submit"
                disabled={!prompt.trim()}
                className="rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Ask
              </button>
            </form>

            <div className="flex items-center justify-between pt-0.5">
              <Link
                href="/admin/ai-assistant"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-8 items-center gap-1 text-[10px] font-semibold text-rose-700 hover:text-rose-900 dark:text-rose-300"
              >
                Open full assistant workspace
                <ArrowRightIcon size="xs" />
              </Link>
              {turns.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTurns([])}
                  className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  Clear conversation
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      <button
        type="button"
        aria-label={open ? 'Close Aura AI assistant' : 'Open Aura AI assistant'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-12 items-center gap-2 rounded-full bg-rose-600 px-4 text-xs font-bold text-white shadow-[0_8px_24px_rgba(225,29,72,.35)] transition hover:-translate-y-0.5 hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
      >
        <SparklesIcon size="sm" />
        <span>Ask {staffAssistantName}</span>
      </button>
    </div>
  );
}

export function AdminShell({ children, initialTheme }: { children: React.ReactNode; initialTheme: AdminTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <AdminThemeProvider initialTheme={initialTheme}>
      <AdminWorkspaceDataProvider>
        <div className="min-h-screen bg-[var(--staff-page)] text-[var(--staff-text)] lg:flex">
          <AdminSidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <AdminTopBar
              onMenuClick={() => setMobileMenuOpen(true)}
              menuExpanded={mobileMenuOpen}
            />
            <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-20 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
              <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3.5 text-xs leading-5 text-slate-600 shadow-subtle">
                <ShieldCheckIcon size="sm" className="mt-0.5 shrink-0 text-slate-500" />
                <p>
                  Figures reflect the records currently available in this workspace.
                </p>
              </div>
              <div>{children}</div>
            </main>
          </div>
          <AdminFloatingAuraAssistant />
        </div>
      </AdminWorkspaceDataProvider>
    </AdminThemeProvider>
  );
}
