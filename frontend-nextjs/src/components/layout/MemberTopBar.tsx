'use client';

import React from 'react';
import Link from 'next/link';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { QrCodeIcon, BellIcon, CalendarIcon } from '@/components/ui/icons';

export const MemberTopBar: React.FC = () => {
  const { user, activeMembership } = useAuthContext();

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      <div className="flex items-center gap-4">
        <span className="text-xs uppercase font-bold tracking-[0.2em] text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
          STUDIO SANCTUARY
        </span>
        <span className="hidden sm:inline-block text-xs text-slate-500 font-medium">
          Bengaluru &bull; Mumbai Studios
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick QR Check-in CTA */}
        <Link
          href="/member/check-in"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
        >
          <QrCodeIcon className="w-4 h-4 text-[#E11D48]" />
          <span className="hidden md:inline">Digital QR Pass</span>
        </Link>

        {/* Quick Book Class CTA */}
        <Link
          href="/member/book-class"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition shadow-xs"
        >
          <CalendarIcon className="w-4 h-4" />
          <span>Book Class</span>
        </Link>

        {/* User Avatar */}
        {user && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-8 h-8 rounded-full object-cover border border-slate-200"
            />
            <span className="text-xs font-bold text-slate-800 hidden lg:inline">{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
};
