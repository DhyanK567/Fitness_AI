import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const response = await fetch(`${apiBaseUrl}/api/v1/payments/studio-plan-config`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: { message: 'Failed to fetch plan configuration' } },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const raw = await response.json();
    const data = raw?.data || raw;
    return NextResponse.json(
      {
        success: true,
        data,
        plans: data.plans,
        razorpay: data.razorpay,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'CONFIG_UNAVAILABLE', message: 'Plan configuration service is unavailable.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
