import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  isWorkspacePathAllowed,
  normalizeStudioRole,
  studioRoleHome,
  workspaceAccessNotice,
} from '@/lib/auth/studio-auth';
import { verifyStaffSessionJwt } from '@/lib/auth/edge-session';
import { resolveServerTenantHost } from '@/lib/tenant';

function loginRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/staff-login';
  url.search = '';
  url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Canonical workspace redirects for retired/duplicate paths
  if (pathname === '/front-desk' || pathname.startsWith('/front-desk/') || pathname === '/billing' || pathname.startsWith('/billing/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/staff/dashboard';
    return NextResponse.redirect(url);
  }
  if (pathname === '/lead-trainer' || pathname.startsWith('/lead-trainer/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/trainer/dashboard';
    return NextResponse.redirect(url);
  }

  const token = request.cookies.get('ws_staff_token')?.value;
  if (!token) return loginRedirect(request);

  const jwtSecret = process.env.AUTH_JWT_SECRET ?? process.env.JWT_SECRET;
  const localSession = jwtSecret ? await verifyStaffSessionJwt(token, jwtSecret) : null;
  let role = localSession?.role ?? null;
  if (!role) {
    const tenantHost = resolveServerTenantHost(request);
    if (!tenantHost) return loginRedirect(request);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/auth/staff/me`, {
        headers: { Authorization: `Bearer ${token}`, Host: tenantHost },
        cache: 'no-store',
      });
      if (!response.ok) return loginRedirect(request);
      const payload = await response.json() as { data?: { data?: { role?: string; roles?: string[] }; role?: string; roles?: string[] } };
      const data = payload.data?.data ?? payload.data;
      role = normalizeStudioRole(data?.role ?? data?.roles?.[0]);
    } catch { return loginRedirect(request); }
  }
  if (!role) return loginRedirect(request);
  if (isWorkspacePathAllowed(role, pathname)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = studioRoleHome(role);
  url.search = '';
  url.searchParams.set('access', workspaceAccessNotice(pathname));
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/staff/:path*', '/trainer/:path*', '/front-desk/:path*', '/lead-trainer/:path*', '/billing/:path*'],
};
