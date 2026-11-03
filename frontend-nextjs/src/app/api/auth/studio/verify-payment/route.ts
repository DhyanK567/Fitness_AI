import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

    const orderId =
      body.razorpay_order_id || body.order_id || body.orderId || '';
    const paymentId =
      body.razorpay_payment_id || body.payment_id || body.paymentId || '';
    const signature =
      body.razorpay_signature || body.signature || '';
    const planTier = body.plan_tier || body.planTier || 'Premium';

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Order ID, payment ID, and signature are required for payment verification',
          },
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const payloadToSend = {
      plan_tier: planTier,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      order_id: orderId,
      payment_id: paymentId,
      signature: signature,
    };

    const response = await fetch(`${apiBaseUrl}/api/v1/payments/studio-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadToSend),
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
          : { error: { message: 'Payment verification failed' } },
        { status: response.status, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const raw = await response.json();
    const payload = raw?.data || raw;
    return NextResponse.json(
      {
        success: true,
        data: payload,
        verified: payload.verified ?? true,
        payment_id: payload.payment_id || paymentId,
        order_id: payload.order_id || orderId,
        plan_tier: payload.plan_tier || planTier,
        amount: payload.amount,
        amount_inr: payload.amount_inr,
        verified_at: payload.verified_at,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: { code: 'VERIFICATION_SERVICE_UNAVAILABLE', message: 'Payment verification service is unavailable.' } },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
