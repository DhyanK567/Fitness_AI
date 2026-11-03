import { NextRequest, NextResponse } from 'next/server';
import { proxyTeamInvitationRequest } from '@/lib/auth/staff-api-proxy';

const WORKSPACES: Record<string, string> = {
  'front-desk': 'front-desk',
  billing: 'billing',
  'lead-trainer': 'lead-trainer',
};

export async function GET(request: NextRequest, context: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await context.params;
  const backendWorkspace = WORKSPACES[workspace];
  if (!backendWorkspace) return NextResponse.json({ error: { message: 'Workspace not found.' } }, { status: 404 });
  return proxyTeamInvitationRequest(request, `/api/v1/workspaces/${backendWorkspace}`, { method: 'GET' });
}
