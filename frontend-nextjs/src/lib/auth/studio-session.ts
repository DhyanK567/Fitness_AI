'use client';

import { formatIndianMobile, isValidIndianMobile } from '@/lib/localization/india';
import { normalizeStudioRole, type StudioRole } from './studio-auth';

export type StudioSession = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: StudioRole;
  avatarUrl?: string | null;
  studioName?: string;
  plan?: string;
};

const USER_KEY = 'ws_staff_user';
export const STUDIO_SESSION_EVENT = 'fitness-studio-session-change';

export function getStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as Record<string, unknown>;
    const role = normalizeStudioRole(typeof user.role === 'string' ? user.role : undefined);
    if (!role) return null;
    return {
      id: String(user.id ?? user.user_id ?? ''),
      name: String(user.displayName ?? user.name ?? ''),
      email: String(user.email ?? ''),
      phone: String(user.phone ?? user.phoneE164 ?? ''),
      role,
      avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
      studioName: typeof user.studioName === 'string' ? user.studioName : undefined,
      plan: typeof user.plan === 'string' ? user.plan : undefined,
    };
  } catch {
    return null;
  }
}

export function updateStudioSessionProfile(updates: { name: string; email: string; phone: string; avatarUrl?: string | null }) {
  const current = getStudioSession();
  if (!current) return { error: 'No authenticated staff session found.' };
  const name = updates.name.trim();
  const email = updates.email.trim().toLowerCase();
  const phone = updates.phone.trim();
  if (!name) return { error: 'Enter your display name.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (phone && !isValidIndianMobile(phone)) return { error: 'Enter a valid Indian mobile number.' };
  const session: StudioSession = { ...current, name, email, phone: phone ? formatIndianMobile(phone) : '', avatarUrl: updates.avatarUrl ?? null };
  window.localStorage.setItem(USER_KEY, JSON.stringify({ ...session, displayName: session.name }));
  window.dispatchEvent(new Event(STUDIO_SESSION_EVENT));
  return { session };
}

export function clearStudioSession() {
  if (typeof window === 'undefined') return;
  void fetch('/api/auth/staff/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  for (const key of ['ws_staff_token', USER_KEY, 'fitness-studio:entitlements-tier', 'fitness-studio:entitlements-roles']) {
    window.localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(STUDIO_SESSION_EVENT));
  window.dispatchEvent(new Event('fitness-studio-entitlements-change'));
}

export function studioRoleLabel(role?: StudioRole | null): string {
  if (role === 'lead_trainer') return 'Lead Trainer';
  if (role === 'trainer') return 'Studio Trainer';
  if (role === 'coach') return 'Studio Coach';
  if (role === 'biller') return 'Studio Biller';
  if (role === 'accountant') return 'Studio Accountant';
  if (role === 'staff' || role === 'front_desk') return 'Front Desk Staff';
  return role === 'owner' ? 'Studio Owner' : 'Studio Admin';
}
