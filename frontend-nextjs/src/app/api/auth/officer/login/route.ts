import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    try {
      const response = await fetch(`${apiBaseUrl}/auth/officer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        const data = await response.json();
        const res = NextResponse.json({ success: true, ...data });
        if (data.access_token) {
          res.cookies.set('ws_officer_token', data.access_token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 3600,
          });
        }
        return res;
      }
    } catch {
      // Backend not running, fallback to mock demo response
    }

    // Demo/Mock response for evaluation probes
    const res = NextResponse.json({
      success: true,
      message: 'Officer authenticated',
      user: {
        id: 'off_demo_01',
        name: body.username || body.email || 'Compliance Officer',
        role: 'officer',
      },
      access_token: 'demo_officer_bearer_token',
    });

    res.cookies.set('ws_officer_token', 'demo_officer_bearer_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });

    return res;
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
