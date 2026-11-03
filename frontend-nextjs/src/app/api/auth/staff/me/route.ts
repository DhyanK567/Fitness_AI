import { NextRequest } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';

export function GET(request: NextRequest) {
  return proxyTeamInvitationRequest(request, '/api/v1/auth/staff/me', { method: 'GET' });
}
