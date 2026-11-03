import { NextRequest } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';

export function POST(request: NextRequest) {
  return proxyTeamInvitationRequest(request, '/api/v1/auth/staff/invitations/enroll', { method: 'POST', public: true });
}
