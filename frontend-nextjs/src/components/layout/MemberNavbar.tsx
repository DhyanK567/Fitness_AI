'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthContext } from '@/lib/auth/AuthContext';
import {
  QrCodeIcon,
  SearchIcon,
  ChevronDownIcon,
  CalendarIcon,
  CreditCardIcon,
  UserIcon,
  SparklesIcon,
  LogOutIcon,
  CheckCircleIcon,
  XIcon,
  MenuIcon,
  ShieldCheckIcon,
} from '@/components/ui/icons';

export const MemberNavbar: React.FC = () => {
  const pathname = usePathname();
  const { user, activeMembership, logout } = useAuthContext();
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const NAV_LINKS = [
    { href: '/member/home', label: 'Home' },
    { href: '/classes', label: 'Classes' },
    { href: '/member/my-membership', label: 'Memberships' },
    { href: '/member/events', label: 'Workshops & Events' },
    { href: '/member/book-class', label: 'Book Class' },
  ];

  return (
    <>
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-40 shadow-xs font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* LEFT: Logo & Wordmark */}
          <div className="flex items-center gap-8">
            <Link href="/member/home" className="flex items-center gap-3 group">
              <div className="w-9 h-9 flex items-center justify-center text-[#E11D48] transition-transform group-hover:scale-105">
                <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                  <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
                </svg>
              </div>
              <div className="flex flex-col leading-[0.95]">
                <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-slate-900 group-hover:text-[#E11D48] transition-colors leading-none">
                  Fitness
                </span>
                <span className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-slate-900 group-hover:text-[#E11D48] transition-colors leading-none">
                  Studio
                </span>
              </div>
            </Link>

            {/* CENTER: Main Nav Links (Desktop) */}
            <nav className="hidden lg:flex items-center space-x-8 text-xs font-semibold uppercase tracking-wider text-slate-700">
              {NAV_LINKS.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`transition-colors py-1 relative ${
                      isActive
                        ? 'text-[#E11D48] font-bold border-b-2 border-[#E11D48]'
                        : 'hover:text-[#E11D48]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* RIGHT: Controls & Account Menu */}
          <div className="flex items-center gap-3">
            {/* Digital QR Pass Button */}
            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              suppressHydrationWarning
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-full bg-rose-50 hover:bg-rose-100 text-[#E11D48] text-xs font-bold transition border border-rose-100"
            >
              <QrCodeIcon className="w-4 h-4" />
              <span>Digital QR Pass</span>
            </button>

            {/* Danza Double-Box Outline "Book Class" Button */}
            <Link
              href="/member/book-class"
              className="hidden md:inline-block px-5 py-2 text-[11px] uppercase tracking-widest font-semibold text-[#E11D48] border border-[#E11D48] outline outline-1 outline-[#E11D48] outline-offset-3 hover:bg-[#E11D48] hover:text-white transition-all duration-300"
            >
              BOOK CLASS
            </Link>

            {/* Account Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                suppressHydrationWarning
                className="flex items-center gap-2 p-1.5 rounded-full hover:bg-slate-100 transition border border-slate-200"
              >
                <img
                  src={
                    user?.avatarUrl ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
                  }
                  alt={user?.name || 'Member'}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
                <span className="text-xs font-bold text-slate-800 hidden sm:inline">{user?.name?.split(' ')[0]}</span>
                <ChevronDownIcon className="w-3.5 h-3.5 text-slate-500 hidden sm:inline" />
              </button>

              {/* Account Dropdown Menu */}
              {accountMenuOpen && (
                <div
                  className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-3 z-50 animate-in fade-in zoom-in-95 duration-150"
                  onMouseLeave={() => setAccountMenuOpen(false)}
                >
                  {/* Menu User Header */}
                  <div className="px-4 py-2 border-b border-slate-100 mb-2">
                    <span className="font-serif text-sm font-bold text-slate-900 block truncate">
                      {user?.name}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono block">ID: {user?.memberId}</span>
                    {activeMembership && (
                      <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                        {activeMembership.planName.split(' ')[0]} Active
                      </span>
                    )}
                  </div>

                  {/* Links */}
                  <div className="space-y-0.5 text-xs text-slate-700 font-medium">
                    <Link
                      href="/member/home"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Sanctuary Dashboard</span>
                    </Link>
                    <Link
                      href="/member/my-membership"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <CheckCircleIcon className="w-4 h-4 text-slate-400" />
                      <span>My Pass &amp; Credits</span>
                    </Link>
                    <Link
                      href="/member/attendance"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <CalendarIcon className="w-4 h-4 text-slate-400" />
                      <span>Attendance &amp; Consistency</span>
                    </Link>
                    <Link
                      href="/member/my-payments"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <CreditCardIcon className="w-4 h-4 text-slate-400" />
                      <span>Payments &amp; Receipts</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        setQrModalOpen(true);
                      }}
                      className="w-full text-left flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <QrCodeIcon className="w-4 h-4 text-[#E11D48]" />
                      <span>Digital QR Door Pass</span>
                    </button>
                    <Link
                      href="/member/recommendations"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <SparklesIcon className="w-4 h-4 text-slate-400" />
                      <span>Rewards &amp; Recommendations</span>
                    </Link>
                    <Link
                      href="/member/my-profile"
                      onClick={() => setAccountMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-rose-50 hover:text-[#E11D48] transition"
                    >
                      <UserIcon className="w-4 h-4 text-slate-400" />
                      <span>Profile &amp; Settings</span>
                    </Link>
                  </div>

                  <div className="pt-2 mt-2 border-t border-slate-100 px-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountMenuOpen(false);
                        logout();
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition"
                    >
                      <LogOutIcon className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Menu Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900"
            >
              {mobileMenuOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-6 space-y-4">
            <nav className="flex flex-col space-y-3 text-xs font-semibold uppercase tracking-wider text-slate-700">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="hover:text-[#E11D48] py-1"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setQrModalOpen(true);
                }}
                className="w-full py-2.5 rounded-xl bg-rose-50 text-[#E11D48] font-bold text-xs flex items-center justify-center gap-2"
              >
                <QrCodeIcon className="w-4 h-4" />
                <span>Digital QR Pass</span>
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full py-2.5 rounded-xl border border-rose-200 bg-rose-50/50 text-[#E11D48] font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-100 transition"
                >
                  <LogOutIcon className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Digital QR Pass Modal */}
      {qrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-6 shadow-2xl border border-slate-100 text-center relative animate-in fade-in zoom-in-95 duration-150">
            <button
              type="button"
              onClick={() => setQrModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700"
            >
              <XIcon className="w-5 h-5" />
            </button>

            <div>
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48]">
                STUDIO DOOR TURNSTILE
              </span>
              <h3 className="font-serif text-2xl font-bold text-slate-900 mt-1">Digital Member Pass</h3>
              <p className="text-xs text-slate-500 mt-1">
                Scan at Indiranagar or Bandra sanctuary door for automatic gate release.
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl inline-block shadow-inner border-2 border-slate-100">
              <QrCodeIcon className="w-44 h-44 text-slate-900 mx-auto" />
            </div>

            <div className="text-xs space-y-1">
              <p className="font-bold text-slate-900">{user?.name}</p>
              <p className="font-mono text-teal-800 text-[11px]">ID: {user?.memberId}</p>
              <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase">
                {activeMembership?.planName} Active
              </span>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs uppercase tracking-wider hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
