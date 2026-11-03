import { NextRequest, NextResponse } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';
import { extractSession, resolveStudioRole, toBrowserSessionPayload } from '@/lib/auth/studio-auth';

export async function POST(request: NextRequest) {
  try {
    const tenantHost = resolveServerTenantHost(request);
    if (!tenantHost) {
      return NextResponse.json(
        { error: { code: 'TENANT_REQUIRED', message: 'Tenant domain could not be resolved.' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Host: tenantHost,
    };
    const devTenantCode = request.headers.get('x-tenant-code-dev');
    if (
      devTenantCode &&
      (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_TENANT_HEADER === 'true')
    ) {
      headers['x-tenant-code-dev'] = devTenantCode;
    }

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/staff/login`,
      {
        method: 'POST',
        headers,
        body: await request.text(),
        cache: 'no-store',
      },
    );
    const data = await response.json().catch(() => ({
      error: { message: response.ok ? 'Invalid response from authentication service.' : 'Login failed.' },
    }));

    if (!response.ok) {
      return NextResponse.json(data, {
        status: response.status,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const backendData = data?.data?.data ?? data?.data ?? data;
    if (!backendData || typeof backendData !== 'object') {
      return NextResponse.json(
        { error: { code: 'INVALID_AUTH_RESPONSE', message: 'Authentication service returned an invalid response.' } },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const refreshToken = typeof backendData.refresh_token === 'string'
      ? backendData.refresh_token
      : undefined;
    const browserSafeData = toBrowserSessionPayload(backendData);
    const browserSession = extractSession(browserSafeData);
    const resolvedRole = browserSession ? resolveStudioRole(browserSession) : null;
    const result = NextResponse.json(browserSafeData, {
      status: response.status,
      headers: { 'Cache-Control': 'no-store' },
    });

    if (backendData.access_token) {
      result.cookies.set('ws_staff_token', backendData.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: backendData.expires_in ?? 3600,
      });
    }
    if (refreshToken) {
      result.cookies.set('ws_staff_refresh', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 604800,
      });
    }
    if (resolvedRole) {
      result.cookies.set('ws_staff_role', resolvedRole, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 604800,
      });
    }
    const effectiveTenantCode = (typeof backendData.tenant_code === 'string' && backendData.tenant_code ? backendData.tenant_code : undefined) || devTenantCode;
    if (effectiveTenantCode) {
      result.cookies.set('fitness-studio-tenant-code', effectiveTenantCode, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 604800,
      });
    }

    return result;
  } catch {
    return NextResponse.json(
      { error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication service is unavailable.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
