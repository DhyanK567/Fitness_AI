'use client';

import { useEffect, useState } from 'react';
import { unwrapApiPayload } from './studio-auth';

export type StudioTierCode = 'starter' | 'growth' | 'enterprise';
export const STUDIO_TIER_LABEL: Record<StudioTierCode, string> = { starter: 'Basic', growth: 'Premium', enterprise: 'Ultra Premium' };
export const TEAM_ROLE_TIER: Record<string, StudioTierCode> = {
  front_desk: 'starter', staff: 'starter', trainer: 'starter', admin: 'starter',
  coach: 'growth', lead_trainer: 'growth', biller: 'enterprise', accountant: 'enterprise',
};
const rank: Record<StudioTierCode, number> = { starter: 0, growth: 1, enterprise: 2 };

export function normalizeStudioTier(value?: string | null): StudioTierCode {
  const key = value?.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'enterprise' || key === 'ultra' || key === 'ultra_premium') return 'enterprise';
  if (key === 'growth' || key === 'premium') return 'growth';
  return 'starter';
}

export function tierAllows(current: StudioTierCode, required: StudioTierCode) { return rank[current] >= rank[required]; }

export const ENTITLEMENTS_TIER_KEY = 'fitness-studio:entitlements-tier';
export const ENTITLEMENTS_ROLES_KEY = 'fitness-studio:entitlements-roles';
export const ENTITLEMENTS_CHANGE_EVENT = 'fitness-studio-entitlements-change';

let memoryTier: StudioTierCode | null = null;
let memoryRoles: string[] | null = null;
let inflightPromise: Promise<{ tier: StudioTierCode; roles: string[] } | null> | null = null;
let lastFetchTimestamp = 0;

export function decodeJwtTier(token?: string | null): StudioTierCode | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized)) as { tier?: string };
    return decoded.tier ? normalizeStudioTier(decoded.tier) : null;
  } catch {
    return null;
  }
}

export function getCachedStudioTier(): StudioTierCode {
  if (memoryTier) return memoryTier;
  if (typeof window === 'undefined') return 'starter';
  try {
    const direct = window.localStorage.getItem(ENTITLEMENTS_TIER_KEY);
    if (direct) {
      memoryTier = normalizeStudioTier(direct);
      return memoryTier;
    }
    const token = window.localStorage.getItem('ws_staff_token');
    const tokenTier = decodeJwtTier(token);
    if (tokenTier) {
      memoryTier = tokenTier;
      return memoryTier;
    }
    const subRaw = window.localStorage.getItem('fitness-ai:software-subscription');
    if (subRaw) {
      const sub = JSON.parse(subRaw);
      if (sub.planName) {
        memoryTier = normalizeStudioTier(sub.planName);
        return memoryTier;
      }
    }
  } catch {}
  return 'starter';
}

export function getCachedStudioRoles(): string[] {
  if (memoryRoles) return memoryRoles;
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(ENTITLEMENTS_ROLES_KEY);
    if (saved) {
      memoryRoles = JSON.parse(saved);
      return memoryRoles || [];
    }
  } catch {}
  return [];
}

export function setCachedStudioTier(tier: StudioTierCode) {
  memoryTier = tier;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ENTITLEMENTS_TIER_KEY, tier);
      window.dispatchEvent(new Event(ENTITLEMENTS_CHANGE_EVENT));
    } catch {}
  }
}

export function clearStudioEntitlementsCache() {
  memoryTier = null;
  memoryRoles = null;
  inflightPromise = null;
  lastFetchTimestamp = 0;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(ENTITLEMENTS_TIER_KEY);
      window.localStorage.removeItem(ENTITLEMENTS_ROLES_KEY);
      window.dispatchEvent(new Event(ENTITLEMENTS_CHANGE_EVENT));
    } catch {}
  }
}

export function useStudioEntitlements() {
  const [tier, setTier] = useState<StudioTierCode>(() => getCachedStudioTier());
  const [roles, setRoles] = useState<string[]>(() => getCachedStudioRoles());
  const [loading, setLoading] = useState(() => !memoryTier);

  useEffect(() => {
    let active = true;

    const handleSync = () => {
      const freshTier = getCachedStudioTier();
      const freshRoles = getCachedStudioRoles();
      if (active) {
        setTier(freshTier);
        setRoles(freshRoles);
      }
    };

    window.addEventListener(ENTITLEMENTS_CHANGE_EVENT, handleSync);
    window.addEventListener('storage', handleSync);

    const now = Date.now();
    if (!inflightPromise && now - lastFetchTimestamp > 15000) {
      const token = typeof window !== 'undefined' ? localStorage.getItem('ws_staff_token') : null;
      const devTenantCode = typeof window !== 'undefined' ? localStorage.getItem('fitness-studio-tenant-code') : null;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (devTenantCode) headers['x-tenant-code-dev'] = devTenantCode;

      lastFetchTimestamp = now;
      inflightPromise = fetch('/api/auth/staff/me', { cache: 'no-store', credentials: 'same-origin', headers })
        .then(async (response) => {
          if (!response.ok) throw new Error('Profile unavailable');
          return response.json();
        })
        .then((payload) => {
          const data = unwrapApiPayload(payload);
          const tenant = data.tenant && typeof data.tenant === 'object' ? data.tenant as Record<string, unknown> : {};
          const plan = tenant.tier && typeof tenant.tier === 'object' ? tenant.tier as Record<string, unknown> : {};
          const resolvedTier = normalizeStudioTier(typeof plan.code === 'string' ? plan.code : typeof plan.name === 'string' ? plan.name : undefined);
          const resolvedRoles = Array.isArray(data.roles) ? data.roles.filter((value): value is string => typeof value === 'string') : [];

          memoryTier = resolvedTier;
          memoryRoles = resolvedRoles;
          try {
            window.localStorage.setItem(ENTITLEMENTS_TIER_KEY, resolvedTier);
            window.localStorage.setItem(ENTITLEMENTS_ROLES_KEY, JSON.stringify(resolvedRoles));
          } catch {}
          return { tier: resolvedTier, roles: resolvedRoles };
        })
        .catch(() => null)
        .finally(() => {
          setTimeout(() => { inflightPromise = null; }, 5000);
        });
    }

    if (inflightPromise) {
      inflightPromise.then((result) => {
        if (!active || !result) return;
        setTier(result.tier);
        setRoles(result.roles);
        setLoading(false);
      }).finally(() => {
        if (active) setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      active = false;
      window.removeEventListener(ENTITLEMENTS_CHANGE_EVENT, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  return { tier, tierLabel: STUDIO_TIER_LABEL[tier], roles, loading, allows: (required: StudioTierCode) => tierAllows(tier, required) };
}
