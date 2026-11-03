'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuthContext } from '@/lib/auth/AuthContext';
import { MemberNavbar } from '@/components/layout/MemberNavbar';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { ToastProvider } from '@/components/ui/Toast';

function MemberRouteGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, isInitialized } = useAuthContext();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && !isAuthenticated && !user) {
      if (typeof window !== 'undefined') {
        const tenant = new URLSearchParams(window.location.search).get('tenant') || localStorage.getItem('fitness-studio-tenant-code');
        const target = tenant ? `/member-explore?tenant=${encodeURIComponent(tenant)}` : '/member-explore';
        router.replace(target);
      } else {
        router.replace('/member-explore');
      }
    }
  }, [isInitialized, isAuthenticated, user, router]);

  if (!isInitialized || (!isAuthenticated && !user)) {
    return (
      <div className="min-h-screen bg-[#FCFAF8] flex flex-col items-center justify-center font-sans text-slate-500 gap-3">
        <div className="w-8 h-8 border-3 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-semibold tracking-wide uppercase text-slate-400">
          {!isInitialized ? 'Loading Sanctuary...' : 'Redirecting to Member Explore...'}
        </span>
      </div>
    );
  }

  return <>{children}</>;
}

export default function MemberSanctuaryLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <MemberRouteGuard>
          <div className="min-h-screen bg-[#FCFAF8] flex flex-col font-sans text-slate-800">
            {/* Danza Full-Width White Header with Account Dropdown */}
            <MemberNavbar />

            {/* Main Website Page Content */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
              {children}
            </main>

            {/* Danza Shared Website Footer */}
            <PublicFooter />
          </div>
        </MemberRouteGuard>
      </ToastProvider>
    </AuthProvider>
  );
}
