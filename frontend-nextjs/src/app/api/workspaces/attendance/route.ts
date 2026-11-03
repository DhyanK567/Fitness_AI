import { NextRequest } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';
export function POST(request: NextRequest) { return proxyTeamInvitationRequest(request, '/api/v1/attendance/check-in', { method: 'POST' }); }
