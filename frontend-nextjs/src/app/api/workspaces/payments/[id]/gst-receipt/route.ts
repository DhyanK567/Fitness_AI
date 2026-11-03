import { NextRequest } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyTeamInvitationRequest(request, `/api/v1/payments/${encodeURIComponent(id)}/gst-receipt`, { method: 'GET' });
}
