'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { MemberLeftSidebar, type PortalTab } from '@/components/portal/MemberLeftSidebar';
import { PortalDashboard } from '@/components/portal/PortalDashboard';
import { PortalClasses } from '@/components/portal/PortalClasses';
import { PortalPayments } from '@/components/portal/PortalPayments';
import { PortalPass } from '@/components/portal/PortalPass';
import { PortalProfile } from '@/components/portal/PortalProfile';
import { PortalSettings } from '@/components/portal/PortalSettings';
import { FloatingAIChat } from '@/components/chat/FloatingAIChat';
import { useAIChat } from '@/features/ai/hooks/useAIChat';
import { XIcon, QrCodeIcon, MenuIcon, SunIcon, MoonIcon, CalendarIcon } from '@/components/ui/icons';

const VALID_TABS: PortalTab[] = ['home', 'schedule', 'payments', 'profile', 'settings'];

function PortalContent() {
  const router = useRouter();
  const { isAuthenticated, user, isInitialized, activeMembership } = useAuthContext();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<PortalTab>('home');
  const [passModalOpen, setPassModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // AI Chat integration
  const { sendMessage, isLoading, error, sessionId } = useAIChat({
    variant: 'member',
    onMessageReceived: (response) => {
      console.log('AI Response:', response);
    },
    onError: (err) => {
      console.error('AI Chat Error:', err);
    },
  });

  const remainingDays = React.useMemo(() => {
    if (!activeMembership?.expiryDate) return null;
    try {
      const exp = new Date(activeMembership.expiryDate);
      if (isNaN(exp.getTime())) return null;
      const now = new Date();
      return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }, [activeMembership?.expiryDate]);

  const formattedExpiry = React.useMemo(() => {
    if (!activeMembership?.expiryDate) return null;
    try {
      const d = new Date(activeMembership.expiryDate);
      if (isNaN(d.getTime())) return activeMembership.expiryDate;
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return activeMembership.expiryDate;
    }
  }, [activeMembership?.expiryDate]);

  useEffect(() => {
    const saved = localStorage.getItem('b2c_portal_theme');
    const isDark = saved === 'dark';
    setTheme(isDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDark);

    // Ensure documentElement is never polluted when navigating outside B2C portal
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('b2c_portal_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab') as PortalTab;
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  // If user is unauthenticated after initialization, immediately redirect to /member-explore
  useEffect(() => {
    if (isInitialized && !isAuthenticated && !user) {
      const tenant = searchParams.get('tenant') || (typeof window !== 'undefined' ? localStorage.getItem('fitness-studio-tenant-code') : null);
      const target = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';
      router.replace(target);
    }
  }, [isInitialized, isAuthenticated, user, searchParams, router]);

  if (!isInitialized || (!isAuthenticated && !user)) {
    return (
      <div className="min-h-screen bg-[#FCFAF8] dark:bg-slate-950 flex flex-col items-center justify-center font-sans text-slate-500 gap-3">
        <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide uppercase text-slate-400">
          {!isInitialized ? 'Loading Sanctuary Portal...' : 'Redirecting to Member Explore...'}
        </span>
      </div>
    );
  }

  return (
    <div className={`b2c-portal min-h-screen bg-[#FCFAF8] dark:bg-slate-950 flex flex-col lg:flex-row font-sans text-slate-800 dark:text-slate-100 antialiased selection:bg-[#E11D48] selection:text-white transition-colors duration-200 ${theme === 'dark' ? 'dark' : ''}`}>
      {/* ── Desktop Left Sidebar ── */}
      <div className="hidden lg:block w-80 shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors">
        <div className="sticky top-0 h-screen overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <MemberLeftSidebar
            activeTab={activeTab}
            timetableBadge={3}
            onTabChange={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenPassModal={() => setPassModalOpen(true)}
          />
        </div>
      </div>

      {/* ── Mobile Header Bar ── */}
      <div className="lg:hidden bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs transition-colors">
        <button
          type="button"
          onClick={() => setMobileSidebarOpen(true)}
          className="p-2 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <MenuIcon className="w-5 h-5 text-slate-800 dark:text-slate-200" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">Portal Menu</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Mobile Top Right Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            className="p-2 rounded-full border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-700 dark:text-slate-200 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
          >
            {theme === 'light' ? (
              <MoonIcon className="w-4 h-4 text-slate-600" />
            ) : (
              <SunIcon className="w-4 h-4 text-amber-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setPassModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 text-xs font-bold border border-rose-200/80 dark:border-rose-900 hover:bg-rose-100/80 active:scale-95 transition-all shadow-2xs"
          >
            <QrCodeIcon className="w-3.5 h-3.5 text-[#E11D48] dark:text-rose-400" />
            <span>Pass</span>
          </button>
        </div>
      </div>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileSidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex animate-in fade-in duration-200">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="relative w-80 max-w-[85%] bg-white dark:bg-slate-900 h-full shadow-2xl z-10 overflow-y-auto flex flex-col animate-in slide-in-from-left duration-250 transition-colors">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="font-serif font-bold text-sm text-slate-900 dark:text-white">Member Portal</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <MemberLeftSidebar
              activeTab={activeTab}
              timetableBadge={3}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setMobileSidebarOpen(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenPassModal={() => {
                setMobileSidebarOpen(false);
                setPassModalOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto w-full transition-all duration-300">
        {/* Top Header Bar with Live Studio Status, Center Membership Validity Indicator, and Right Dark/Light Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-6 border-b border-slate-200/80 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {user?.studioName || 'ranayaa Sanctuary'} &bull;{' '}
              <span className="text-slate-800 dark:text-slate-200 font-bold">{user?.studioBranch || 'Main Studio'}</span>
            </span>
          </div>

          {/* Center: Membership Validity Indicator (Task 2 & 5) */}
          {activeMembership?.expiryDate ? (
            <div className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border text-xs font-medium shadow-2xs backdrop-blur-md transition-all self-start sm:self-center ${
              remainingDays !== null && remainingDays <= 0
                ? 'bg-rose-50/90 dark:bg-rose-950/60 border-rose-200/90 dark:border-rose-900 text-rose-800 dark:text-rose-300'
                : remainingDays !== null && remainingDays <= 5
                ? 'bg-amber-50/90 dark:bg-amber-950/60 border-amber-200/90 dark:border-amber-900 text-amber-900 dark:text-amber-300'
                : 'bg-white/95 dark:bg-slate-850/90 border-slate-200/90 dark:border-slate-700/90 text-slate-700 dark:text-slate-200'
            }`}>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <CalendarIcon className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
                <span className="text-[11px] font-semibold">Membership Expires:</span>
              </div>
              <strong className="text-slate-900 dark:text-white font-bold">{formattedExpiry}</strong>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide shadow-2xs ${
                remainingDays !== null && remainingDays <= 0
                  ? 'bg-rose-600 text-white'
                  : remainingDays !== null && remainingDays <= 5
                  ? 'bg-amber-500 text-white'
                  : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
              }`}>
                {remainingDays !== null
                  ? remainingDays <= 0
                    ? 'Expired'
                    : `${remainingDays} Days Left`
                  : 'Active'}
              </span>
            </div>
          ) : (
            <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
              <span>Pass:</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{activeMembership?.planName || 'Active'}</span>
            </div>
          )}

          {/* Top Right: Light to Dark Mode Toggle Switch */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-850 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer active:scale-95 text-xs font-semibold"
            >
              {theme === 'light' ? (
                <>
                  <MoonIcon className="w-4 h-4 text-slate-600" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              ) : (
                <>
                  <SunIcon className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              )}
            </button>
          </div>
        </div>

        {activeTab === 'home' && (
          <PortalDashboard
            onNavigateTab={setActiveTab}
            onOpenPass={() => setPassModalOpen(true)}
          />
        )}
        {activeTab === 'schedule' && <PortalClasses />}
        {activeTab === 'payments' && <PortalPayments />}
        {activeTab === 'profile' && <PortalProfile />}
        {activeTab === 'settings' && <PortalSettings />}
      </main>

      {/* ── Sleek Glassmorphic Floating Pass Modal ── */}
      {passModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
            onClick={() => setPassModalOpen(false)}
          />
          <div className="relative bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] max-w-md w-full overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200 transition-colors">
            <div className="p-4 bg-white dark:bg-slate-850 text-slate-900 dark:text-white flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                  Contactless Digital Pass
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPassModalOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[85vh] overflow-y-auto [scrollbar-width:none]">
              <PortalPass />
            </div>
          </div>
        </div>
      )}

      {/* ── Floating Member Assistant (Ask AI) ── */}
      <FloatingAIChat
        variant="member"
        title="Ask AI"
        subtitle="Your personal studio assistant"
        welcomeMessage="Hi! 👋 I'm your studio assistant. I can help with your classes, membership, and studio services."
        studioName={user?.studioName || 'Fitness Studio'}
        theme={theme}
        onSendMessage={sendMessage}
        onMessageReceived={(response) => {
          console.log('AI Response:', response);
        }}
        isBackendConnected={!!sessionId}
      />
    </div>
  );
}

export default function PortalPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FCFAF8] dark:bg-slate-950 flex items-center justify-center font-sans text-slate-400">Loading Sanctuary Portal...</div>}>
      <PortalContent />
    </Suspense>
  );
}
