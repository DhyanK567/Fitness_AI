import { NextResponse, NextRequest } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get('ws_member_refresh')?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token' }, { status: 401 });
    }

    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    const tenantHost = resolveServerTenantHost(request);
    if (!tenantHost) {
      return NextResponse.json(
        { error: 'Tenant domain could not be resolved. Tenant host is required in production.' },
        { status: 400 },
      );
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': tenantHost,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const res = NextResponse.json({ error: 'Refresh failed' }, { status: 401 });
      res.cookies.delete('ws_member_token');
      res.cookies.delete('ws_member_refresh');
      return res;
    }

    const data = await response.json();
    
    const res = NextResponse.json({
      success: true,
      access_token: data.access_token,
    });
    res.cookies.set('ws_member_token', data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600
    });
    
    if (data.refresh_token) {
      res.cookies.set('ws_member_refresh', data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 604800
      });
    }

    return res;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
