import { formatIndianMobile, isValidIndianMobile } from '@/lib/localization/india';

export type StudioRole = 'owner' | 'admin' | 'front_desk' | 'staff' | 'trainer' | 'coach' | 'lead_trainer' | 'biller' | 'accountant' | 'member';

export type DemoAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: Exclude<StudioRole, 'member'>;
  studioName?: string;
  plan?: string;
};

export type StudioSession = Pick<DemoAccount, 'id' | 'name' | 'email' | 'phone' | 'role'> & {
  avatarUrl?: string | null;
  studioName?: string;
  plan?: string;
};

const ACCOUNTS_KEY = 'fitness-studio-demo-accounts';
const SESSION_KEY = 'fitness-studio-demo-session';
const PROFILES_KEY = 'fitness-studio-demo-profiles';
export const STUDIO_SESSION_EVENT = 'fitness-studio-session-change';

export const BUILT_IN_DEMO_ACCOUNTS: DemoAccount[] = [
  { id: 'demo-admin', name: 'Studio Admin', email: 'admin@fitnessstudio.demo', phone: '9000000001', password: 'Admin@123', role: 'admin', studioName: 'Prana Yoga & Shala', plan: 'Premium' },
  { id: 'demo-staff', name: 'Front Desk Staff', email: 'staff@fitnessstudio.demo', phone: '9000000002', password: 'Staff@123', role: 'staff', studioName: 'Prana Yoga & Shala', plan: 'Premium' },
  { id: 'demo-trainer', name: 'Studio Trainer', email: 'trainer@fitnessstudio.demo', phone: '9000000003', password: 'Trainer@123', role: 'trainer', studioName: 'Prana Yoga & Shala', plan: 'Premium' },
];

const normalize = (value: string) => value.trim().toLowerCase();
const phoneDigits = (value: string) => value.replace(/\D/g, '');

function getSavedProfiles(): Record<string, Partial<StudioSession>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) as Record<string, Partial<StudioSession>> : {};
  } catch {
    return {};
  }
}

export function getDemoAccounts(): DemoAccount[] {
  if (process.env.NODE_ENV === 'production') return [];
  if (typeof window === 'undefined') return BUILT_IN_DEMO_ACCOUNTS;
  try {
    const saved = window.localStorage.getItem(ACCOUNTS_KEY);
    const profiles = getSavedProfiles();
    const list = [...BUILT_IN_DEMO_ACCOUNTS, ...(saved ? JSON.parse(saved) as DemoAccount[] : [])];
    return list.map((account) => {
      const override = profiles[account.id];
      return override
        ? {
            ...account,
            name: override.name?.trim() || account.name,
            email: override.email?.trim() || account.email,
            phone: override.phone?.trim() || account.phone,
          }
        : account;
    });
  } catch {
    return [...BUILT_IN_DEMO_ACCOUNTS];
  }
}

export function createDemoAccount(input: Omit<DemoAccount, 'id'>): { account?: DemoAccount; error?: string } {
  const name = input.name.trim();
  const email = normalize(input.email);
  const phone = input.phone.trim();
  const password = input.password;
  const studioName = input.studioName?.trim();
  const plan = input.plan;
  if (!name || !email || !password) return { error: 'Name, email, and password are required.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (phone && !isValidIndianMobile(phone)) return { error: 'Enter a valid Indian mobile number or leave it blank.' };
  if (password.length < 6) return { error: 'Use a password with at least 6 characters.' };
  const accounts = getDemoAccounts();
  if (accounts.some((account) => normalize(account.email) === email)) return { error: 'An account already uses this email.' };
  if (phone && accounts.some((account) => account.phone && phoneDigits(account.phone).slice(-10) === phoneDigits(phone).slice(-10))) return { error: 'An account already uses this phone number.' };
  const account: DemoAccount = {
    ...input,
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    email,
    phone: phone ? formatIndianMobile(phone) : '',
    studioName,
    plan,
  };
  if (typeof window !== 'undefined') {
    const dynamic = accounts.filter((saved) => !BUILT_IN_DEMO_ACCOUNTS.some((builtIn) => builtIn.id === saved.id));
    window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([...dynamic, account]));
  }
  return { account };
}

export function authenticateStudioAccount(identifier: string, password: string): { session?: StudioSession; error?: string } {
  if (process.env.NODE_ENV === 'production') {
    return { error: 'Demo accounts are disabled in production.' };
  }
  const value = normalize(identifier);
  const digits = phoneDigits(identifier);
  const account = getDemoAccounts().find((candidate) => normalize(candidate.email) === value || (!!digits && phoneDigits(candidate.phone) === digits));
  if (!account || account.password !== password) return { error: 'Email/phone or password is incorrect. Check the demo credentials and try again.' };
  const { id, name, email, phone, role, studioName, plan } = account;
  const profileOverride = getSavedProfiles()[id];
  const session: StudioSession = {
    id,
    name: profileOverride?.name?.trim() || name,
    email: profileOverride?.email?.trim() || email,
    phone: profileOverride?.phone?.trim() || phone,
    role,
    avatarUrl: profileOverride?.avatarUrl ?? null,
    studioName: studioName || 'Prana Yoga & Shala',
    plan: plan || 'Premium',
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    window.dispatchEvent(new Event(STUDIO_SESSION_EVENT));
  }
  return { session };
}

export function registerStudioAccount(input: {
  studioName: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  plan: string;
}): { session?: StudioSession; error?: string } {
  const studioName = input.studioName.trim();
  if (!studioName) return { error: 'Studio or business name is required.' };

  const createRes = createDemoAccount({
    name: input.name,
    email: input.email,
    phone: input.phone,
    password: input.password,
    role: 'admin',
    studioName,
    plan: input.plan || 'Premium',
  });

  if (createRes.error || !createRes.account) {
    return { error: createRes.error || 'Failed to register studio account.' };
  }

  const authRes = authenticateStudioAccount(input.email, input.password);
  if (authRes.session && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        'fitness-ai:software-subscription',
        JSON.stringify({
          planName: input.plan || 'Premium',
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          daysRemaining: 30,
          status: 'Active',
        }),
      );
      const newLoc = {
        id: `loc-${Date.now()}`,
        name: studioName,
        city: 'Bengaluru',
        branch: 'Main Sanctuary',
        locationLine: `${studioName} · Main Sanctuary`,
        isSample: false,
      };
      window.localStorage.setItem('fitness-studio:selected-location', JSON.stringify(newLoc));
      window.localStorage.setItem('ws_staff_token', `demo_studio_token_${Date.now()}`);
    } catch {
      // ignore storage error
    }
  }

  return authRes;
}

export function getStudioSession(): StudioSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(SESSION_KEY);
    return value ? JSON.parse(value) as StudioSession : null;
  } catch { return null; }
}

export function updateStudioSessionProfile(updates: {
  name: string;
  email: string;
  phone: string;
  avatarUrl?: string | null;
}): { session?: StudioSession; error?: string } {
  const current = getStudioSession();
  if (!current) return { error: 'No active studio session found.' };
  const name = updates.name.trim();
  const email = normalize(updates.email);
  const phone = updates.phone.trim();
  if (!name) return { error: 'Enter your display name.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' };
  if (phone && !isValidIndianMobile(phone)) return { error: 'Enter a valid Indian mobile number.' };
  const nextSession: StudioSession = {
    ...current,
    name,
    email,
    phone: phone ? formatIndianMobile(phone) : '',
    avatarUrl: updates.avatarUrl !== undefined ? updates.avatarUrl : current.avatarUrl ?? null,
  };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    const profiles = getSavedProfiles();
    profiles[current.id] = {
      name: nextSession.name,
      email: nextSession.email,
      phone: nextSession.phone,
      avatarUrl: nextSession.avatarUrl ?? null,
    };
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    window.dispatchEvent(new Event(STUDIO_SESSION_EVENT));
  }
  return { session: nextSession };
}

export function clearStudioSession() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem('fitness-studio:entitlements-tier');
    window.localStorage.removeItem('fitness-studio:entitlements-roles');
    window.dispatchEvent(new Event(STUDIO_SESSION_EVENT));
    window.dispatchEvent(new Event('fitness-studio-entitlements-change'));
  }
}

export function studioRoleHome(role: StudioRole) {
  if (role === 'admin' || role === 'owner') return '/admin/dashboard';
  if (role === 'member') return '/member/home';
  if (role === 'trainer' || role === 'coach' || role === 'lead_trainer') return '/trainer/dashboard';
  return '/staff/dashboard';
}

export function studioRoleLabel(role?: StudioRole | null): string {
  if (role === 'trainer' || role === 'coach' || role === 'lead_trainer') return role === 'lead_trainer' ? 'Lead Trainer' : role === 'coach' ? 'Studio Coach' : 'Studio Trainer';
  if (role === 'biller' || role === 'accountant') return role === 'biller' ? 'Studio Biller' : 'Studio Accountant';
  if (role === 'staff' || role === 'front_desk') return 'Front Desk Staff';
  if (role === 'member') return 'Member';
  return 'Studio Admin';
}
