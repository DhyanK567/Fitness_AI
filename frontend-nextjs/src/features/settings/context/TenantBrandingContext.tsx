'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { resolveClientTenantHost } from '@/lib/tenant';
import { STUDIO_SESSION_EVENT } from '@/lib/auth/studio-session';
import { loadPublicLandingPageConfig } from '../api/settings-api';
import { LandingPageConfig } from '../types/landing-customization.types';

export const FITNESS_BRANDING_UPDATED_EVENT = 'fitness-studio-branding-updated';

export interface TenantBrandingTheme {
  primaryColor: string; // Sage green #6B8E75
  creamBg: string;      // Cream #FAF8F5
  whiteBg: string;      // #FFFFFF
  charcoalText: string; // Charcoal #1E293B / #0F172A
}

export interface TenantBranding {
  studioName: string;
  logoUrl: string | null;
  tagline: string;
  theme: TenantBrandingTheme;
  isCustomized: boolean;
  isLoading: boolean;
  reloadBranding: () => Promise<void>;
}

const DEFAULT_THEME: TenantBrandingTheme = {
  primaryColor: '#6B8E75', // Sage green
  creamBg: '#FAF8F5',      // Cream
  whiteBg: '#FFFFFF',
  charcoalText: '#1E293B', // Charcoal
};

export const DEFAULT_BRANDING: TenantBranding = {
  studioName: 'Fitness AI',
  logoUrl: null,
  tagline: 'The operating system for wellness studios.',
  theme: DEFAULT_THEME,
  isCustomized: false,
  isLoading: false,
  reloadBranding: async () => {},
};

const TenantBrandingContext = createContext<TenantBranding>(DEFAULT_BRANDING);

// In-memory cache by tenant host to avoid repeated network requests
const brandingCache = new Map<string, { studioName: string; logoUrl: string | null; tagline: string; isCustomized: boolean }>();

export function TenantBrandingProvider({ children }: { children: React.ReactNode }) {
  const [branding, setBranding] = useState<{
    studioName: string;
    logoUrl: string | null;
    tagline: string;
    isCustomized: boolean;
  }>({
    studioName: DEFAULT_BRANDING.studioName,
    logoUrl: DEFAULT_BRANDING.logoUrl,
    tagline: DEFAULT_BRANDING.tagline,
    isCustomized: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentTenantHost, setCurrentTenantHost] = useState<string | null>(null);

  const fetchBranding = useCallback(async (tenantHost: string | null, forceRefresh = false) => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('fitness-studio-branding-name');
        if (stored && /flexibility/i.test(stored)) {
          window.localStorage.removeItem('fitness-studio-branding-name');
        }
      } catch {}
    }
    const cacheKey = tenantHost || 'default';
    if (!tenantHost) {
      const fallback = {
        studioName: DEFAULT_BRANDING.studioName,
        logoUrl: null,
        tagline: DEFAULT_BRANDING.tagline,
        isCustomized: false,
      };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem('fitness-studio-branding-name');
        } catch {}
      }
      brandingCache.set('default', fallback);
      setBranding(fallback);
      setIsLoading(false);
      return;
    }

    if (!forceRefresh && brandingCache.has(cacheKey)) {
      const cached = brandingCache.get(cacheKey)!;
      setBranding(cached);
      return;
    }

    setIsLoading(true);
    try {
      const config = await loadPublicLandingPageConfig(tenantHost);
      if (config && config.isPublished !== false) {
        let studioName = config.header?.studioName || config.footer?.studioName || DEFAULT_BRANDING.studioName;
        let tagline = config.hero?.heading || config.hero?.badge || DEFAULT_BRANDING.tagline;
        if (/flexibility/i.test(studioName)) {
          studioName = DEFAULT_BRANDING.studioName;
        }
        if (/flexibility/i.test(tagline)) {
          tagline = DEFAULT_BRANDING.tagline;
        }
        const logoUrl = config.header?.logoUrl || config.footer?.logoUrl || null;

        const resolved = {
          studioName,
          logoUrl,
          tagline,
          isCustomized: true,
        };
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem('fitness-studio-branding-name', studioName);
          } catch {}
        }
        brandingCache.set(cacheKey, resolved);
        setBranding(resolved);
      } else {
        const fallback = {
          studioName: DEFAULT_BRANDING.studioName,
          logoUrl: null,
          tagline: DEFAULT_BRANDING.tagline,
          isCustomized: false,
        };
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.removeItem('fitness-studio-branding-name');
          } catch {}
        }
        brandingCache.set(cacheKey, fallback);
        setBranding(fallback);
      }
    } catch {
      // In case of error, preserve existing or safe defaults
      if (!brandingCache.has(cacheKey)) {
        setBranding({
          studioName: DEFAULT_BRANDING.studioName,
          logoUrl: null,
          tagline: DEFAULT_BRANDING.tagline,
          isCustomized: false,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sync = useCallback(() => {
    const host = resolveClientTenantHost();
    setCurrentTenantHost(host);
    void fetchBranding(host);
  }, [fetchBranding]);

  const reloadBranding = useCallback(async () => {
    const host = resolveClientTenantHost();
    const cacheKey = host || 'default';
    brandingCache.delete(cacheKey);
    await fetchBranding(host, true);
  }, [fetchBranding]);

  useEffect(() => {
    sync();

    // Listen for branding publication updates from LandingCustomizationEditor
    const handleBrandingUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<LandingPageConfig>;
      const config = customEvent.detail;
      const host = resolveClientTenantHost();
      const cacheKey = host || 'default';

      if (config) {
        const studioName = config.header?.studioName || config.footer?.studioName || DEFAULT_BRANDING.studioName;
        const logoUrl = config.header?.logoUrl || config.footer?.logoUrl || null;
        const tagline = config.hero?.heading || config.hero?.badge || DEFAULT_BRANDING.tagline;
        const resolved = { studioName, logoUrl, tagline, isCustomized: true };
        if (typeof window !== 'undefined') {
          try { window.localStorage.setItem('fitness-studio-branding-name', studioName); } catch {}
        }
        brandingCache.set(cacheKey, resolved);
        setBranding(resolved);
      } else {
        void reloadBranding();
      }
    };

    // Listen for tenant switch or login/logout events
    const handleSessionChange = () => {
      const host = resolveClientTenantHost();
      if (host !== currentTenantHost) {
        // Tenant switched: immediately clear previous branding
        setCurrentTenantHost(host);
        void fetchBranding(host, true);
      }
    };

    window.addEventListener(FITNESS_BRANDING_UPDATED_EVENT, handleBrandingUpdated);
    window.addEventListener(STUDIO_SESSION_EVENT, handleSessionChange);
    window.addEventListener('storage', handleSessionChange);

    return () => {
      window.removeEventListener(FITNESS_BRANDING_UPDATED_EVENT, handleBrandingUpdated);
      window.removeEventListener(STUDIO_SESSION_EVENT, handleSessionChange);
      window.removeEventListener('storage', handleSessionChange);
    };
  }, [sync, currentTenantHost, fetchBranding, reloadBranding]);

  const contextValue = useMemo<TenantBranding>(
    () => ({
      ...branding,
      theme: DEFAULT_THEME,
      isLoading,
      reloadBranding,
    }),
    [branding, isLoading, reloadBranding]
  );

  return (
    <TenantBrandingContext.Provider value={contextValue}>
      {children}
    </TenantBrandingContext.Provider>
  );
}

export function useTenantBranding(): TenantBranding {
  return useContext(TenantBrandingContext);
}
