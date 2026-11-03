'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTenantBranding } from '@/features/settings';

import { ChevronDownIcon, XIcon } from '@/components/ui/icons';
import {
  clearStudioSession,
  getStudioSession,
  studioRoleLabel,
  STUDIO_SESSION_EVENT,
  type StudioSession,
} from '@/lib/auth/studio-session';
import {
  adminAssistantNavigation,
  adminNavigation,
  adminPrimaryNavigation,
} from './adminNavigation';
import { tierAllows, useStudioEntitlements } from '@/lib/auth/studio-entitlements';

type AdminSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export function AdminSidebar({ mobileOpen, onClose }: AdminSidebarProps) {
  const { tier } = useStudioEntitlements();
  const pathname = usePathname();
  const [session, setSession] = useState<StudioSession | null>(null);
  const { studioName, logoUrl } = useTenantBranding();

  useEffect(() => {
    const sync = () => setSession(getStudioSession());
    sync();
    window.addEventListener(STUDIO_SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(STUDIO_SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const visibleNavigation = adminNavigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.href === '/admin/payments') return tierAllows(tier, 'enterprise');
      if (['/admin/leads', '/admin/feedback', '/admin/reports'].includes(item.href)) return tierAllows(tier, 'growth');
      return true;
    }),
  })).filter((group) => group.items.length > 0);
  const activeGroup = visibleNavigation.find((group) =>
    group.items.some(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
  )?.label;
  const [expandedGroups, setExpandedGroups] = useState<string[]>(activeGroup ? [activeGroup] : [adminNavigation[0].label]);

  useEffect(() => {
    if (activeGroup) {
      setExpandedGroups((groups) => (groups.includes(activeGroup) ? groups : [...groups, activeGroup]));
    }
  }, [activeGroup]);

  function handleLogout() {
    clearStudioSession();
    onClose();
    window.location.assign('/');
  }

  const roleBadge = studioRoleLabel(session?.role ?? 'admin');

  return (
    <div className={mobileOpen ? 'fixed inset-0 z-40 lg:static lg:block' : 'hidden lg:block'}>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
        />
      )}

      <aside className="relative z-10 flex h-full max-h-screen w-[272px] max-w-[calc(100vw-3rem)] flex-col border-r border-slate-200 bg-white text-slate-900 lg:sticky lg:top-0 lg:h-screen lg:max-w-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100">
        <div className="shrink-0 border-b border-slate-200 px-4 pb-4 pt-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <Link href="/admin/dashboard" className="group flex min-h-10 items-center gap-3" onClick={onClose}>
              {logoUrl ? (
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-rose-50 p-1 dark:bg-rose-950/40">
                  <Image
                    src={logoUrl}
                    alt={studioName}
                    fill
                    unoptimized
                    className="object-contain p-0.5"
                  />
                </span>
              ) : (
                <span className="flex h-9 w-9 items-center justify-center text-rose-400">
                  <svg className="h-8 w-8 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                  </svg>
                </span>
              )}
              <span className="flex flex-col leading-tight">
                <span className="font-display text-[15px] font-bold tracking-tight text-slate-900 group-hover:text-rose-700 dark:text-white dark:group-hover:text-rose-300">
                  {studioName || 'Fitness Studio OS'}
                </span>
                <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {roleBadge}
                </span>
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-400 dark:hover:bg-slate-800 lg:hidden"
            >
              <XIcon size="sm" />
            </button>
          </div>
        </div>

        <nav id="admin-navigation" aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 py-5">
          <Link
            href={adminPrimaryNavigation.href}
            aria-current={pathname === adminPrimaryNavigation.href ? 'page' : undefined}
            onClick={onClose}
            className={`mb-2 flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${pathname === adminPrimaryNavigation.href ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
          >
            <adminPrimaryNavigation.icon size="sm" className={pathname === adminPrimaryNavigation.href ? 'text-white' : 'text-slate-500'} />
            <span>{adminPrimaryNavigation.label}</span>
          </Link>

          {visibleNavigation.map((group) => {
            const GroupIcon = group.icon;
            const expanded = expandedGroups.includes(group.label);
            const groupActive = group.label === activeGroup;
            return (
              <div key={group.label} className="mb-1">
                <h2>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`admin-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    onClick={() =>
                      setExpandedGroups((groups) =>
                        groups.includes(group.label) ? groups.filter((label) => label !== group.label) : [...groups, group.label]
                      )
                    }
                    className={`flex min-h-11 w-full items-center justify-between rounded-xl px-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${expanded ? 'bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900'} ${groupActive ? 'text-rose-800 dark:text-rose-200' : ''}`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${groupActive ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300' : expanded ? 'bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300' : 'bg-transparent text-slate-400'}`}>
                        <GroupIcon size="xs" />
                      </span>
                      <span className="truncate">{group.label}</span>
                    </span>
                    <ChevronDownIcon size="xs" className={`shrink-0 transition-transform ${expanded ? 'rotate-180 text-rose-600' : 'text-slate-400'}`} />
                  </button>
                </h2>
                {expanded && (
                  <ul id={`admin-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} className="ml-3 space-y-1 border-l border-slate-200 pb-2 pl-2 pt-1 dark:border-slate-800">
                    {group.items.map(({ href, icon: Icon, label }) => {
                      const active = pathname === href || pathname.startsWith(`${href}/`);

                      return (
                        <li key={href}>
                          <Link
                            href={href}
                            aria-current={active ? 'page' : undefined}
                            onClick={onClose}
                            className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${
                              active
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                            }`}
                          >
                            <Icon size="sm" className={active ? 'text-white' : 'text-slate-500'} />
                            <span>{label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-slate-200 p-4 dark:border-slate-800">
          <Link
            href={adminAssistantNavigation.href}
            onClick={onClose}
            aria-current={pathname === adminAssistantNavigation.href ? 'page' : undefined}
            className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${pathname === adminAssistantNavigation.href ? 'bg-rose-600 text-white' : 'text-slate-700 hover:bg-rose-50 hover:text-rose-800 dark:text-slate-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-200'}`}
          >
            <adminAssistantNavigation.icon size="sm" className={pathname === adminAssistantNavigation.href ? 'text-white' : 'text-rose-600'} />
            <span>{adminAssistantNavigation.label}</span>
          </Link>
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <span className="truncate text-[11px] text-slate-500">{session?.name ?? 'Studio Admin'}</span>
            <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {roleBadge}
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 dark:border-rose-900/70 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/70"
          >
            <span aria-hidden="true">↪</span>
            Logout
          </button>
        </div>
      </aside>
    </div>
  );
}
