import { NextRequest, NextResponse } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';
import { normalizeStudioRole, studioRoleHome, toBrowserSessionPayload, unwrapApiPayload } from '@/lib/auth/studio-auth';

export async function POST(request: NextRequest) {
  try {
    const tenantHost = resolveServerTenantHost(request);
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/staff/invitations/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(tenantHost ? { Host: tenantHost } : {}) },
      body: await request.text(),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({ error: { message: 'Authentication service returned an invalid response.' } }));
    if (!response.ok) return NextResponse.json(payload, { status: response.status });
    const data = unwrapApiPayload(payload);
    const role = normalizeStudioRole(typeof data.role === 'string' ? data.role : Array.isArray(data.roles) ? String(data.roles[0]) : '');
    if (!role || typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') {
      return NextResponse.json({ error: { message: 'Authentication service returned an invalid session.' } }, { status: 502 });
    }
    const result = NextResponse.json({
      ...toBrowserSessionPayload(data),
      access_token: undefined,
      redirectTo: studioRoleHome(role),
    }, { headers: { 'Cache-Control': 'no-store' } });
    result.cookies.set('ws_staff_token', data.access_token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: Number(data.expires_in) || 3600 });
    result.cookies.set('ws_staff_refresh', data.refresh_token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 30 * 24 * 60 * 60 });
    if (typeof data.tenant_code === 'string' && data.tenant_code) {
      result.cookies.set('fitness-studio-tenant-code', data.tenant_code, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 });
    }
    return result;
  } catch {
    return NextResponse.json({ error: { message: 'Authentication service is unavailable.' } }, { status: 503 });
  }
}
