'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  GridIcon,
  LayersIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
  XIcon,
} from '@/components/ui/icons';
import { Camera, Lock, User, Phone, Mail, Loader2, Check } from 'lucide-react';
import { getStudioSession, STUDIO_SESSION_EVENT, updateStudioSessionProfile, type StudioSession } from '@/lib/auth/studio-session';
import { currentStaffStudio } from '@/app/admin/_components/AdminDataProvider';
import { StudioBuddyChatbot } from './StudioBuddyChatbot';
import { StudioNotificationBell } from '@/components/ui/StudioNotificationBell';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { isValidIndianMobile } from '@/lib/localization/india';

export const staffNavItems = [
  { href: '/staff/dashboard', label: 'Staff Dashboard', icon: GridIcon, badge: 'Overview' },
  { href: '/staff/members', label: 'Member Lookup', icon: UsersIcon, badge: 'Profiles' },
  { href: '/staff/classes', label: 'Class & Session Schedule', icon: CalendarIcon, badge: 'Sessions' },
  { href: '/staff/bookings', label: 'Bookings', icon: LayersIcon, badge: 'Roster' },
  { href: '/staff/class-attendance', label: 'Check-in & Attendance', icon: CheckCircleIcon, badge: 'Attendance' },
  { href: '/staff/settings', label: 'Profile & Settings', icon: SettingsIcon, badge: 'Profile' },
] as const;

export function StaffWorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { addToast } = useToast();
  const [session, setSession] = useState<StudioSession | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Profile Editor Modal State
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatar, setEditAvatar] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    const sync = () => {
      const s = getStudioSession();
      setSession(s);
      if (s) {
        setEditName(s.name || '');
        setEditPhone(s.phone || '');
        setEditAvatar(s.avatarUrl || null);
      }
    };
    sync();
    window.addEventListener(STUDIO_SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(STUDIO_SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setIsDark(document.documentElement.classList.contains('dark'));
    }
  }, []);

  function toggleTheme() {
    if (typeof document === 'undefined') return;
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  async function handleSignOut() {
    await fetch('/api/auth/staff/logout', { method: 'POST' }).catch(() => undefined);
    for (const key of [
      'ws_staff_token',
      'ws_staff_user',
      'fitness-studio-demo-session',
      'fitness-studio:entitlements-tier',
      'fitness-studio:entitlements-roles',
    ]) {
      localStorage.removeItem(key);
    }
    router.replace('/staff-login');
    router.refresh();
  }

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      addToast({ type: 'error', title: 'Invalid File', message: 'Please select an image file (PNG, JPG, WebP).' });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast({ type: 'error', title: 'File Too Large', message: 'Profile photo must be under 2MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setEditAvatar(dataUrl);
      addToast({ type: 'success', title: 'Photo Selected', message: 'Click "Save Changes" to persist.' });
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || editName.trim().length < 2) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Enter a valid staff display name.' });
      return;
    }

    if (editPhone && !isValidIndianMobile(editPhone)) {
      addToast({ type: 'error', title: 'Invalid Phone', message: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    if (newPassword && newPassword.length < 12) {
      addToast({ type: 'error', title: 'Password Too Short', message: 'New password must be at least 12 characters.' });
      return;
    }

    setSavingProfile(true);
    try {
      // 1. Password change if requested
      if (newPassword) {
        if (!currentPassword) {
          addToast({ type: 'error', title: 'Current Password Required', message: 'Enter your current password to set a new password.' });
          setSavingProfile(false);
          return;
        }
        await ApiClient.changeStaffPassword({
          current_password: currentPassword,
          new_password: newPassword,
        });
        addToast({ type: 'success', title: 'Password Changed', message: 'Your password was securely updated.' });
        setCurrentPassword('');
        setNewPassword('');
      }

      // 2. Persist profile updates in session and DB
      updateStudioSessionProfile({
        name: editName.trim(),
        email: staffEmail,
        phone: editPhone.trim(),
        avatarUrl: editAvatar ?? undefined,
      });

      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your staff profile details have been saved.',
      });
      setProfileModalOpen(false);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Unable to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  const staffName = session?.name || 'Staff Member';
  const staffEmail = session?.email || 'staff@wellness.studio';
  const staffInitials = staffName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || 'ST';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white text-slate-900 dark:bg-studio-900 dark:text-slate-100">
      {/* Brand Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 p-5 dark:border-studio-800">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-[#E11D48] shadow-xs ring-1 ring-rose-100 dark:bg-rose-950/60 dark:text-rose-400 dark:ring-rose-900/50"
          aria-hidden="true"
        >
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="truncate font-serif text-base font-bold tracking-tight text-slate-900 dark:text-white">
            Fitness AI
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              Staff Portal
            </span>
            <span className="text-[10px] font-medium text-slate-400">·</span>
            <span className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              {currentStaffStudio.name}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links (Section 9: exactly 8 modules) */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Front Desk Modules
        </p>
        <nav className="space-y-1.5">
          {staffNavItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-rose-50 text-[#E11D48] font-bold shadow-xs ring-1 ring-rose-200/70 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900/50'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-studio-800 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`shrink-0 ${isActive ? 'text-[#E11D48] dark:text-rose-400' : 'text-slate-400'}`}>
                    <Icon size="sm" />
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      isActive
                        ? 'bg-rose-200/60 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                        : 'bg-slate-100 text-slate-500 dark:bg-studio-800 dark:text-slate-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Motivational Card — Consistent with Trainer Dashboard */}
      <div className="px-4 pb-3">
        <div
          aria-label="Front Desk Vitality"
          className="relative overflow-hidden rounded-2xl border border-rose-200/80 bg-gradient-to-br from-[#FFF5F6] via-[#FFFBF7] to-[#FFF0F2] p-3.5 shadow-2xs dark:border-studio-800 dark:from-studio-900/90 dark:via-studio-900/70 dark:to-studio-950"
        >
          {/* Subtle background fitness watermark */}
          <div className="pointer-events-none absolute -right-2 -bottom-2 text-rose-500/10 dark:text-rose-400/5 select-none" aria-hidden="true">
            <svg className="h-16 w-16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 5v14h2V5H6zm10 0v14h2V5h-2zM8 11h8v2H8v-2z" />
            </svg>
          </div>

          <div className="relative z-1 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-rose-100/80 text-rose-700 shadow-2xs dark:bg-rose-950/60 dark:text-rose-300 font-serif text-sm font-extrabold leading-none select-none">
                &ldquo;
              </span>
              <h3 className="font-serif text-xs font-bold tracking-tight text-rose-950 dark:text-white truncate">
                Welcoming Vitality
              </h3>
            </div>
            {/* Custom fitness vitality motif */}
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/90 p-1 text-rose-600 shadow-2xs ring-1 ring-rose-200/70 dark:bg-studio-800 dark:text-rose-400 dark:ring-studio-700"
              title="Front Desk Excellence"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 5v14M18 5v14" />
                <rect x="4" y="8" width="4" height="8" rx="1.5" fill="currentColor" fillOpacity="0.18" />
                <rect x="16" y="8" width="4" height="8" rx="1.5" fill="currentColor" fillOpacity="0.18" />
                <line x1="8" y1="12" x2="16" y2="12" strokeWidth="2.5" />
                <path d="M12 4v2M12 18v2M9.5 6.5l1 1M13.5 16.5l1 1" strokeWidth="1.5" strokeOpacity="0.75" />
              </svg>
            </span>
          </div>

          <p className="relative z-1 mt-2.5 font-serif text-[11px] leading-relaxed italic text-slate-700 dark:text-slate-300">
            &ldquo;Every member you greet is taking a step toward vitality and strength. Great front desk energy builds a thriving community.&rdquo;
          </p>
        </div>
      </div>

      {/* Anchored Bottom Footer — Staff Profile & Small Professional Sign Out */}
      <div className="shrink-0 border-t border-rose-100 bg-rose-50/30 p-4 dark:border-studio-800 dark:bg-studio-950/80">
        <div className="flex items-center gap-2.5 px-1">
          {session?.avatarUrl ? (
            <img
              src={session.avatarUrl}
              alt={staffName}
              className="h-8 w-8 shrink-0 rounded-xl object-cover ring-2 ring-rose-200 dark:ring-studio-700"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E11D48] to-rose-600 text-xs font-bold text-white shadow-xs">
              {staffInitials}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-slate-900 dark:text-white leading-tight">{staffName}</p>
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{staffEmail}</p>
          </div>
        </div>

        {/* Small Professional Sign Out button */}
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-[11px] font-semibold text-slate-600 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-300 dark:hover:bg-rose-950/40 cursor-pointer"
        >
          <LogOutIcon size="xs" />
          <span>Sign Out of Studio</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FCFAF8] text-slate-900 lg:flex dark:bg-studio-950 dark:text-slate-100">
      {/* Desktop Left Sidebar (Pure White) */}
      <aside className="hidden w-72 shrink-0 border-r border-slate-200/80 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col dark:border-studio-800 dark:bg-studio-900">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative flex w-full max-w-xs flex-1 flex-col bg-white shadow-2xl dark:bg-studio-900">
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-studio-800 cursor-pointer"
              >
                <XIcon size="sm" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur px-4 py-3 sm:px-6 dark:border-studio-800 dark:bg-studio-900/95">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800 cursor-pointer"
                aria-label="Open sidebar menu"
              >
                <MenuIcon size="sm" />
              </button>
              <div className="hidden sm:flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{currentStaffStudio.name}</span>
                <span className="text-rose-400">·</span>
                <span className="text-slate-600 dark:text-slate-300 normal-case font-medium">Front Desk &amp; Operations</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Notification Bell with Staff Role */}
              <StudioNotificationBell role="staff" />

              {/* Theme Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle visual theme"
                className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800 cursor-pointer"
              >
                {isDark ? <SunIcon size="xs" /> : <MoonIcon size="xs" />}
              </button>

              {/* Top-Right Staff Profile Button with Profile Editing Modal */}
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                title="Click to edit your staff profile"
                className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50/50 dark:border-studio-700 dark:bg-studio-900 dark:hover:border-rose-800 cursor-pointer"
              >
                {session?.avatarUrl ? (
                  <img
                    src={session.avatarUrl}
                    alt={staffName}
                    className="h-7 w-7 rounded-lg object-cover ring-1 ring-rose-200 dark:ring-studio-700"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#E11D48] to-rose-600 text-xs font-bold text-white">
                    {staffInitials}
                  </span>
                )}
                <div className="text-left hidden sm:block">
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{staffName}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold leading-tight flex items-center gap-1">
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    <span>Front Desk · Edit</span>
                  </p>
                </div>
              </button>
            </div>
          </div>
        </header>

        {/* Page Children Content */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 lg:pb-24">
          {children}
        </main>
      </div>

      {/* Floating Staff AI Assistant — Studio Buddy */}
      <StudioBuddyChatbot />

      {/* ==============================================================
          STAFF PROFILE EDITING MODAL (Section 6)
         ============================================================== */}
      <Modal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        title="Edit Staff Profile"
        size="md"
      >
        <form onSubmit={handleSaveProfile} className="space-y-4 pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Update your staff front-desk identity in the studio database. Your registered email is permanently fixed and secure.
          </p>

          {/* Profile Photo Upload / Display */}
          <div className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 dark:border-studio-700 dark:bg-studio-800/50">
            <div className="relative">
              {editAvatar ? (
                <img
                  src={editAvatar}
                  alt={editName}
                  className="h-16 w-16 rounded-2xl object-cover ring-2 ring-rose-200 dark:ring-studio-700"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] to-rose-600 text-xl font-bold text-white shadow-xs">
                  {staffInitials}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-2xs transition hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300 cursor-pointer">
                <Camera className="h-3.5 w-3.5" />
                <span>Upload New Photograph</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </label>
              <p className="mt-1 text-[11px] text-slate-400">JPG, PNG or WebP up to 2MB</p>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Full Name <span className="text-rose-600">*</span>
            </label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Staff Full Name"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Registered Email (Read-only!) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Registered Email (Permanently Fixed)
            </label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                readOnly
                disabled
                value={staffEmail}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-3 text-xs text-slate-500 dark:border-studio-700 dark:bg-studio-800/60 dark:text-slate-400 cursor-not-allowed select-none"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">Email is securely bound to your staff account and cannot be modified.</p>
          </div>

          {/* Mobile Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Mobile Number (India)
            </label>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Password Change Option */}
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5 space-y-3 dark:border-studio-700 dark:bg-studio-800/30">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-rose-600" />
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">Change Password (Optional)</h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">New Password (min 12 chars)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-slate-100"
                />
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-studio-800">
            <button
              type="button"
              onClick={() => setProfileModalOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-studio-700 dark:text-slate-300 dark:hover:bg-studio-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
