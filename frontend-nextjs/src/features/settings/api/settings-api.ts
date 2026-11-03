import { resolveClientTenantHost, resolveClientApiBaseUrl } from '@/lib/tenant';
import {
  LandingPageConfig,
  DEFAULT_LANDING_PAGE_CONFIG,
  LANDING_PAGE_SETTINGS_KEY,
  SETTINGS_MAX_PAYLOAD_BYTES,
  calculateConfigPayloadSize,
} from '../types/landing-customization.types';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

function getEndpoint(path: string): string {
  const baseUrl = resolveClientApiBaseUrl();
  const clean = path.startsWith('/') ? path : `/${path}`;
  return clean.startsWith('/api/v1') ? `${baseUrl}${clean}` : `${baseUrl}/api/v1${clean}`;
}

export interface SaveDraftResult {
  success: boolean;
  message: string;
  error?: string;
  payloadSize?: number;
  data?: LandingPageConfig;
}

export interface LoadDraftResult {
  success: boolean;
  data?: LandingPageConfig | null;
  message?: string;
  isCustomized: boolean;
}

/**
 * Checks if the user is authenticated as staff in the current browser workspace.
 */
export function getStaffAuthStatus(): { isAuthenticated: boolean; token: string | null; tenantHost: string | null } {
  if (typeof window === 'undefined') {
    return { isAuthenticated: false, token: null, tenantHost: null };
  }
  const token = localStorage.getItem('ws_staff_token');
  const tenantHost = resolveClientTenantHost();
  return {
    isAuthenticated: Boolean(token),
    token,
    tenantHost,
  };
}

/**
 * Load tenant-specific landing page draft configuration from backend PostgreSQL.
 * Endpoint: GET /api/v1/settings/:key
 */
export async function loadLandingPageDraft(): Promise<LoadDraftResult> {
  const { token, tenantHost, isAuthenticated } = getStaffAuthStatus();

  if (!isAuthenticated || !token) {
    return {
      success: false,
      isCustomized: false,
      message: 'Staff authentication session not found. Please log in to load studio settings.',
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (tenantHost) {
    headers['x-tenant-host'] = tenantHost;
  }

  try {
    const res = await fetch(getEndpoint(`/settings/${LANDING_PAGE_SETTINGS_KEY}`), {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      return {
        success: true,
        data: null,
        isCustomized: false,
        message: 'No custom landing page draft found for this studio. Using standard defaults.',
      };
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err?.message || err?.error || `HTTP ${res.status}`;
      return {
        success: false,
        isCustomized: false,
        message: `Failed to load studio landing page settings: ${errorMsg}`,
      };
    }

    const payload = await res.json();
    // Unwrap response envelope: { success: true, data: { key, value } }
    const settingData = payload?.data?.value ?? payload?.value ?? payload?.data;
    if (settingData && typeof settingData === 'object') {
      return {
        success: true,
        data: settingData as LandingPageConfig,
        isCustomized: true,
        message: 'Loaded studio landing page customization draft from database.',
      };
    }

    return {
      success: true,
      data: null,
      isCustomized: false,
      message: 'Studio setting returned empty content. Using defaults.',
    };
  } catch (err: any) {
    return {
      success: false,
      isCustomized: false,
      message: `Network error connecting to settings API: ${err?.message || 'Server unreachable'}`,
    };
  }
}

/**
 * Load public published landing page configuration for the resolved tenant host.
 * Endpoint: GET /api/v1/settings/:key
 */
export async function loadPublicLandingPageConfig(
  candidateTenantHost?: string | null
): Promise<LandingPageConfig | null> {
  const tenantHost = candidateTenantHost ?? (typeof window !== 'undefined' ? resolveClientTenantHost() : null);
  if (!tenantHost) {
    return null;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (tenantHost) {
    headers['x-tenant-host'] = tenantHost;
  }

  try {
    const res = await fetch(getEndpoint(`/settings/${LANDING_PAGE_SETTINGS_KEY}`), {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!res.ok) {
      return null;
    }

    const payload = await res.json();
    const settingData = payload?.data?.value ?? payload?.value ?? payload?.data;
    if (settingData && typeof settingData === 'object') {
      const loaded = settingData as LandingPageConfig;
      // Merge with default to guarantee all keys exist
      return {
        ...DEFAULT_LANDING_PAGE_CONFIG,
        ...loaded,
        header: { ...DEFAULT_LANDING_PAGE_CONFIG.header, ...(loaded.header || {}) },
        hero: { ...DEFAULT_LANDING_PAGE_CONFIG.hero, ...(loaded.hero || {}) },
        movementCategories: {
          ...DEFAULT_LANDING_PAGE_CONFIG.movementCategories,
          ...(loaded.movementCategories || {}),
          items: loaded.movementCategories?.items?.length
            ? loaded.movementCategories.items
            : DEFAULT_LANDING_PAGE_CONFIG.movementCategories.items,
        },
        l3StudioManagement: { ...DEFAULT_LANDING_PAGE_CONFIG.l3StudioManagement, ...(loaded.l3StudioManagement || {}) },
        l4MembershipExperience: { ...DEFAULT_LANDING_PAGE_CONFIG.l4MembershipExperience, ...(loaded.l4MembershipExperience || {}) },
        l5ConnectedJourneys: { ...DEFAULT_LANDING_PAGE_CONFIG.l5ConnectedJourneys, ...(loaded.l5ConnectedJourneys || {}) },
        l6AiAssistance: { ...DEFAULT_LANDING_PAGE_CONFIG.l6AiAssistance, ...(loaded.l6AiAssistance || {}) },
        l7Features: {
          ...DEFAULT_LANDING_PAGE_CONFIG.l7Features,
          ...(loaded.l7Features || {}),
          cards: loaded.l7Features?.cards?.length
            ? loaded.l7Features.cards
            : DEFAULT_LANDING_PAGE_CONFIG.l7Features.cards,
        },
        l8FinalCta: { ...DEFAULT_LANDING_PAGE_CONFIG.l8FinalCta, ...(loaded.l8FinalCta || {}) },
        footer: { ...DEFAULT_LANDING_PAGE_CONFIG.footer, ...(loaded.footer || {}) },
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist tenant-specific landing page configuration to backend PostgreSQL.
 * Endpoint: PUT /api/v1/settings/:key
 * Enforces the strict 16KB payload limit of ConfigurationService.
 */
export async function saveLandingPageDraft(
  config: LandingPageConfig,
  publish: boolean = true
): Promise<SaveDraftResult> {
  const { token, tenantHost, isAuthenticated } = getStaffAuthStatus();

  if (!isAuthenticated || !token) {
    return {
      success: false,
      message: 'Saving draft is disabled: No active staff authentication token found.',
      error: 'UNAUTHENTICATED',
    };
  }

  const payloadConfig: LandingPageConfig = {
    ...config,
    isPublished: publish,
  };

  const payloadSize = calculateConfigPayloadSize(payloadConfig);
  if (payloadSize > SETTINGS_MAX_PAYLOAD_BYTES) {
    return {
      success: false,
      payloadSize,
      message: `Payload exceeds the 16KB limit (${payloadSize} bytes / 16,384 bytes allowed). Please shorten text or reduce image URL lengths.`,
      error: 'PAYLOAD_TOO_LARGE',
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (tenantHost) {
    headers['x-tenant-host'] = tenantHost;
  }

  try {
    const res = await fetch(getEndpoint(`/settings/${LANDING_PAGE_SETTINGS_KEY}`), {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: payloadConfig }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const errorMsg = Array.isArray(err?.message)
        ? err.message.join(', ')
        : err?.message || err?.error?.message || err?.error || `HTTP ${res.status}`;
      return {
        success: false,
        payloadSize,
        message: `Failed to save configuration to database: ${errorMsg}`,
        error: errorMsg,
      };
    }

    const payload = await res.json();
    const savedConfig = payload?.data?.value ?? payload?.value ?? payloadConfig;

    return {
      success: true,
      payloadSize,
      data: savedConfig as LandingPageConfig,
      message: publish
        ? `Configuration successfully published live to studio database (${payloadSize} bytes).`
        : `Draft saved to studio database (${payloadSize} bytes).`,
    };
  } catch (err: any) {
    return {
      success: false,
      payloadSize,
      message: `Network error connecting to settings API: ${err?.message || 'Server unreachable'}`,
      error: err?.message || 'NETWORK_ERROR',
    };
  }
}
