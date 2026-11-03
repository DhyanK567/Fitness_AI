import { NextResponse, NextRequest } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    
    const tenantHost = resolveServerTenantHost(request);
    if (!tenantHost) {
      return NextResponse.json(
        { error: 'Tenant domain could not be resolved. Tenant host is required in production.' },
        { status: 400 },
      );
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/auth/member/login-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': tenantHost,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errData: any;
      try {
        errData = await response.json();
      } catch {
        errData = null;
      }
      return NextResponse.json(
        { error: errData?.message || errData?.error || 'Failed to send OTP' },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
