'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { ArrowRightIcon, ShieldCheckIcon, SparklesIcon } from '@/components/ui/icons';
import { studioRoleLabel } from '@/lib/auth/studio-session';
import { AdminThemeProvider, type AdminTheme } from './AdminThemeProvider';
import {
  AdminWorkspaceDataProvider,
  currentStaffStudio,
} from './AdminDataProvider';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopBar } from './AdminTopBar';

export function AdminShell({ children, initialTheme }: { children: React.ReactNode; initialTheme: AdminTheme }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <AdminThemeProvider initialTheme={initialTheme}>
      <AdminWorkspaceDataProvider>
        <div className="min-h-screen bg-[var(--staff-page)] text-[var(--staff-text)] lg:flex">
          <AdminSidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
          <div className="flex min-h-screen min-w-0 flex-1 flex-col">
            <AdminTopBar
              onMenuClick={() => setMobileMenuOpen(true)}
              menuExpanded={mobileMenuOpen}
            />
            <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-20 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
              <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-200/80 bg-sky-50 px-4 py-3.5 text-xs leading-5 text-slate-600 shadow-subtle">
                <ShieldCheckIcon size="sm" className="mt-0.5 shrink-0 text-slate-500" />
                <p>
                  Figures reflect the records currently available in this workspace.
                </p>
              </div>
              <div>{children}</div>
            </main>
          </div>
        </div>
      </AdminWorkspaceDataProvider>
    </AdminThemeProvider>
  );
}