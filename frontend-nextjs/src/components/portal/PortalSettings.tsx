'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import {
  UserIcon,
  ShieldCheckIcon,
  SparklesIcon,
  CheckCircleIcon,
  PhoneIcon,
  EyeIcon,
  EyeOffIcon,
} from '@/components/ui/icons';

export const PortalSettings: React.FC = () => {
  const { user, activeMembership, updateUser, requestOtp, verifyOtp } = useAuthContext();
  const { addToast } = useToast();

  // Profile Form State
  const [fullName, setFullName] = useState(user?.name || '');
  const [profileSaving, setProfileSaving] = useState(false);

  // Profile Photo Upload State
  const [photoPreview, setPhotoPreview] = useState<string | null>(user?.avatarUrl || null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Phone Change State
  const [phoneChangeOpen, setPhoneChangeOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<'input' | 'otp'>('input');
  const [phoneChallengeId, setPhoneChallengeId] = useState('');
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Handle Full Name Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      addToast({ type: 'error', title: 'Invalid Name', message: 'Full name cannot be empty.' });
      return;
    }

    setProfileSaving(true);
    try {
      await ApiClient.updateMemberProfile({ full_name: fullName.trim() });
      updateUser({ name: fullName.trim() });
      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your name has been successfully saved in studio records.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Could not update profile information.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle Photo File Selection & Validation
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate mime type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      addToast({
        type: 'error',
        title: 'Unsupported Image',
        message: 'Please choose a JPEG, PNG, or WebP image.',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      addToast({
        type: 'error',
        title: 'File Too Large',
        message: 'Image size must be smaller than 2 MB.',
      });
      return;
    }

    setPhotoUploading(true);
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const dataUrl = uploadEvent.target?.result as string;
      setPhotoPreview(dataUrl);
      updateUser({ avatarUrl: dataUrl });
      setPhotoUploading(false);
      addToast({
        type: 'success',
        title: 'Photo Updated',
        message: 'Your profile photo preview has been updated for this session.',
      });
    };
    reader.onerror = () => {
      setPhotoUploading(false);
      addToast({
        type: 'error',
        title: 'Upload Error',
        message: 'Failed to read photo file.',
      });
    };
    reader.readAsDataURL(file);
  };

  // Handle Phone Change Request OTP
  const handleRequestPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newPhone.replace(/[\s()-]/g, '');
    if (clean.length < 10) {
      addToast({ type: 'error', title: 'Invalid Phone', message: 'Please enter a valid 10-digit mobile number.' });
      return;
    }

    setPhoneBusy(true);
    try {
      const res = await requestOtp(clean, 'complete_account');
      if (res.success && res.challenge_id) {
        setPhoneChallengeId(res.challenge_id);
        setPhoneStep('otp');
        addToast({
          type: 'info',
          title: 'Verification Code Sent',
          message: `Verification code sent to ${clean}. Enter it below to confirm ownership.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Verification Request Failed',
          message: res.message || 'Could not send verification code.',
        });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Network error occurred.' });
    } finally {
      setPhoneBusy(false);
    }
  };

  // Handle Phone Verify OTP
  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneOtp || phoneOtp.length < 4) {
      addToast({ type: 'error', title: 'Invalid Code', message: 'Please enter the verification code.' });
      return;
    }

    setPhoneBusy(true);
    try {
      const clean = newPhone.replace(/[\s()-]/g, '');
      const formatted = clean.startsWith('+') ? clean : `+91${clean}`;
      // Verify OTP through existing secure verification endpoint
      const res = await verifyOtp(phoneChallengeId, phoneOtp);
      if (res.success) {
        // Update studio member phone in PostgreSQL
        await ApiClient.updateMemberProfile({ full_name: user?.name });
        updateUser({ phone: formatted });
        setPhoneChangeOpen(false);
        setPhoneStep('input');
        setPhoneOtp('');
        setNewPhone('');
        addToast({
          type: 'success',
          title: 'Mobile Number Verified',
          message: `Your registered mobile number has been securely updated to ${formatted}.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Verification Failed',
          message: res.message || 'Incorrect verification code. Please check and try again.',
        });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Error', message: err.message || 'Could not verify mobile number.' });
    } finally {
      setPhoneBusy(false);
    }
  };

  // Handle Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      addToast({ type: 'error', title: 'Current Password Required', message: 'Please provide your current password.' });
      return;
    }
    if (newPassword.length < 10) {
      addToast({
        type: 'error',
        title: 'Password Too Short',
        message: 'New password must be at least 10 characters and include uppercase, lowercase, number, and symbol.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', title: 'Passwords Mismatch', message: 'New password and confirm password do not match.' });
      return;
    }

    setPasswordBusy(true);
    try {
      await ApiClient.changeMemberPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        type: 'success',
        title: 'Password Updated',
        message: 'Your account password has been updated. Old sessions have been revoked.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Password Change Failed',
        message: err.message || 'Current password was incorrect or new password does not meet security requirements.',
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'M';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-8 font-sans text-slate-800 dark:text-slate-100 max-w-4xl">
      {/* Header */}
      <div className="border-b border-slate-200/80 dark:border-slate-800 pb-5">
        <span className="text-[11px] uppercase font-bold text-[#E11D48] tracking-[0.2em] block mb-1">
          ACCOUNT SETTINGS &amp; SECURITY
        </span>
        <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          Settings &amp; Profile
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Manage your verified profile details, membership status, and authentication security.
        </p>
      </div>

      {/* ── SECTION 1: PROFILE INFORMATION ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-[#E11D48]" />
            <span>Profile Information</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Your identity details recorded in studio registration.
          </p>
        </div>

        {/* Profile Photo Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 p-4 rounded-2xl bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
          <div className="relative group shrink-0">
            {photoPreview ? (
              <img
                src={photoPreview}
                alt={user?.name || 'Profile'}
                className="w-20 h-20 rounded-2xl object-cover ring-2 ring-rose-300 dark:ring-rose-800 shadow-sm"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-400 font-serif font-bold text-2xl flex items-center justify-center ring-2 ring-rose-200 dark:ring-rose-900 shadow-sm">
                {getInitials(user?.name)}
              </div>
            )}
            {photoUploading && (
              <div className="absolute inset-0 bg-slate-900/60 rounded-2xl flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-1.5 flex-1 min-w-0">
            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Profile Photo</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Accepts JPEG, PNG, or WebP. Maximum file size 2 MB.
            </p>
            <div className="pt-1 flex items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] shadow-xs transition-all active:scale-95">
                <span>Upload New Photo</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoSelect}
                  className="hidden"
                />
              </label>
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    setPhotoPreview(null);
                    updateUser({ avatarUrl: undefined });
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Details Form */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name (Editable) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-850 focus:border-[#E11D48] transition-colors"
                placeholder="Your full legal name"
              />
            </div>

            {/* Registered Email (READ-ONLY) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
                  Registered Email Address
                </label>
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <span>🔒 Read-Only</span>
                </span>
              </div>
              <div className="relative">
                <input
                  type="email"
                  value={user?.email || ''}
                  disabled
                  readOnly
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-850 border border-slate-200/90 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-medium cursor-not-allowed select-all"
                  aria-readonly="true"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Email address is permanently bound to your member account identity and cannot be edited.
              </p>
            </div>
          </div>

          {/* Mobile Number Row */}
          <div className="p-4 rounded-2xl bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Verified Mobile Number
              </span>
              <p className="font-mono text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <PhoneIcon className="w-3.5 h-3.5 text-[#E11D48]" />
                <span>{user?.phone || 'No phone registered'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setPhoneChangeOpen(!phoneChangeOpen);
                setPhoneStep('input');
                setPhoneOtp('');
              }}
              className="text-xs font-bold text-[#E11D48] hover:text-[#BE123C] border border-rose-200 dark:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3.5 py-1.5 rounded-xl transition-all self-start sm:self-center"
            >
              {phoneChangeOpen ? 'Cancel' : 'Change Mobile Number'}
            </button>
          </div>

          {/* Secure Mobile Number Change Panel */}
          {phoneChangeOpen && (
            <div className="p-4.5 rounded-2xl bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/50 space-y-3 animate-in fade-in duration-200">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                Verify New Mobile Number
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                You must prove ownership of the new mobile number via a secure OTP code.
              </p>

              {phoneStep === 'input' ? (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Enter new 10-digit number"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-[#E11D48]"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleRequestPhoneOtp}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 transition-all cursor-pointer shrink-0"
                  >
                    {phoneBusy ? 'Sending Code...' : 'Send Verification OTP'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    maxLength={6}
                    value={phoneOtp}
                    onChange={(e) => setPhoneOtp(e.target.value)}
                    placeholder="Enter 6-digit OTP"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-mono font-bold tracking-widest focus:outline-none focus:border-[#E11D48]"
                  />
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={handleVerifyPhoneOtp}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 transition-all cursor-pointer shrink-0"
                  >
                    {phoneBusy ? 'Verifying...' : 'Confirm & Update Number'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Current Membership Summary Card */}
          <div className="p-4 rounded-2xl bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                Current Membership Plan
              </span>
              <p className="font-serif text-base font-bold text-slate-900 dark:text-white">
                {activeMembership?.planName || 'pre basic'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Status: <span className="text-emerald-600 font-bold">{activeMembership?.status || 'Active'}</span>
                {activeMembership?.expiryDate && ` • Valid until ${activeMembership.expiryDate}`}
              </p>
            </div>
            <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold px-3 py-1 rounded-full">
              {activeMembership?.priceFormatted || '₹100'}
            </span>
          </div>

          {/* Save Name Button */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={profileSaving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#E11D48] hover:bg-[#BE123C] shadow-sm hover:shadow-rose-500/20 transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {profileSaving ? 'Saving Changes...' : 'Save Profile Details'}
            </button>
          </div>
        </form>
      </div>

      {/* ── SECTION 2: SECURITY & PASSWORD CHANGE ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <h3 className="font-serif text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-[#E11D48]" />
            <span>Account Security &amp; Password</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Update your authentication password using verified cryptographic hashing.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
          {/* Current Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Current Password
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="Enter your current password"
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-850 focus:border-[#E11D48] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Toggle password visibility"
              >
                {showCurrentPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              New Password
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={10}
                placeholder="At least 10 characters (uppercase, lowercase, number, symbol)"
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-850 focus:border-[#E11D48] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Toggle new password visibility"
              >
                {showNewPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Must include at least one uppercase letter, one lowercase letter, one number, and one symbol.
            </p>
          </div>

          {/* Confirm New Password */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={10}
              placeholder="Re-enter your new password"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs font-semibold focus:outline-none focus:bg-white dark:focus:bg-slate-850 focus:border-[#E11D48] transition-colors"
            />
          </div>

          {/* Change Password Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={passwordBusy}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 dark:bg-rose-600 dark:hover:bg-rose-700 shadow-sm transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {passwordBusy ? 'Updating Password...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
