import { isValidIndianMobile } from '@/lib/localization/india';
import { getApiError, STUDIO_ROLE_HOME, type StudioRole, unwrapApiPayload } from './studio-auth';

export type TeamInviteRole = Extract<StudioRole, 'front_desk' | 'staff' | 'trainer' | 'admin' | 'coach' | 'lead_trainer' | 'biller' | 'accountant'>;
export type TeamInvitationStatus = 'pending' | 'accepted';

export interface TeamInvitation {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: TeamInviteRole;
  studioName: string;
  status: TeamInvitationStatus;
  createdAt?: string;
  expiresAt: string;
  acceptedAt?: string | null;
  userId?: string | null;
}

export interface TeamEnrollment {
  secret: string;
  otpAuthUrl: string;
  recoveryCodes: string[];
}

export const TEAM_INVITATION_EVENT = 'fitness-studio-team-invitation-change';

function emitChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TEAM_INVITATION_EVENT));
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const devTenantCode = typeof window !== 'undefined' ? localStorage.getItem('fitness-studio-tenant-code') : null;
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (devTenantCode) authHeaders['x-tenant-code-dev'] = devTenantCode;

  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders, ...init?.headers },
    cache: 'no-store',
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(getApiError(payload, 'The invitation request could not be completed.'));
  return unwrapApiPayload(payload) as T;
}

export function invitationRoleLabel(role: TeamInviteRole): string {
  if (role === 'trainer') return 'Trainer';
  if (role === 'front_desk') return 'Front Desk';
  if (role === 'admin') return 'Administrator';
  if (role === 'coach') return 'Coach';
  if (role === 'lead_trainer') return 'Lead Trainer';
  if (role === 'biller') return 'Biller';
  if (role === 'accountant') return 'Accountant';
  return 'Staff';
}

export function validateTeamInvitationInput(input: { name: string; email: string; phone: string; role: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.name.trim().length < 2) errors.name = 'Enter the team member’s full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim().toLowerCase())) errors.email = 'Enter a valid work email address.';
  if (!isValidIndianMobile(input.phone)) errors.phone = 'Enter a valid Indian mobile number beginning with 6, 7, 8, or 9.';
  if (!['front_desk', 'staff', 'trainer', 'admin', 'coach', 'lead_trainer', 'biller', 'accountant'].includes(input.role)) errors.role = 'Choose an available team role.';
  return errors;
}

export async function createTeamInvitation(input: { name: string; email: string; phone: string; role: TeamInviteRole; studioName?: string }) {
  const errors = validateTeamInvitationInput(input);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const created = await request<{ invitationId: string; token: string; expiresAt: string; setupUrl: string; emailDelivery: 'sent' | 'not_configured' | 'sandbox_restricted' }>('/api/auth/staff/invitations', {
    method: 'POST',
    body: JSON.stringify({ full_name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone, role: input.role }),
  });
  const invitation: TeamInvitation = {
    id: created.invitationId,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    role: input.role,
    studioName: input.studioName?.trim() || 'Fitness AI',
    status: 'pending',
    expiresAt: created.expiresAt,
  };
  emitChange();
  return { invitation, token: created.token, setupUrl: created.setupUrl, emailDelivery: created.emailDelivery };
}

export async function listTeamInvitations(): Promise<TeamInvitation[]> {
  const rows = await request<unknown>('/api/auth/staff/invitations').catch(() => []);
  const list = Array.isArray(rows)
    ? rows
    : rows && typeof rows === 'object' && Array.isArray((rows as Record<string, unknown>).data)
      ? ((rows as Record<string, unknown>).data as any[])
      : [];
  return list.map((row: any) => ({
    id: row.invitationId,
    name: row.fullName,
    email: row.email,
    phone: row.phone,
    role: row.role,
    studioName: 'Fitness AI',
    status: row.status,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    createdAt: row.createdAt,
    userId: row.userId,
  }));
}

export async function findLatestInvitationByEmail(email: string): Promise<TeamInvitation | null> {
  return (await listTeamInvitations()).filter((item) => item.email === email.trim().toLowerCase()).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0] ?? null;
}

export async function revokeTeamInvitation(invitationId: string): Promise<void> {
  await request(`/api/auth/staff/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' });
  emitChange();
}

export async function resolveTeamInvitation(token: string): Promise<{ invitation: TeamInvitation | null; error?: 'malformed' | 'not_found' | 'expired' | 'completed' | 'revoked' }> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return { invitation: null, error: 'malformed' };
  try {
    const data = await request<{ valid: true; email: string; fullName: string; role: TeamInviteRole; studioName: string; expiresAt: string }>(`/api/auth/staff/invitations/validate?token=${encodeURIComponent(token)}`);
    return { invitation: { name: data.fullName, email: data.email, role: data.role, studioName: data.studioName, status: 'pending', expiresAt: data.expiresAt } };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('expired')) return { invitation: null, error: 'expired' };
    if (message.includes('accepted') || message.includes('already')) return { invitation: null, error: 'completed' };
    if (message.includes('revoked')) return { invitation: null, error: 'revoked' };
    return { invitation: null, error: 'not_found' };
  }
}

export async function createTeamEnrollment(token: string): Promise<TeamEnrollment> {
  const data = await request<{ secret: string; otpauth_url: string; recovery_codes: string[] }>('/api/auth/staff/invitations/enroll', { method: 'POST', body: JSON.stringify({ token }) });
  return { secret: data.secret, otpAuthUrl: data.otpauth_url, recoveryCodes: data.recovery_codes };
}

export async function completeTeamInvitation(input: { token: string; password: string; totpCode: string }) {
  const data = await request<{ user: { id: string; name: string; email: string }; roles: TeamInviteRole[]; role: TeamInviteRole; redirectTo: string }>('/api/auth/staff/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token: input.token, password: input.password, totp_code: input.totpCode }),
  });
  const role = data.role;
  window.localStorage.setItem('ws_staff_user', JSON.stringify({ ...data.user, role }));
  window.dispatchEvent(new Event('fitness-studio-session-change'));
  emitChange();
  return { redirectTo: data.redirectTo || STUDIO_ROLE_HOME[role] };
}

export function addPendingInvitationToRoster(invitation: TeamInvitation) {
  void invitation;
  emitChange();
}

export function markInvitationRevokedInRoster(email: string) {
  void email;
  emitChange();
}

type TeamRosterRecord = { name: string; email: string; role: string; status: string; studio: string; shift: string; phone?: string; invitationId?: string; userId?: string | null };

export async function syncTeamInvitationsWithRoster<T extends TeamRosterRecord>(fallback: T[] = []): Promise<T[]> {
  const invitations = await listTeamInvitations().catch(() => []);
  const byEmail = new Map<string, T>();

  // 1. Seed with baseline roster records
  for (const item of fallback) {
    if (item.email) {
      byEmail.set(item.email.toLowerCase(), { ...item });
    }
  }

  // 2. Overlay live invitations / team members from API
  for (const invitation of invitations) {
    const email = invitation.email.toLowerCase();
    const current = byEmail.get(email) ?? ({} as T);
    byEmail.set(email, {
      ...current,
      name: invitation.name || current.name || email.split('@')[0],
      email: invitation.email,
      phone: invitation.phone || current.phone || '',
      role: invitationRoleLabel(invitation.role) || current.role || 'Staff',
      status: invitation.status === 'accepted' ? 'Active' : 'Pending Setup',
      studio: String(current.studio || invitation.studioName || 'Fitness AI'),
      shift: String(current.shift || (invitation.role === 'trainer' ? '08:00 AM – 02:00 PM' : '09:00 AM – 05:00 PM')),
      invitationId: invitation.id,
      userId: invitation.userId,
    } as T);
  }
  return [...byEmail.values()];
}
