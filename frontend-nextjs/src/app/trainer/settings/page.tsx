'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { getStudioSession, updateStudioSessionProfile, studioRoleLabel } from '@/lib/auth/studio-session';
import {
  User,
  Dumbbell,
  Award,
  Bell,
  Save,
  CheckCircle2,
  Building2,
  ShieldCheck,
  Lock,
  Camera,
  Upload,
} from 'lucide-react';

const availableSpecializations = [
  'Strength & Conditioning',
  'Functional Training',
  'Vinyasa & Hatha Yoga',
  'Reformer Pilates',
  'HIIT & MetCon',
  'Calisthenics & Bodyweight',
  'Mobility & Rehab',
  'Boxing & Combat Fitness',
];

export default function TrainerSettingsPage() {
  const { addToast } = useToast();
  const [sessionRole, setSessionRole] = useState('Studio Trainer');
  const [studioName, setStudioName] = useState('Ranayaa Fitness & Wellness Studio');

  const [profile, setProfile] = useState({
    name: 'Ranaya',
    email: 'trainer2@gmail.com',
    phone: '+91 86188 34127',
    trainerId: 'TRN-IND-0042',
    avatarUrl: null as string | null,
    bio: 'Certified strength and conditioning specialist with 8+ years coaching athletes, mobility restoration, and group fitness transformations.',
    certifications: 'ACE Certified Personal Trainer (CPT), CSCS, Yoga Alliance RYT-500, Red Cross CPR/AED',
  });

  const [selectedSpecializations, setSelectedSpecializations] = useState<string[]>([
    'Strength & Conditioning',
    'Functional Training',
    'HIIT & MetCon',
  ]);

  const [notifications, setNotifications] = useState({
    smsOnAssignment: true,
    classReminder1h: true,
    weeklyReport: false,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const session = getStudioSession();
    if (session) {
      setProfile((prev) => ({
        ...prev,
        name: session.name || prev.name,
        email: session.email || prev.email,
        phone: session.phone || prev.phone,
        avatarUrl: session.avatarUrl ?? null,
        trainerId: session.id ? `TRN-${session.id.slice(0, 8).toUpperCase()}` : prev.trainerId,
      }));
      setSessionRole(studioRoleLabel(session.role));
      if (session.studioName) {
        setStudioName(session.studioName);
      }
    }
  }, []);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
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
      const result = reader.result as string;
      setProfile((prev) => ({ ...prev, avatarUrl: result }));
      addToast({ type: 'success', title: 'Photo Loaded', message: 'Click "Save Profile & Settings" below to persist.' });
    };
    reader.readAsDataURL(file);
  }

  function toggleSpec(spec: string) {
    if (selectedSpecializations.includes(spec)) {
      setSelectedSpecializations(selectedSpecializations.filter((s) => s !== spec));
    } else {
      setSelectedSpecializations([...selectedSpecializations, spec]);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if ((ApiClient as any).updateTrainerProfile) {
        await (ApiClient as any).updateTrainerProfile({
          displayName: profile.name.trim(),
          phoneE164: profile.phone.trim() || undefined,
        });
      }

      const result = updateStudioSessionProfile({
        name: profile.name.trim(),
        email: profile.email,
        phone: profile.phone.trim(),
        avatarUrl: profile.avatarUrl,
      });

      if (result && 'error' in result && result.error) {
        setSaving(false);
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: result.error,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your trainer display name, mobile phone, and photo have been updated in the database.',
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Unable to update trainer profile.',
      });
    } finally {
      setSaving(false);
    }
  }

  const initials = profile.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase() || 'TR';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-rose-200/80 bg-gradient-to-r from-white via-rose-50/40 to-white p-5 shadow-xs dark:border-studio-800 dark:bg-studio-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100/80 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <ShieldCheck className="size-3 text-rose-600" />
              {sessionRole}
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Trainer Profile &amp; Preferences
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage your coach identity, assigned disciplines, accreditations, and studio notification preferences.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-200/70 bg-white/90 px-3.5 py-2 text-xs font-medium text-slate-700 shadow-2xs dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200">
            <Building2 className="size-4 text-rose-600" />
            <span>Assigned Studio: <strong>{studioName}</strong></span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Details Panel */}
        <div className="rounded-2xl border border-rose-200/70 bg-white p-6 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center gap-3 border-b border-rose-100/70 pb-4 dark:border-studio-800">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60 dark:bg-rose-950/50 dark:text-rose-400">
              <User className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Coach Profile Identity</h2>
              <p className="text-xs text-slate-400">Public coach identity visible to assigned members and studio staff</p>
            </div>
          </div>

          {/* Profile Photo Upload / Change Section */}
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-rose-100 bg-rose-50/30 p-4 dark:border-studio-800 dark:bg-studio-950/40">
            <div className="relative shrink-0">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="h-16 w-16 rounded-2xl object-cover ring-2 ring-rose-300 dark:ring-studio-700 shadow-xs"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] to-rose-600 text-lg font-bold text-white shadow-xs">
                  {initials}
                </div>
              )}
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white ring-2 ring-white dark:ring-studio-900">
                <Camera className="h-3 w-3" />
              </span>
            </div>

            <div className="flex-1">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Profile Photograph</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Upload a professional headshot or coaching photograph (PNG, JPG, WebP up to 2MB).
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs hover:bg-rose-50 cursor-pointer dark:border-studio-700 dark:bg-studio-800 dark:text-rose-300">
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="sr-only"
                  />
                </label>
                {profile.avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setProfile((prev) => ({ ...prev, avatarUrl: null }))}
                    className="text-[11px] font-semibold text-slate-400 hover:text-rose-600 cursor-pointer"
                  >
                    Remove Photo
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Display Full Name *
              </label>
              <input
                type="text"
                required
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Mobile Phone (India +91)
              </label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
                placeholder="+91 98765 43210"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                <span>Registered Email (Permanent)</span>
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 normal-case">
                  <Lock className="h-3 w-3" /> Unchangeable
                </span>
              </label>
              <input
                type="email"
                readOnly
                disabled
                value={profile.email}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs font-medium text-slate-500 cursor-not-allowed dark:border-studio-700 dark:bg-studio-800/60 dark:text-slate-400"
              />
              <p className="mt-1 text-[10px] text-slate-400">
                Registered email address cannot be changed. Contact studio admin for login credential modifications.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Trainer ID (System Assigned)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={profile.trainerId}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-500 cursor-not-allowed dark:border-studio-700 dark:bg-studio-800/60 dark:text-slate-400"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
              Coach Bio &amp; Training Philosophy
            </label>
            <textarea
              rows={3}
              value={profile.bio}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
            />
          </div>
        </div>

        {/* Specializations & Modalities */}
        <div className="rounded-2xl border border-rose-200/70 bg-white p-6 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center gap-3 border-b border-rose-100/70 pb-4 dark:border-studio-800">
            <div className="flex size-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600 border border-violet-200/60 dark:bg-violet-950/50 dark:text-violet-400">
              <Dumbbell className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Coaching Specializations</h2>
              <p className="text-xs text-slate-400">Disciplines and training formats for studio member matching</p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2.5">
            {availableSpecializations.map((spec) => {
              const isSelected = selectedSpecializations.includes(spec);
              return (
                <button
                  key={spec}
                  type="button"
                  onClick={() => toggleSpec(spec)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-rose-50/50 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-300'
                  }`}
                >
                  {isSelected && <CheckCircle2 className="size-3.5" />}
                  {spec}
                </button>
              );
            })}
          </div>
        </div>

        {/* Certifications */}
        <div className="rounded-2xl border border-rose-200/70 bg-white p-6 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center gap-3 border-b border-rose-100/70 pb-4 dark:border-studio-800">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-400">
              <Award className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Accreditations &amp; Certifications</h2>
              <p className="text-xs text-slate-400">Industry qualifications, governing bodies, and safety accreditations</p>
            </div>
          </div>

          <div className="mt-4">
            <input
              type="text"
              value={profile.certifications}
              onChange={(e) => setProfile({ ...profile, certifications: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 dark:border-studio-700 dark:bg-studio-800 dark:text-white"
            />
          </div>
        </div>

        {/* Notifications */}
        <div className="rounded-2xl border border-rose-200/70 bg-white p-6 shadow-xs dark:border-studio-800 dark:bg-studio-900">
          <div className="flex items-center gap-3 border-b border-rose-100/70 pb-4 dark:border-studio-800">
            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Bell className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Alerts &amp; Notifications</h2>
              <p className="text-xs text-slate-400">Client assignment updates and scheduled class alerts</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <label className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5 hover:bg-rose-50/30 dark:border-studio-800 dark:hover:bg-studio-800/40 cursor-pointer">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">SMS on New Client Allocation</p>
                <p className="text-[11px] text-slate-400">Receive text notification when admin assigns a member to your roster</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.smsOnAssignment}
                onChange={(e) => setNotifications({ ...notifications, smsOnAssignment: e.target.checked })}
                className="size-4 rounded-sm text-rose-600 focus:ring-rose-500 accent-rose-600"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-slate-100 p-3.5 hover:bg-rose-50/30 dark:border-studio-800 dark:hover:bg-studio-800/40 cursor-pointer">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Class Reminder (1 Hour Prior)</p>
                <p className="text-[11px] text-slate-400">Get a reminder alert before each assigned group or floor class</p>
              </div>
              <input
                type="checkbox"
                checked={notifications.classReminder1h}
                onChange={(e) => setNotifications({ ...notifications, classReminder1h: e.target.checked })}
                className="size-4 rounded-sm text-rose-600 focus:ring-rose-500 accent-rose-600"
              />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-6 py-3 text-xs font-bold text-white shadow-md shadow-rose-600/20 hover:from-rose-700 hover:to-rose-600 disabled:opacity-50 transition cursor-pointer"
          >
            <Save className="size-4" />
            {saving ? 'Saving...' : 'Save Profile & Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
