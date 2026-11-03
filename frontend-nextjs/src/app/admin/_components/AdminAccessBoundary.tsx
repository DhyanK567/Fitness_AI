'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { WorkspaceAccessNotice } from '@/components/auth/WorkspaceAccessNotice';
import { isWorkspacePathAllowed, normalizeStudioRole, studioRoleHome, unwrapApiPayload, type StudioRole } from '@/lib/auth/studio-auth';
import { AdminShell } from './AdminShell';
import type { AdminTheme } from './AdminThemeProvider';
import { tierAllows, useStudioEntitlements } from '@/lib/auth/studio-entitlements';

export function AdminAccessBoundary({ children, initialTheme }: { children: React.ReactNode; initialTheme: AdminTheme }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = useState<StudioRole | null>(null);
  const [ready, setReady] = useState(false);
  const { tier, loading: tierLoading } = useStudioEntitlements();
  const requiredTier = pathname === '/admin/payments' ? 'enterprise' : ['/admin/leads', '/admin/feedback', '/admin/reports'].some((path) => pathname === path || pathname.startsWith(`${path}/`)) ? 'growth' : 'starter';

  useEffect(() => {
    let active = true;
    fetch('/api/auth/staff/me', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unauthenticated');
        return response.json();
      })
      .then((payload) => {
        if (!active) return;
        const data = unwrapApiPayload(payload);
        const roles = Array.isArray(data.roles) ? data.roles : [];
        const authenticatedRole = roles.map((value) => normalizeStudioRole(typeof value === 'string' ? value : null)).find(Boolean) ?? null;
        setRole(authenticatedRole);
        setReady(true);
        if (!authenticatedRole) router.replace(`/staff-login?next=${encodeURIComponent(pathname)}`);
        else if (!isWorkspacePathAllowed(authenticatedRole, pathname)) router.replace(`${studioRoleHome(authenticatedRole)}?access=${encodeURIComponent('Admin authorization required')}`);
      })
      .catch(() => {
        if (!active) return;
        setReady(true);
        router.replace(`/staff-login?next=${encodeURIComponent(pathname)}`);
      });
    return () => { active = false; };
  }, [pathname, router]);

  useEffect(() => {
    if (ready && role && !tierLoading && !tierAllows(tier, requiredTier)) {
      router.replace(`/admin/dashboard?access=${encodeURIComponent(`${requiredTier === 'enterprise' ? 'Ultra Premium' : 'Premium'} plan required`)}`);
    }
  }, [ready, requiredTier, role, router, tier, tierLoading]);

  if (!ready || !role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FCFAF8] text-sm text-slate-500">
        Loading admin workspace…
      </div>
    );
  }
  if (!tierLoading && !tierAllows(tier, requiredTier)) {
    return null;
  }
  if (!isWorkspacePathAllowed(role, pathname)) return null;
  return (
    <AdminShell initialTheme={initialTheme}>
      <WorkspaceAccessNotice />
      {children}
    </AdminShell>
  );
}
