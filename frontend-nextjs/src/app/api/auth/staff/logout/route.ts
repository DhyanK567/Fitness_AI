import { NextResponse, NextRequest } from 'next/server';
import { resolveServerTenantHost } from '@/lib/tenant';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('ws_staff_token')?.value;
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const tenantHost = resolveServerTenantHost(request);
  if (token && tenantHost) {
    await fetch(`${apiBaseUrl}/api/v1/auth/staff/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Host': tenantHost,
      }
    }).catch(() => {});
  }

  const res = NextResponse.json({ success: true });
  res.cookies.delete('ws_staff_token');
  res.cookies.delete('ws_staff_refresh');
  res.cookies.delete('ws_staff_role');
  return res;
}
