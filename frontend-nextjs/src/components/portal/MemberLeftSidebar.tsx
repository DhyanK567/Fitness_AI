'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTenantBranding } from '@/features/settings';
import { useAuthContext } from '@/lib/auth/AuthContext';
import {
  CalendarIcon,
  CreditCardIcon,
  QrCodeIcon,
  HomeIcon,
  SparklesIcon,
  SettingsIcon,
  LogOutIcon,
} from '@/components/ui/icons';

export type PortalTab =
  | 'home'
  | 'schedule'
  | 'payments'
  | 'profile'
  | 'settings';

interface MemberLeftSidebarProps {
  activeTab: PortalTab;
  onTabChange: (tab: PortalTab) => void;
  onOpenPassModal: () => void;
  timetableBadge?: number | string;
}

export const MemberLeftSidebar: React.FC<MemberLeftSidebarProps> = ({
  activeTab,
  onTabChange,
  onOpenPassModal,
  timetableBadge,
}) => {
  const { user, activeMembership, logout } = useAuthContext();
  const branding = useTenantBranding();

  const NAV_ITEMS: {
    id: PortalTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[] = [
    {
      id: 'home',
      label: 'Dashboard',
      icon: HomeIcon,
    },
    {
      id: 'schedule',
      label: 'Classes & Bookings',
      icon: CalendarIcon,
      badge: timetableBadge ? String(timetableBadge) : undefined,
    },
    {
      id: 'payments',
      label: 'Payments',
      icon: CreditCardIcon,
    },
    {
      id: 'profile',
      label: 'My Plan & Services',
      icon: SparklesIcon,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
    },
  ];

  const getInitials = (name?: string) => {
    if (!name) return 'M';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 1)
      .toUpperCase();
  };

  const isMemberActive = (activeMembership?.status || 'Active').toLowerCase() === 'active';
  const studioDisplayName = branding.studioName || user?.studioName || 'Fitness Studio';

  return (
    <aside className="w-80 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 flex flex-col justify-between min-h-screen p-4 sm:p-5 flex-shrink-0 font-sans select-none overflow-x-hidden transition-colors duration-200">
      <div className="space-y-4">
        {/* BRAND LOGO AT TOP */}
        <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <Link href="/" className="flex items-center gap-2.5 group">
            {branding.logoUrl ? (
              <div className="relative w-9 h-9 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                <Image
                  src={branding.logoUrl}
                  alt={studioDisplayName}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-9 h-9 flex items-center justify-center text-[#E11D48] transition-transform duration-300 group-hover:scale-110">
                <svg
                  className="w-8 h-8 fill-current"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                </svg>
              </div>
            )}
            <div className="flex flex-col leading-[0.95] min-w-0">
              <span className="font-serif text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-[#E11D48] transition-colors duration-200 leading-tight truncate">
                {studioDisplayName}
              </span>
            </div>
          </Link>
        </div>

        {/* Studio Identity Card with Live Status Dot */}
        <div className="bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 flex items-center justify-between text-xs shadow-2xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-rose-100 dark:border-rose-900/50 shadow-2xs">
              {(studioDisplayName)[0]}
            </div>
            <div className="overflow-hidden">
              <h1 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                {studioDisplayName}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5 mt-0.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span className="truncate">{user?.studioBranch || 'Main Studio'}</span>
              </p>
            </div>
          </div>
          <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-500" />
            <span>Active</span>
          </span>
        </div>

        {/* Dynamic Member Pass Card */}
        <div className="bg-gradient-to-br from-white via-white to-rose-50/40 dark:from-slate-850 dark:via-slate-850 dark:to-slate-900/90 rounded-2xl p-4 text-slate-800 dark:text-slate-100 space-y-3 shadow-xs border border-rose-100/90 dark:border-slate-800 relative overflow-hidden group hover:border-rose-200 dark:hover:border-slate-700 transition-all">
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
              MEMBER PASS
            </span>
            <span className={`text-[9px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs ${
              isMemberActive
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-800'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isMemberActive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span>{activeMembership?.status || 'Active'}</span>
            </span>
          </div>

          <div className="relative z-10">
            <h2 className="font-serif font-bold text-base text-slate-900 dark:text-white leading-tight">
              {user?.name || 'Studio Member'}
            </h2>
            <p className="text-[11px] text-rose-800 dark:text-rose-300 font-semibold mt-0.5 leading-tight truncate">
              {activeMembership?.planName || 'pre basic'} Plan
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenPassModal}
            className="w-full bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:from-[#BE123C] hover:to-[#9F1239] text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm shadow-rose-500/20 hover:shadow-md hover:shadow-rose-500/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-200 cursor-pointer relative z-10"
          >
            <QrCodeIcon className="w-4 h-4 text-white" />
            <span>Show Digital QR Pass</span>
          </button>
        </div>

        {/* Navigation Menu */}
        <div className="pt-1">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 px-2 mb-2 block">
            MEMBER PORTAL MENU
          </span>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs transition-all duration-200 text-left cursor-pointer group ${
                    isActive
                      ? 'bg-gradient-to-r from-[#E11D48] to-[#BE123C] text-white font-bold shadow-md shadow-rose-500/25'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-slate-800/80 hover:translate-x-1 font-semibold'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white group-hover:scale-110'}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto transition-colors ${
                        isActive
                          ? 'bg-rose-950/40 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Area: Desk WhatsApp & Logout */}
      <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 mt-4">
        {/* Desk WhatsApp */}
        <a
          href="https://wa.me/919876543210"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-slate-200/90 dark:border-slate-800 bg-[#FCFAF8] dark:bg-slate-850 hover:bg-white dark:hover:bg-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700 hover:shadow-sm rounded-xl px-3 py-2 flex items-center justify-between text-xs transition-all duration-200 cursor-pointer group"
        >
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-bold text-xs">
            <svg className="w-3.5 h-3.5 fill-emerald-600 flex-shrink-0 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            <span>Desk WhatsApp</span>
          </div>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-emerald-500" />
            <span>Online</span>
          </span>
        </a>

        {/* Member Profile Avatar & Logout */}
        <div className="flex items-center justify-between p-2 rounded-2xl bg-[#FCFAF8] dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-rose-300 dark:ring-rose-800 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-rose-100 dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-400 font-bold text-xs flex items-center justify-center shadow-2xs shrink-0 ring-2 ring-rose-200 dark:ring-rose-900">
                {getInitials(user?.name)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
                {user?.name || 'Studio Member'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                {user?.email || ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logout('/member-explore')}
            aria-label="Logout"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#E11D48] dark:text-rose-400 hover:text-white hover:bg-[#E11D48] dark:hover:bg-[#E11D48] bg-rose-50 dark:bg-rose-950/40 border border-rose-200/90 dark:border-rose-900/60 transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95 shrink-0"
          >
            <LogOutIcon className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
