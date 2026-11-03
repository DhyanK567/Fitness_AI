import { NextRequest, NextResponse } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';

export async function proxyStaffAuthRequest(
  request: NextRequest,
  backendPath: string,
  options: { requireAuthorization?: boolean } = {},
) {
  const tenantHost = resolveServerTenantHost(request);
  if (!tenantHost) {
    return NextResponse.json(
      { error: { code: 'TENANT_REQUIRED', message: 'Tenant domain could not be resolved.' } },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const authorization = request.headers.get('authorization');
  if (options.requireAuthorization && !authorization?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: { code: 'AUTH_REQUIRED', message: 'A valid enrollment token is required.' } },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Host: tenantHost,
  };
  if (authorization) headers.Authorization = authorization;

  const devTenantCode = request.headers.get('x-tenant-code-dev');
  if (
    devTenantCode &&
    (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_TENANT_HEADER === 'true')
  ) {
    headers['x-tenant-code-dev'] = devTenantCode;
  }

  const bodyText = await request.text();
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${backendPath}`,
    {
      method: 'POST',
      headers,
      body: bodyText || undefined,
      cache: 'no-store',
    },
  );

  const data = await response.json().catch(() => ({
    error: { message: response.ok ? 'Invalid response from authentication service.' : 'Authentication request failed.' },
  }));
  return NextResponse.json(data, {
    status: response.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function proxyTeamInvitationRequest(
  request: NextRequest,
  backendPath: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; public?: boolean } = {},
) {
  const method = options.method ?? request.method as 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  const tenantHost = resolveServerTenantHost(request);
  if (!options.public && !tenantHost) {
    return NextResponse.json({ error: { message: 'Tenant domain could not be resolved.' } }, { status: 400 });
  }
  const accessToken =
    request.cookies.get('ws_staff_token')?.value ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!options.public && !accessToken) {
    return NextResponse.json({ error: { message: 'Authentication is required.' } }, { status: 401 });
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const devTenantCode =
    request.headers.get('x-tenant-code-dev') ||
    request.cookies.get('fitness-studio-tenant-code')?.value;
  if (
    devTenantCode &&
    (process.env.NODE_ENV === 'development' || process.env.ALLOW_DEV_TENANT_HEADER === 'true')
  ) {
    headers['x-tenant-code-dev'] = devTenantCode;
    const baseDomain = process.env.TENANT_BASE_DOMAIN || 'fitness.local';
    headers.Host = `${devTenantCode.trim()}.${baseDomain}`;
  } else if (tenantHost) {
    headers.Host = tenantHost;
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${backendPath}`, {
      method,
      headers,
      body: body || undefined,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({ error: { message: 'Authentication service returned an invalid response.' } }));
    return NextResponse.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: { message: 'Authentication service is unavailable.' } }, { status: 503 });
  }
}
