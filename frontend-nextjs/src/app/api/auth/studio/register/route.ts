import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    // Studio registration is platform-level (no tenant context yet)
    // In dev, we can optionally forward a tenant code header for testing
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Forward dev tenant override if provided by frontend
    const devTenantCode = request.headers.get('x-tenant-code-dev');
    if (devTenantCode && process.env.NODE_ENV !== 'production') {
      headers['x-tenant-code-dev'] = devTenantCode;
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/auth/register/studio`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!response.ok) {
      let errData: unknown;
      try {
        errData = await response.json();
      } catch {
        errData = null;
      }
      return NextResponse.json(
        errData && typeof errData === 'object'
          ? errData
          : { error: { message: 'Registration failed' } },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json(
      { error: { code: 'REGISTRATION_UNAVAILABLE', message: 'Registration service is unavailable.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
