export type StudioRole = 'owner' | 'admin' | 'front_desk' | 'staff' | 'trainer' | 'coach' | 'lead_trainer' | 'biller' | 'accountant';

export interface StudioUser {
  id?: string;
  user_id?: string;
  displayName?: string;
  name?: string;
  email?: string;
  role?: string;
}

export interface StaffSessionPayload {
  access_token: string;
  user?: StudioUser;
  user_id?: string;
  roles?: string[];
  tenant_code?: string;
  tenant_id?: string;
}

export interface EnrollmentPayload {
  enrollment_token: string;
  tenant_code?: string;
}

export const STUDIO_ROLE_HOME: Record<StudioRole, string> = {
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  front_desk: '/staff/dashboard',
  staff: '/staff/dashboard',
  trainer: '/trainer/dashboard',
  coach: '/trainer/dashboard',
  lead_trainer: '/trainer/dashboard',
  biller: '/staff/dashboard',
  accountant: '/staff/dashboard',
};

const ROLE_ALIASES: Record<string, StudioRole> = {
  owner: 'owner',
  admin: 'admin',
  studio_admin: 'admin',
  studio_manager: 'admin',
  manager: 'admin',
  front_desk: 'front_desk',
  frontdesk: 'front_desk',
  receptionist: 'front_desk',
  staff: 'staff',
  trainer: 'trainer',
  coach: 'coach',
  lead_trainer: 'lead_trainer',
  biller: 'biller',
  accountant: 'accountant',
};

export type StudioWorkspace = 'admin' | 'staff' | 'trainer';

export function normalizeStudioRole(value?: string | null): StudioRole | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  return ROLE_ALIASES[normalized] ?? null;
}

export function studioRoleHome(role: StudioRole): string {
  return STUDIO_ROLE_HOME[role];
}

export function studioRoleWorkspace(role: StudioRole): StudioWorkspace {
  if (role === 'owner' || role === 'admin') return 'admin';
  if (role === 'trainer' || role === 'coach' || role === 'lead_trainer') return 'trainer';
  return 'staff';
}

export function isWorkspacePathAllowed(role: StudioRole, pathname: string): boolean {
  const workspace = studioRoleWorkspace(role);
  if (workspace === 'admin') return pathname === '/admin' || pathname.startsWith('/admin/');
  if (workspace === 'trainer') return pathname === '/trainer' || pathname.startsWith('/trainer/') || pathname.startsWith('/lead-trainer');
  return pathname === '/staff' || pathname.startsWith('/staff/') || pathname.startsWith('/front-desk') || pathname.startsWith('/billing');
}

export function workspaceAccessNotice(pathname: string): string {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'Admin authorization required';
  if (pathname === '/trainer' || pathname.startsWith('/trainer/')) return 'Trainer authorization required';
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return 'Staff authorization required';
  return 'This workspace is not available for your role';
}

export const PASSWORD_RULES = [
  { label: '10+ characters', test: (value: string) => value.length >= 10 },
  { label: 'Uppercase', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Number', test: (value: string) => /\d/.test(value) },
  { label: 'Symbol', test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

export function slugifyStudioName(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35);
}

export function unwrapApiPayload<T = Record<string, unknown>>(value: unknown): T {
  if (!value || typeof value !== 'object') return {} as T;
  const root = value as Record<string, unknown>;
  const first = root.data;
  if (!first || typeof first !== 'object') return root as unknown as T;
  const nested = first as Record<string, unknown>;
  return (nested.data && typeof nested.data === 'object'
    ? (nested.data as Record<string, unknown>)
    : nested) as unknown as T;
}

export function getApiError(value: unknown, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const payload = value as Record<string, unknown>;
  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join(' ');
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error && typeof payload.error === 'object') {
    const error = payload.error as Record<string, unknown>;
    if (typeof error.message === 'string') return error.message;
  }
  return fallback;
}

export function getApiErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  if (typeof payload.code === 'string') return payload.code;
  if (typeof payload.errorCode === 'string') return payload.errorCode;
  if (payload.error && typeof payload.error === 'object') {
    const error = payload.error as Record<string, unknown>;
    if (typeof error.code === 'string') return error.code;
    if (typeof error.errorCode === 'string') return error.errorCode;
  }
  return undefined;
}

export function getMfaTicket(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  if (typeof payload.mfaTicket === 'string') return payload.mfaTicket;
  if (typeof payload.mfa_ticket === 'string') return payload.mfa_ticket;
  if (payload.error && typeof payload.error === 'object') {
    const error = payload.error as Record<string, unknown>;
    if (typeof error.mfaTicket === 'string') return error.mfaTicket;
    if (typeof error.mfa_ticket === 'string') return error.mfa_ticket;
  }
  return undefined;
}

export function extractSession(value: unknown): StaffSessionPayload | null {
  const payload = unwrapApiPayload(value);
  if (typeof payload.access_token !== 'string' || !payload.access_token) return null;
  return {
    access_token: payload.access_token,
    user: payload.user && typeof payload.user === 'object' ? (payload.user as StudioUser) : undefined,
    user_id: typeof payload.user_id === 'string' ? payload.user_id : undefined,
    roles: Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === 'string')
      : undefined,
    tenant_code: typeof payload.tenant_code === 'string' ? payload.tenant_code : undefined,
    tenant_id: typeof payload.tenant_id === 'string' ? payload.tenant_id : undefined,
  };
}

export function toBrowserSessionPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const { refresh_token: _refreshToken, ...browserSafePayload } = value as Record<string, unknown>;
  return browserSafePayload;
}

function decodeJwtRole(token: string): string | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { role?: string; roles?: string[] };
    return decoded.role ?? decoded.roles?.[0];
  } catch {
    return undefined;
  }
}

export function resolveStudioRole(session: StaffSessionPayload): StudioRole | null {
  const value = session.user?.role ?? session.roles?.[0] ?? decodeJwtRole(session.access_token);
  return normalizeStudioRole(value);
}

export function persistStudioSession(
  session: StaffSessionPayload,
  fallback: { email: string; name: string; studioName: string; plan?: string },
): string | null {
  const role = resolveStudioRole(session);
  if (!role) return null;

  const user: StudioUser = session.user ?? {
    id: session.user_id ?? 'staff-api-session',
    displayName: fallback.name,
    email: fallback.email,
    role,
  };

  window.localStorage.setItem('ws_staff_token', session.access_token);
  window.localStorage.setItem('ws_staff_user', JSON.stringify(user));
  if (session.tenant_code) {
    window.localStorage.setItem('fitness-studio-tenant-code', session.tenant_code);
  }
  window.localStorage.removeItem('fitness-studio-demo-session');
  const planTier = (fallback.plan?.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'enterprise' || fallback.plan?.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'ultra' || fallback.plan?.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'ultra_premium') ? 'enterprise' : (fallback.plan?.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'growth' || fallback.plan?.trim().toLowerCase().replace(/[\s-]+/g, '_') === 'premium') ? 'growth' : 'starter';
  window.localStorage.setItem('fitness-studio:entitlements-tier', planTier);
  window.dispatchEvent(new Event('fitness-studio-session-change'));
  window.dispatchEvent(new Event('fitness-studio-entitlements-change'));
  return STUDIO_ROLE_HOME[role];
}
