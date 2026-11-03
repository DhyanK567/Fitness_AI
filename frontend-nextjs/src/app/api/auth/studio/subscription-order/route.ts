import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const idempotencyKey = request.headers.get('idempotency-key');
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/payments/studio-order`, {
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
          : { error: { message: 'Order creation failed' } },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const raw = await response.json();
    const payload = raw?.data || raw;
    return NextResponse.json(
      {
        success: true,
        data: payload,
        order_id: payload.order_id,
        amount: payload.amount,
        amount_inr: payload.amount_inr,
        currency: payload.currency || 'INR',
        key_id: payload.key_id,
        plan_tier: payload.plan_tier,
        plan_name: payload.plan_name,
        receipt: payload.receipt,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'ORDER_SERVICE_UNAVAILABLE', message: 'Payment order service is unavailable.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
