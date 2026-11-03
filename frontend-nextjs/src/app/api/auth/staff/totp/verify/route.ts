import { NextRequest } from 'next/server';
import { proxyStaffAuthRequest } from '@/lib/auth/staff-api-proxy';

export function POST(request: NextRequest) {
  return proxyStaffAuthRequest(request, '/api/v1/auth/staff/totp/verify', {
    requireAuthorization: true,
  });
}
