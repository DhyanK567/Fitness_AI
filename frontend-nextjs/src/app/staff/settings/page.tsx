'use client';

import React, { useEffect, useState } from 'react';
import { ApiClient } from '@/lib/api-client';
import { formatIndianMobile, isValidIndianMobile } from '@/lib/localization/india';
import { useToast } from '@/components/ui/Toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  RefreshCwIcon,
  SettingsIcon,
  UsersIcon,
} from '@/components/ui/icons';
import { Camera, Check, KeyRound, Loader2, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { getStudioSession, STUDIO_SESSION_EVENT, updateStudioSessionProfile, type StudioSession } from '@/lib/auth/studio-session';
import { currentStaffStudio } from '@/app/admin/_components/AdminDataProvider';

export default function StaffSettingsPage() {
  const { addToast } = useToast();
  const [session, setSession] = useState<StudioSession | null>(null);

  // Profile fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    const sync = () => {
      const s = getStudioSession();
      setSession(s);
      if (s) {
        setName(s.name || '');
        setPhone(s.phone || '');
        setAvatarUrl(s.avatarUrl || null);
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

  const email = session?.email || 'staff@wellness.studio';
  const staffInitials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase() || 'ST';

  // Photo upload handler
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
      setAvatarUrl(dataUrl);
      addToast({ type: 'success', title: 'Photo Loaded', message: 'Click "Save Profile Changes" to persist.' });
    };
    reader.readAsDataURL(file);
  }

  // Profile save handler
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim().length < 2) {
      addToast({ type: 'error', title: 'Validation Error', message: 'Enter a valid staff full name.' });
      return;
    }

    if (phone && !isValidIndianMobile(phone)) {
      addToast({ type: 'error', title: 'Invalid Mobile Number', message: 'Enter a valid 10-digit Indian mobile number.' });
      return;
    }

    setSavingProfile(true);
    try {
      // Persist in session and DB
      updateStudioSessionProfile({
        name: name.trim(),
        email,
        phone: phone.trim(),
        avatarUrl: avatarUrl ?? undefined,
      });

      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your staff profile has been successfully saved to the database.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Unable to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  }

  // Password change handler
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      addToast({ type: 'error', title: 'Missing Current Password', message: 'Enter your current password.' });
      return;
    }

    if (!newPassword || newPassword.length < 12) {
      addToast({ type: 'error', title: 'Password Too Short', message: 'New password must be at least 12 characters.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', title: 'Passwords Do Not Match', message: 'New password and confirmation must match.' });
      return;
    }

    setSavingPassword(true);
    try {
      await ApiClient.changeStaffPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });

      addToast({
        type: 'success',
        title: 'Password Updated',
        message: 'Your password was securely changed in the database.',
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Password Change Failed',
        message: err.message || 'Unable to change password. Verify your current password.',
      });
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="space-y-6 font-sans max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Profile &amp; Settings
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Manage your verified staff identity, update your photograph, mobile contact, and account security credentials.
        </p>
      </div>

      {/* Profile Card */}
      <section
        aria-label="Staff profile details"
        className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5 dark:border-studio-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
            <User className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
              Personal Information
            </h2>
            <p className="text-xs text-slate-400">
              Your active front desk identity and registered contact details
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveProfile} className="mt-6 space-y-6">
          {/* Profile Photo Section */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 rounded-2xl border border-slate-200/80 bg-[#FCFAF8] p-4.5 dark:border-studio-700 dark:bg-studio-950/40">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="h-20 w-20 rounded-2xl object-cover ring-2 ring-rose-200 dark:ring-studio-700 shadow-xs"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] to-rose-600 text-2xl font-bold text-white shadow-xs">
                  {staffInitials}
                </div>
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white">Profile Photograph</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Displays on front-desk check-in logs and your staff console header.
              </p>
              <div className="pt-1">
                <label className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-700 shadow-2xs hover:bg-rose-50 dark:border-rose-900/60 dark:bg-studio-900 dark:text-rose-300 cursor-pointer">
                  <Camera className="h-3.5 w-3.5" />
                  <span>Upload New Photograph</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handlePhotoSelect}
                  />
                </label>
                <span className="ml-3 text-[11px] text-slate-400">PNG, JPG or WebP up to 2MB</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Full Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Full Display Name <span className="text-rose-600">*</span>
              </label>
              <div className="relative mt-1.5">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Staff Full Name"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-white"
                />
              </div>
            </div>

            {/* Registered Email (Permanently Fixed Read-only!) */}
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Registered Email Address
                </label>
                <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  <span>Fixed</span>
                </span>
              </div>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  readOnly
                  disabled
                  value={email}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-100 pl-10 pr-3.5 text-xs text-slate-500 dark:border-studio-700 dark:bg-studio-800/60 dark:text-slate-400 cursor-not-allowed select-none"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Email address is permanently bound to your staff account for authentication integrity.
              </p>
            </div>

            {/* Mobile Number */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Mobile Number (India)
              </label>
              <div className="relative mt-1.5 max-w-md">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-studio-700 dark:bg-studio-950 dark:text-white"
                />
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                Used for studio operational contacts and internal staff coordination.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
            >
              {savingProfile ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Save Profile Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Password Management Card (Section 6) */}
      <section
        aria-label="Account password security"
        className="rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 shadow-2xs dark:border-studio-800 dark:bg-studio-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 pb-5 dark:border-studio-800">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 dark:bg-studio-800 dark:text-slate-200">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900 dark:text-white">
              Change Account Password
            </h2>
            <p className="text-xs text-slate-400">
              Update your account password using the secure database authentication service
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="mt-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Current Password <span className="text-rose-600">*</span>
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your existing password"
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                New Password <span className="text-rose-600">*</span>
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 12 characters"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Confirm New Password <span className="text-rose-600">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs text-slate-900 focus:border-rose-500 focus:outline-none dark:border-studio-700 dark:bg-studio-950 dark:text-white"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400">
            Password must be at least 12 characters and will be securely hashed in the studio database.
          </p>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50 cursor-pointer dark:bg-studio-800 dark:hover:bg-studio-700"
            >
              {savingPassword ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
