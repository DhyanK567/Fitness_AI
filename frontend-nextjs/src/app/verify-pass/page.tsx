'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function VerifyPassContent() {
  const searchParams = useSearchParams();

  const memberId = searchParams.get('id') || 'MEM-0042';
  const name = searchParams.get('name') || 'Deepak GM';
  const studio = searchParams.get('studio') || 'Prana Yoga & Shala';
  const status = searchParams.get('status') || 'Active';
  const credits = searchParams.get('credits') || '99';
  const token = searchParams.get('token') || 'QR-SEC-99214-X8';

  const [relockCountdown, setRelockCountdown] = useState(8);
  const [gateUnlocked, setGateUnlocked] = useState(true);
  const [scanTimestamp, setScanTimestamp] = useState<string>('');

  useEffect(() => {
    setScanTimestamp(
      new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    );

    const timer = setInterval(() => {
      setRelockCountdown((prev) => {
        if (prev <= 1) {
          setGateUnlocked(false);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 selection:bg-[#E11D48] selection:text-white font-sans">
      {/* Top Banner */}
      <div className="w-full max-w-md mx-auto text-center mb-6">
        <span className="text-[11px] font-mono uppercase font-bold tracking-[0.25em] text-rose-400 block">
          OPTICAL GATE SCANNER • VERIFICATION SYSTEM
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-1">
          {studio}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Gate Turnstile Sensor Unit #02 • Entrance Sanctuary
        </p>
      </div>

      {/* Main Gate Access Card */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glowing Status Border Light */}
        <div
          className={`absolute top-0 inset-x-0 h-1.5 transition-colors duration-500 ${
            gateUnlocked ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.8)]' : 'bg-slate-700'
          }`}
        />

        {/* Verification Icon / Pulse */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            {gateUnlocked && (
              <span className="animate-ping absolute inset-0 rounded-full bg-emerald-500/30 duration-1000" />
            )}
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-colors ${
                gateUnlocked
                  ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border-2 border-slate-700'
              }`}
            >
              {gateUnlocked ? (
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              )}
            </div>
          </div>

          <span
            className={`text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-1 border ${
              gateUnlocked
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {gateUnlocked ? 'ACCESS GRANTED • GATE UNLATCHED' : 'GATE RELOCKED'}
          </span>

          <h2 className="text-2xl font-bold text-white mt-2">{name}</h2>
          <p className="text-xs font-mono text-slate-400 mt-1">
            Member ID: <span className="text-white font-semibold">{memberId}</span>
          </p>
        </div>

        {/* Member Details Grid */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 space-y-3">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Membership Status</span>
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {status}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Available Credits</span>
            <span className="font-semibold text-white font-mono">{credits} Sessions Remaining</span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Scanned Token</span>
            <span className="font-mono text-slate-300 text-[11px] bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {token}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Verified Timestamp</span>
            <span className="font-mono text-slate-300">{scanTimestamp || 'Live'}</span>
          </div>
        </div>

        {/* Relock Timer Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          {gateUnlocked ? (
            <p className="text-xs text-amber-400 font-mono flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Turnstile unlatched — relocks in {relockCountdown}s</span>
            </p>
          ) : (
            <p className="text-xs text-slate-400 font-mono">
              Turnstile securely relocked. Hold pass to sensor to re-open.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/portal"
            className="w-full py-3 bg-[#E11D48] hover:bg-[#be123c] active:scale-[0.98] text-white text-xs uppercase font-bold tracking-widest rounded-xl transition text-center shadow-lg shadow-rose-950/40"
          >
            Return to Member Portal
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyPassPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
          Verifying Gate Pass...
        </div>
      }
    >
      <VerifyPassContent />
    </Suspense>
  );
}
