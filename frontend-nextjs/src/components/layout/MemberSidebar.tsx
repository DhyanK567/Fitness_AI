'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTenantBranding } from '@/features/settings';
import { usePathname } from 'next/navigation';
import { useAuthContext } from '@/lib/auth/AuthContext';
import {
  CalendarIcon,
  CreditCardIcon,
  QrCodeIcon,
  UserIcon,
  SparklesIcon,
  LogOutIcon,
  CheckCircleIcon,
  ClockIcon,
  HeartPulseIcon,
} from '@/components/ui/icons';

const NAV_ITEMS = [
  { href: '/member/home', label: 'Sanctuary Home', icon: HeartPulseIcon },
  { href: '/member/book-class', label: 'Book Class', icon: CalendarIcon },
  { href: '/member/my-membership', label: 'My Pass & Credit', icon: CheckCircleIcon },
  { href: '/member/my-payments', label: 'Payments & Receipts', icon: CreditCardIcon },
  { href: '/member/check-in', label: 'Digital QR Check-in', icon: QrCodeIcon },
  { href: '/member/events', label: 'Workshops & Events', icon: ClockIcon },
  { href: '/member/my-profile', label: 'Profile & Settings', icon: UserIcon },
  { href: '/member/recommendations', label: 'Mindful Recommendations', icon: SparklesIcon },
];

export const MemberSidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, activeMembership, logout } = useAuthContext();
  const branding = useTenantBranding();

  return (
    <aside className="w-64 bg-[#14181B] text-slate-300 border-r border-slate-800 flex flex-col justify-between min-h-screen">
      <div>
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-800/80">
          <Link href="/" className="flex items-center gap-3">
            {branding.logoUrl ? (
              <div className="relative w-8 h-8 shrink-0 overflow-hidden rounded-lg bg-white/10 p-1">
                <Image
                  src={branding.logoUrl}
                  alt={branding.studioName || 'Studio'}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <div className="w-8 h-8 flex items-center justify-center text-[#E11D48]">
                <svg className="w-7 h-7 fill-current" viewBox="0 0 24 24">
                  <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                </svg>
              </div>
            )}
            <div className="flex flex-col leading-[0.95] min-w-0">
              <span className="font-serif text-lg font-bold tracking-tight text-white block leading-tight truncate max-w-[170px]">
                {branding.studioName || 'Fitness Studio'}
              </span>
            </div>
          </Link>
        </div>

        {/* Member Profile Summary Badge */}
        {user && (
          <div className="p-4 mx-3 my-4 bg-slate-900/90 rounded-xl border border-slate-800 flex items-center gap-3">
            <img
              src={user.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover border-2 border-[#E11D48]"
            />
            <div className="overflow-hidden">
              <span className="font-semibold text-xs text-white block truncate">{user.name}</span>
              <span className="text-[10px] text-teal-400 font-mono block">ID: {user.memberId}</span>
              {activeMembership && (
                <span className="inline-block px-2 py-0.5 mt-1 text-[9px] font-bold text-white bg-[#E11D48] rounded-full uppercase tracking-wider">
                  {activeMembership.planName.split(' ')[0]} Active
                </span>
              )}
            </div>
          </div>
        )}

        {/* Navigation Menu */}
        <nav className="px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-teal-800 to-teal-700 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#E11D48]' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer / Logout */}
      <div className="p-4 border-t border-slate-800/80 space-y-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-xs text-slate-400 hover:text-teal-400 transition font-medium px-2"
        >
          <span>&larr; Public Website</span>
        </Link>
        <button
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-slate-900 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-800 text-xs font-semibold transition"
        >
          <LogOutIcon className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
