import { NextRequest } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';

export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? '';
  return proxyTeamInvitationRequest(request, `/api/v1/auth/staff/invitations/validate?token=${encodeURIComponent(token)}`, { method: 'GET', public: true });
}
