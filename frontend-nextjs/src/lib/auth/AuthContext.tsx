'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';

export function extractErrorMessage(errorData: unknown, fallback: string): string {
  if (!errorData) return fallback;
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData === 'object') {
    const record = errorData as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (Array.isArray(record.message)) return record.message.join(', ');
    if (record.error) {
      if (typeof record.error === 'string') return record.error;
      if (typeof record.error === 'object') {
        const errRecord = record.error as Record<string, unknown>;
        if (typeof errRecord.message === 'string') return errRecord.message;
        if (Array.isArray(errRecord.message)) return errRecord.message.join(', ');
      }
    }
  }
  return fallback;
}

export interface MemberUser {
  id: string;
  memberId: string;
  name: string;
  phone: string;
  email: string;
  avatarUrl?: string;
  joinedDate: string;
  emergencyContact: string;
  healthAlertNote?: string;
  studioName: string;
  studioBranch: string;
}

export interface ActiveMembership {
  planName: string;
  planId: string;
  status: 'active' | 'frozen' | 'pending_freeze' | 'trial' | 'expired';
  remainingCredits: number;
  totalCredits: number;
  startDate: string;
  expiryDate: string;
  priceFormatted: string;
  streakDays: number;
  loyaltyPoints: number;
  loyaltyTier: 'Silver' | 'Gold' | 'Platinum';
  pendingDues: number;
  pendingDuesDescription?: string;
  frozenStartDate?: string;
  frozenEndDate?: string;
}

export const DEMO_PROFILES: {
  user: MemberUser;
  membership: ActiveMembership;
}[] = [
  {
    user: {
      id: 'mem_neha',
      memberId: 'MEM-0042',
      name: 'Neha Sharma',
      phone: '9876543210',
      email: 'neha.sharma@pranayoga.in',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      joinedDate: '2025-06-12',
      emergencyContact: '+91 9811223344 (Dr. Rajesh Sharma)',
      healthAlertNote: 'Recovering from left knee meniscus strain. Avoid deep squats; provide modification block.',
      studioName: 'Prana Yoga & Shala',
      studioBranch: 'Indiranagar Sanctuary',
    },
    membership: {
      planName: '15-Session Shala Credit Pack',
      planId: 'plan_shala_15',
      status: 'active',
      remainingCredits: 12,
      totalCredits: 15,
      startDate: '2026-09-01',
      expiryDate: '2026-10-28',
      priceFormatted: '₹7,500',
      streakDays: 8,
      loyaltyPoints: 450,
      loyaltyTier: 'Gold',
      pendingDues: 850,
      pendingDuesDescription: 'Personal Studio Locker Rental (Oct 2026)',
    },
  },
  {
    user: {
      id: 'mem_aarav',
      memberId: 'MEM-0019',
      name: 'Aarav Mehta',
      phone: '9845088221',
      email: 'aarav.mehta@ziondance.in',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      joinedDate: '2025-02-10',
      emergencyContact: '+91 9920112233 (Pooja Mehta)',
      healthAlertNote: 'Right shoulder rotator cuff impingement. Limit full overhead extensions.',
      studioName: 'Zion Dance Academy',
      studioBranch: 'Bandra Sanctuary',
    },
    membership: {
      planName: 'Monthly Unlimited Movement Pass',
      planId: 'plan_unlimited_movement',
      status: 'active',
      remainingCredits: 99,
      totalCredits: 99,
      startDate: '2026-10-01',
      expiryDate: '2026-10-31',
      priceFormatted: '₹12,500',
      streakDays: 14,
      loyaltyPoints: 820,
      loyaltyTier: 'Platinum',
      pendingDues: 0,
    },
  },
];

interface AuthContextType {
  user: MemberUser | null;
  activeMembership: ActiveMembership | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithOtp: (phone: string, otpCode: string) => Promise<{ success: boolean; message?: string }>;
  requestOtp: (phone: string, purpose: 'login' | 'register' | 'complete_account') => Promise<{ success: boolean; challenge_id?: string; test_otp?: string; message?: string; retry_after?: number; retry_after_minutes?: number }>;
  verifyOtp: (challengeId: string, otp: string, fullName?: string, email?: string) => Promise<{ success: boolean; user?: any; access_token?: string; message?: string }>;
  registerMember: (data: { fullName: string; email: string; phone: string; password: string; confirmPassword: string }) => Promise<{ success: boolean; user?: any; access_token?: string; message?: string }>;
  loginWithEmailPassword: (email: string, password: string) => Promise<{ success: boolean; user?: any; membership?: any; access_token?: string; message?: string }>;
  completeMemberAccount: (data: { challenge_id: string; otp: string; email: string; password: string; confirmPassword: string }) => Promise<{ success: boolean; user?: any; membership?: any; access_token?: string; message?: string }>;
  setAuthenticatedMember: (user: MemberUser, token: string, membership?: ActiveMembership | null) => void;
  loginWithGoogle: (credential: string, profile?: any) => void;
  switchProfile: (index: number) => void;
  isInitialized: boolean;
  logout: (redirectTarget?: unknown) => Promise<void> | void;
  updateUser: (data: Partial<MemberUser>) => void;
  updateMembership: (data: Partial<ActiveMembership>) => void;
  unfreezeMembership: () => void;
  requestFreeze: (startDate: string, endDate: string) => void;
  settleDues: () => void;
  decrementCredit: () => boolean;
  redeemReward: (cost: number) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<MemberUser | null>(null);
  const [activeMembership, setActiveMembership] = useState<ActiveMembership | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem('ws_member_token');
    const storedUser = localStorage.getItem('ws_member_user');
    const storedMembership = localStorage.getItem('ws_member_membership');

    if (storedToken && storedUser) {
      try {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        if (storedMembership) {
          setActiveMembership(JSON.parse(storedMembership));
        }
      } catch (e) {
        console.error('Failed to parse saved session', e);
      }
    }
    setIsInitialized(true);
  }, []);

  const saveState = (newUser: MemberUser | null, newMembership: ActiveMembership | null, newToken: string | null) => {
    setUser(newUser);
    setActiveMembership(newMembership);
    setToken(newToken);
    if (newToken && newUser) {
      localStorage.setItem('ws_member_token', newToken);
      localStorage.setItem('ws_member_user', JSON.stringify(newUser));
      if (newMembership) {
        localStorage.setItem('ws_member_membership', JSON.stringify(newMembership));
      }
    } else {
      localStorage.removeItem('ws_member_token');
      localStorage.removeItem('ws_member_user');
      localStorage.removeItem('ws_member_membership');
    }
  };

  const loginWithOtp = async (phone: string, otpCode: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/member/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otpCode }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: extractErrorMessage(errorData, 'Invalid or expired OTP') };
      }
      const data = await response.json();

      const memberIdStr = data.user_id ? `MEM-${data.user_id.slice(-4).toUpperCase()}` : 'MEM-USER';
      const realUser: MemberUser = {
        id: data.user_id || 'mem_' + Date.now(),
        memberId: memberIdStr,
        name: data.user?.displayName || 'Studio Member',
        phone,
        email: data.user?.email || '',
        joinedDate: new Date().toISOString().split('T')[0],
        emergencyContact: '',
        studioName: 'Wellness Studio',
        studioBranch: 'Main Sanctuary',
      };
      
      saveState(realUser, null, data.access_token || 'http-only-cookie');
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Network error' };
    } finally {
      setIsLoading(false);
    }
  };

  const requestOtp = async (phone: string, purpose: 'login' | 'register' | 'complete_account') => {
    setIsLoading(true);
    try {
      const cleanPhone = phone.replace(/[\s()-]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/otp/request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone: formattedPhone, purpose }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfter =
          typeof errorData?.error?.details?.retry_after === 'number'
            ? errorData.error.details.retry_after
            : retryAfterHeader
            ? parseInt(retryAfterHeader, 10)
            : undefined;
        const retryMinutes =
          typeof errorData?.error?.details?.retry_after_minutes === 'number'
            ? errorData.error.details.retry_after_minutes
            : retryAfter
            ? Math.ceil(retryAfter / 60)
            : undefined;
        return {
          success: false,
          message: extractErrorMessage(errorData, 'Failed to request verification code'),
          retry_after: retryAfter,
          retry_after_minutes: retryMinutes,
        };
      }

      const raw = await response.json();
      const data = raw?.data || raw;
      return {
        success: true,
        challenge_id: data.challenge_id,
        test_otp: data.test_otp,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Network communication error' };
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async (challengeId: string, otp: string, fullName?: string, email?: string) => {
    setIsLoading(true);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/otp/verify`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          challenge_id: challengeId,
          otp,
          ...(fullName ? { full_name: fullName.trim() } : {}),
          ...(email ? { email: email.trim().toLowerCase() } : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: extractErrorMessage(errorData, 'Invalid or expired verification code') };
      }

      const raw = await response.json();
      const data = raw?.data || raw;
      const memberIdStr = data.user_id ? `MEM-${data.user_id.slice(-4).toUpperCase()}` : 'MEM-USER';
      const realUser: MemberUser = {
        id: data.user_id || data.user?.id || 'mem_' + Date.now(),
        memberId: memberIdStr,
        name: data.user?.name || fullName || 'Studio Member',
        phone: data.phone || '',
        email: email || data.user?.email || '',
        joinedDate: new Date().toISOString().split('T')[0],
        emergencyContact: '',
        studioName: 'Fitness AI Sanctuary',
        studioBranch: 'Main Studio',
      };

      saveState(realUser, data.membership || null, data.access_token || 'bearer_jwt');
      return { success: true, user: realUser, access_token: data.access_token, membership: data.membership };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Verification network error' };
    } finally {
      setIsLoading(false);
    }
  };

  const setAuthenticatedMember = (newUser: MemberUser, newToken: string, membership?: ActiveMembership | null) => {
    saveState(newUser, membership ?? null, newToken);
  };

  const loginWithGoogle = (credential: string, profile?: any) => {
    const googleUser: MemberUser = {
      id: `google_${profile?.sub || Date.now()}`,
      memberId: `GOOG-${String(profile?.sub || '0042').slice(-4)}`,
      name: profile?.name || 'Google Practitioner',
      phone: '9876543210',
      email: profile?.email || 'google.member@wellness.in',
      avatarUrl:
        profile?.picture ||
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      joinedDate: new Date().toISOString().split('T')[0],
      emergencyContact: '+91 9876543210 (Google Verified Profile)',
      healthAlertNote: 'Authenticated via Google OAuth 2.0 Identity Services.',
      studioName: 'Prana Yoga & Shala',
      studioBranch: 'Indiranagar Sanctuary',
    };

    const googleMembership: ActiveMembership = {
      planName: '1-Month Unlimited Shala Pass',
      planId: 'plan_unlimited_google',
      status: 'active',
      remainingCredits: 99,
      totalCredits: 99,
      startDate: new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' }),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      priceFormatted: '₹12,500 / mo',
      streakDays: 5,
      loyaltyPoints: 300,
      loyaltyTier: 'Gold',
      pendingDues: 0,
    };

    saveState(googleUser, googleMembership, credential || `google_token_${Date.now()}`);
  };

  const switchProfile = (index: number) => {
    if (process.env.NODE_ENV === 'production') {
      console.warn('Demo profile switching is disabled in production.');
      return;
    }
    const profile = DEMO_PROFILES[index % DEMO_PROFILES.length];
    saveState(profile.user, profile.membership, `bearer_jwt_${Date.now()}`);
  };

  const logout = async (redirectTarget?: unknown) => {
    const redirectUrl = typeof redirectTarget === 'string' && redirectTarget ? redirectTarget : '/member-explore';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      await fetch('/api/auth/member/logout', { method: 'POST', signal: controller.signal }).catch(() => {});
      clearTimeout(timeoutId);
    } catch {}
    saveState(null, null, null);
    if (typeof window !== 'undefined') {
      try {
        const currentParams = new URLSearchParams(window.location.search);
        const tenantParam = currentParams.get('tenant') || localStorage.getItem('fitness-studio-tenant-code');
        const targetUrl = tenantParam
          ? `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}tenant=${encodeURIComponent(tenantParam)}`
          : redirectUrl;
        window.location.href = targetUrl;
      } catch {
        window.location.href = redirectUrl;
      }
    }
  };

  const updateUser = (data: Partial<MemberUser>) => {
    if (!user) return;
    const updated = { ...user, ...data };
    setUser(updated);
    localStorage.setItem('ws_member_user', JSON.stringify(updated));
  };

  const updateMembership = (data: Partial<ActiveMembership>) => {
    if (!activeMembership) return;
    const updated = { ...activeMembership, ...data };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
  };

  const unfreezeMembership = () => {
    if (!activeMembership) return;
    const updated: ActiveMembership = {
      ...activeMembership,
      status: 'active',
      frozenStartDate: undefined,
      frozenEndDate: undefined,
    };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
  };

  const requestFreeze = (startDate: string, endDate: string) => {
    if (!activeMembership) return;
    const updated: ActiveMembership = {
      ...activeMembership,
      status: 'frozen',
      frozenStartDate: startDate,
      frozenEndDate: endDate,
    };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
  };

  const settleDues = () => {
    if (!activeMembership) return;
    const updated: ActiveMembership = {
      ...activeMembership,
      pendingDues: 0,
      pendingDuesDescription: undefined,
    };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
  };

  const decrementCredit = (): boolean => {
    if (!activeMembership) return false;
    if (activeMembership.status !== 'active') return false;
    if (activeMembership.remainingCredits <= 0) return false;

    const newCredits = activeMembership.planId.includes('unlimited')
      ? activeMembership.remainingCredits
      : activeMembership.remainingCredits - 1;

    const updated: ActiveMembership = {
      ...activeMembership,
      remainingCredits: newCredits,
      streakDays: activeMembership.streakDays + 1,
      loyaltyPoints: activeMembership.loyaltyPoints + 25,
    };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
    return true;
  };

  const redeemReward = (cost: number): boolean => {
    if (!activeMembership || activeMembership.loyaltyPoints < cost) return false;
    const updated: ActiveMembership = {
      ...activeMembership,
      loyaltyPoints: activeMembership.loyaltyPoints - cost,
    };
    setActiveMembership(updated);
    localStorage.setItem('ws_member_membership', JSON.stringify(updated));
    return true;
  };

  const registerMember = async (data: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
  }) => {
    setIsLoading(true);
    try {
      const cleanPhone = data.phone.replace(/[\s()-]/g, '');
      const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+91${cleanPhone}`;
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/register`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fullName: data.fullName.trim(),
          email: data.email.trim().toLowerCase(),
          phone: formattedPhone,
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: extractErrorMessage(errorData, 'Registration failed') };
      }

      const raw = await response.json();
      const resData = raw?.data || raw;
      const memberIdStr = resData.user_id ? `MEM-${resData.user_id.slice(-4).toUpperCase()}` : 'MEM-USER';
      const realUser: MemberUser = {
        id: resData.user_id || resData.user?.id || 'mem_' + Date.now(),
        memberId: memberIdStr,
        name: resData.user?.name || data.fullName.trim(),
        phone: formattedPhone,
        email: data.email.trim().toLowerCase(),
        joinedDate: new Date().toISOString().split('T')[0],
        emergencyContact: '',
        studioName: 'Fitness AI Sanctuary',
        studioBranch: 'Main Studio',
      };

      saveState(realUser, null, resData.access_token || 'bearer_jwt');
      return { success: true, user: realUser, access_token: resData.access_token };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Registration network error' };
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithEmailPassword = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: extractErrorMessage(errorData, 'Login failed. Please check your credentials.') };
      }

      const raw = await response.json();
      const resData = raw?.data || raw;
      const memberIdStr = resData.user_id ? `MEM-${resData.user_id.slice(-4).toUpperCase()}` : 'MEM-USER';
      const realUser: MemberUser = {
        id: resData.user_id || resData.user?.id || 'mem_' + Date.now(),
        memberId: memberIdStr,
        name: resData.user?.name || 'Studio Member',
        phone: resData.user?.phone || resData.phone || '',
        email: resData.user?.email || email.trim().toLowerCase(),
        joinedDate: new Date().toISOString().split('T')[0],
        emergencyContact: '',
        studioName: 'Fitness AI Sanctuary',
        studioBranch: 'Main Studio',
      };

      saveState(realUser, resData.membership || null, resData.access_token || 'bearer_jwt');
      return { success: true, user: realUser, membership: resData.membership, access_token: resData.access_token };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Login network error' };
    } finally {
      setIsLoading(false);
    }
  };

  const completeMemberAccount = async (data: {
    challenge_id: string;
    otp: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => {
    setIsLoading(true);
    try {
      const tenantHost = resolveClientTenantHost();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tenantHost) headers['x-tenant-host'] = tenantHost;

      const apiBaseUrl = resolveClientApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/complete-account`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          challenge_id: data.challenge_id,
          otp: data.otp,
          email: data.email.trim().toLowerCase(),
          password: data.password,
          confirmPassword: data.confirmPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, message: extractErrorMessage(errorData, 'Account setup failed') };
      }

      const raw = await response.json();
      const resData = raw?.data || raw;
      const memberIdStr = resData.user_id ? `MEM-${resData.user_id.slice(-4).toUpperCase()}` : 'MEM-USER';
      const realUser: MemberUser = {
        id: resData.user_id || resData.user?.id || 'mem_' + Date.now(),
        memberId: memberIdStr,
        name: resData.user?.name || 'Studio Member',
        phone: resData.user?.phone || resData.phone || '',
        email: resData.user?.email || data.email.trim().toLowerCase(),
        joinedDate: new Date().toISOString().split('T')[0],
        emergencyContact: '',
        studioName: 'Fitness AI Sanctuary',
        studioBranch: 'Main Studio',
      };

      saveState(realUser, resData.membership || null, resData.access_token || 'bearer_jwt');
      return {
        success: true,
        user: realUser,
        membership: resData.membership,
        access_token: resData.access_token,
        message: resData.message || 'Account setup complete!',
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Account setup network error' };
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeMembership,
        token,
        isAuthenticated: !!user && !!token,
        isInitialized,
        isLoading,
        loginWithOtp,
        requestOtp,
        verifyOtp,
        registerMember,
        loginWithEmailPassword,
        completeMemberAccount,
        setAuthenticatedMember,
        loginWithGoogle,
        switchProfile,
        logout,
        updateUser,
        updateMembership,
        unfreezeMembership,
        requestFreeze,
        settleDues,
        decrementCredit,
        redeemReward,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
