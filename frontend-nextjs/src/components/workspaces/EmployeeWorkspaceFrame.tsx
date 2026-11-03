'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useTenantBranding } from '@/features/settings';

type NavItem = { href: string; label: string; description: string };

export function EmployeeWorkspaceFrame({
  accent,
  eyebrow,
  employeeName,
  studioName,
  tierName,
  nav,
  children,
}: {
  accent: 'cyan' | 'emerald' | 'violet';
  eyebrow: string;
  employeeName: string;
  studioName: string;
  tierName: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { studioName: customStudioName, logoUrl } = useTenantBranding();
  const effectiveStudioName = customStudioName || studioName;

  const tones = {
    cyan: { badge: 'bg-cyan-50 text-cyan-800 ring-cyan-200', active: 'bg-cyan-600 text-white shadow-cyan-200', dot: 'bg-cyan-500' },
    emerald: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', active: 'bg-emerald-600 text-white shadow-emerald-200', dot: 'bg-emerald-500' },
    violet: { badge: 'bg-violet-50 text-violet-800 ring-violet-200', active: 'bg-violet-600 text-white shadow-violet-200', dot: 'bg-violet-500' },
  }[accent];

  async function signOut() {
    await fetch('/api/auth/staff/logout', { method: 'POST' }).catch(() => undefined);
    localStorage.removeItem('ws_staff_token');
    localStorage.removeItem('ws_staff_user');
    localStorage.removeItem('fitness-studio-demo-session');
    router.replace('/staff-login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span className={`h-2 w-2 rounded-full ${tones.dot}`} />{eyebrow}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {logoUrl && (
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 p-0.5">
                  <Image src={logoUrl} alt={effectiveStudioName} fill unoptimized className="object-contain" />
                </span>
              )}
              <p className="truncate text-base font-bold text-slate-950">{effectiveStudioName}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${tones.badge}`}>{tierName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-sm font-semibold">{employeeName}</p><p className="text-xs text-slate-500">Signed-in employee</p></div>
            <button onClick={signOut} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Sign out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-3 shadow-sm lg:sticky lg:top-24">
          <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-1">
            {nav.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return <Link key={item.href} href={item.href} className={`rounded-2xl px-4 py-3 transition ${active ? `${tones.active} shadow-lg` : 'text-slate-700 hover:bg-slate-100'}`}><span className="block text-sm font-bold">{item.label}</span><span className={`mt-0.5 hidden text-xs lg:block ${active ? 'text-white/80' : 'text-slate-500'}`}>{item.description}</span></Link>;
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function WorkspaceLoading({ label }: { label: string }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div className="rounded-3xl border border-slate-200 bg-white px-8 py-7 text-center shadow-sm"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" /><p className="mt-4 text-sm font-semibold text-slate-600">Loading {label}…</p></div></div>;
}

export function WorkspaceError({ message, retry }: { message: string; retry: () => void }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="max-w-md rounded-3xl border border-rose-200 bg-white p-7 text-center shadow-sm"><p className="text-lg font-bold">Workspace unavailable</p><p className="mt-2 text-sm text-slate-600">{message}</p><button onClick={retry} className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Try again</button></div></div>;
}

export function EmptyWorkspaceState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><p className="font-bold text-slate-900">{title}</p><p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">{detail}</p></div>;
}
