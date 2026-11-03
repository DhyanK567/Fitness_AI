'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PublicFooter } from '@/components/layout/PublicFooter';

export default function WorkshopRegistrationPage() {
  return (
    <div className="min-h-screen bg-[#FCFAF8] text-slate-800 flex flex-col font-sans">
      <PublicNavbar />
      <main className="flex-1 py-16 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center space-y-4">
          <div className="relative h-44 overflow-hidden rounded-2xl bg-slate-100">
            <Image src="https://images.unsplash.com/photo-1512290900672-1f4961817730?auto=format&fit=crop&w=900&q=80" alt="Sound meditation workshop" fill className="object-cover" sizes="(max-width: 768px) calc(100vw - 4rem), 448px" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Workshop Registration</h1>
          <p className="text-xs text-slate-500">Please select a workshop from our schedule to complete registration.</p>
          <Link href="/events" className="inline-block px-6 py-2.5 rounded-full bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 transition">
            Browse Workshops
          </Link>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
