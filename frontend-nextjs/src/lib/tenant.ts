import type { NextRequest } from 'next/server';

/**
 * Wellness Studio OS — Tenant Context Resolution
 * 
 * Rules for tenant host resolution:
 * 1. process.env.API_TENANT_HOST / NEXT_PUBLIC_TENANT_HOST takes precedence if configured.
 * 2. Incoming request host / x-forwarded-host is used if it represents a valid tenant domain (non-localhost).
 * 3. In production (NODE_ENV === 'production'):
 *    - Returns null if no valid tenant host can be resolved.
 *    - MUST NEVER silently fall back to 'demo.fitness.local'.
 * 4. In non-production (NODE_ENV !== 'production'):
 *    - Falls back to 'pilot-studio.fitness.local' for local development & automated test execution.
 */

export function resolveServerTenantHost(request?: NextRequest): string | null {
  if (process.env.API_TENANT_HOST && process.env.API_TENANT_HOST !== 'undefined') {
    return process.env.API_TENANT_HOST;
  }

  if (request) {
    const urlTenant = request.nextUrl?.searchParams?.get('tenant') || request.nextUrl?.searchParams?.get('studio');
    const devTenantCode =
      urlTenant ||
      request.headers.get('x-tenant-code-dev') ||
      request.cookies.get('fitness-studio-tenant-code')?.value;
    if (devTenantCode && devTenantCode.trim()) {
      const baseDomain = process.env.TENANT_BASE_DOMAIN || 'fitness.local';
      return `${devTenantCode.trim()}.${baseDomain}`;
    }

    const forwardedHost = request.headers.get('x-forwarded-host');
    const hostHeader = request.headers.get('host');
    const candidate = (forwardedHost || hostHeader || '').split(':')[0].trim().toLowerCase();

    if (candidate && !candidate.startsWith('localhost') && !candidate.startsWith('127.0.0.1')) {
      return candidate;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return process.env.DEV_DEFAULT_TENANT
    ? `${process.env.DEV_DEFAULT_TENANT}.${process.env.TENANT_BASE_DOMAIN || 'fitness.local'}`
    : 'ranayaa.fitness.local';
}

export function resolveClientTenantHost(): string | null {
  const storage = typeof window !== 'undefined'
    ? (window.localStorage || (typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null))
    : (typeof globalThis !== 'undefined' ? (globalThis as any).localStorage : null);

  let devTenantCode: string | null = null;
  if (storage?.getItem) {
    try {
      devTenantCode = storage.getItem('fitness-studio-tenant-code');
    } catch {}
  }

  if (!devTenantCode && typeof document !== 'undefined') {
    const match = document.cookie ? document.cookie.match(/(?:^|;\s*)fitness-studio-tenant-code=([^;]+)/) : null;
    if (match) devTenantCode = decodeURIComponent(match[1]);
  }

  if (!devTenantCode && typeof window !== 'undefined' && typeof window.location?.search === 'string') {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlTenant = params.get('tenant') || params.get('studio');
      if (urlTenant && urlTenant.trim()) {
        devTenantCode = urlTenant.trim();
      }
    } catch {}
  }

  if (!devTenantCode && typeof window !== 'undefined') {
    const pathname = typeof window.location?.pathname === 'string' ? window.location.pathname : '';
    const isB2cRoute = /^\/(member-explore|membership-plan|event-reservation|checkout)(\/|$)/.test(pathname);
    if (isB2cRoute && process.env.NODE_ENV !== 'production') {
      devTenantCode = 'ranayaa';
    }
  }

  if (devTenantCode && devTenantCode.trim()) {
    const baseDomain = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || 'fitness.local';
    return `${devTenantCode.trim()}.${baseDomain}`;
  }

  if (typeof window !== 'undefined') {
    const host = window.location?.host;
    const candidate = host ? host.split(':')[0].trim().toLowerCase() : '';
    if (candidate && !candidate.startsWith('localhost') && !candidate.startsWith('127.0.0.1')) {
      return candidate;
    }

    return null;
  }

  if (process.env.NEXT_PUBLIC_TENANT_HOST && process.env.NEXT_PUBLIC_TENANT_HOST !== 'undefined') {
    return process.env.NEXT_PUBLIC_TENANT_HOST;
  }

  if (process.env.API_TENANT_HOST && process.env.API_TENANT_HOST !== 'undefined') {
    return process.env.API_TENANT_HOST;
  }

  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return process.env.DEV_DEFAULT_TENANT
    ? `${process.env.DEV_DEFAULT_TENANT}.${process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN || 'fitness.local'}`
    : 'ranayaa.fitness.local';
}

export function resolveClientApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:3001';
  }
  return 'http://localhost:3001';
}
