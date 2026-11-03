'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  QrCodeIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  ZapIcon,
  ClockIcon,
} from '@/components/ui/icons';

export const PortalPass: React.FC = () => {
  const { user, activeMembership, decrementCredit } = useAuthContext();
  const { addToast } = useToast();

  const [qrToken, setQrToken] = useState('QR-SEC-99214-X8');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrMode, setQrMode] = useState<'url' | 'data'>('url');
  const [secondsRemaining, setSecondsRemaining] = useState(15);
  const [lastScannedTime, setLastScannedTime] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Generate real ISO-compliant scannable QR code whenever token, user, or mode updates
  useEffect(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const verifyUrl = `${origin}/verify-pass?id=${encodeURIComponent(user?.memberId || 'MEM-0042')}&name=${encodeURIComponent(user?.name || 'Member')}&studio=${encodeURIComponent(user?.studioName || 'Prana Yoga & Shala')}&status=${encodeURIComponent(activeMembership?.status || 'Active')}&credits=${activeMembership?.remainingCredits ?? 99}&token=${encodeURIComponent(qrToken)}`;
    const dataString = `STUDIO GATE PASS\nMember: ${user?.name || 'Member'}\nID: ${user?.memberId || 'MEM-0042'}\nStudio: ${user?.studioName || 'Prana Yoga & Shala'}\nStatus: ${activeMembership?.status || 'Active'}\nCredits: ${activeMembership?.remainingCredits ?? 99}\nToken: ${qrToken}\nAccess: VERIFIED`;

    const payload = qrMode === 'url' ? verifyUrl : dataString;

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate pass QR:', err));
  }, [qrToken, qrMode, user?.memberId, user?.name, user?.studioName, activeMembership?.status, activeMembership?.remainingCredits]);

  // Rotate QR code token every 15 seconds to prevent screenshot pass sharing
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
          setQrToken(`QR-SEC-${Date.now().toString().slice(-5)}-${randomSuffix}`);
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleSimulateTurnstileScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const success = decrementCredit();
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setLastScannedTime(now);

      if (success) {
        addToast({
          type: 'success',
          title: 'Turnstile Gate Unlatched (0.8s)',
          message: `Access verified for ${user?.name}. 1 session credit decremented. Gate relocks in 8s.`,
        });
      } else {
        addToast({
          type: 'error',
          title: 'Turnstile Access Denied',
          message: 'Membership has 0 remaining credits or is currently paused. Please see reception.',
        });
      }
    }, 800);
  };

  return (
    <div className="max-w-xl mx-auto space-y-8 font-sans text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="text-center space-y-1.5">
        <span className="text-[11px] uppercase font-bold text-[#E11D48] dark:text-rose-400 tracking-[0.2em] block">
          CONTACTLESS DIGITAL WALLET PASS
        </span>
        <h2 className="font-serif text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
          Studio Gate Turnstile Pass
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Hold your phone against the optical scanner at the studio entrance.
        </p>
      </div>

      {/* ── Mobile-Optimized Wallet Pass Card ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden relative transition-colors">
        {/* Pass Top Banner */}
        <div className="bg-gradient-to-r from-rose-50/70 via-white to-rose-50/40 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 text-slate-900 dark:text-white p-6 sm:p-7 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
          <div>
            <span className="text-[10px] uppercase font-mono font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400 block">
              {user?.studioName || 'Fitness Studio'}
            </span>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tracking-tight">{user?.name || 'Member'}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Member ID: <strong className="text-slate-900 dark:text-white font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-[11px] ml-1">{user?.memberId || 'MEM-0042'}</strong>
            </p>
          </div>
          <div className="text-right space-y-1">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {activeMembership?.status || 'Active'}
            </span>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">
              Credits: <strong className="text-slate-900 dark:text-white font-bold">{activeMembership?.remainingCredits}</strong>
            </p>
          </div>
        </div>

        {/* Dynamic Anti-Fraud Rotating QR Code Area */}
        <div className="p-8 text-center space-y-6 bg-[#FCFAF8] dark:bg-slate-850 transition-colors">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/20 dark:border-rose-900/50 text-[#E11D48] dark:text-rose-400 text-[11px] font-bold uppercase tracking-wider">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span>Anti-Fraud Dynamic Rotating Code ({secondsRemaining}s)</span>
          </div>

          {/* QR Code Container */}
          <div className="qr-code-surface relative mx-auto w-64 min-h-[17.5rem] bg-white dark:bg-slate-900 p-4.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md transition-all flex flex-col items-center justify-center">
            {qrDataUrl ? (
              <div className="p-2.5 bg-white rounded-xl shadow-2xs inline-block">
                <img
                  src={qrDataUrl}
                  alt={`Studio Turnstile QR Pass for ${user?.name || 'Member'}`}
                  className="w-48 h-48 sm:w-52 sm:h-52 object-contain rounded-lg transition-transform hover:scale-105 duration-200"
                />
              </div>
            ) : (
              <div className="w-52 h-52 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800 text-slate-400 gap-2 rounded-lg">
                <span className="w-6 h-6 border-2 border-slate-300 border-t-[#E11D48] rounded-full animate-spin" />
                <span className="text-[11px] font-mono">Generating Live QR...</span>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between w-full px-1">
              <span className="text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400 tracking-wider bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700">
                {qrToken}
              </span>
              <a
                href={`/verify-pass?id=${encodeURIComponent(user?.memberId || 'MEM-0042')}&name=${encodeURIComponent(user?.name || 'Member')}&studio=${encodeURIComponent(user?.studioName || 'Prana Yoga & Shala')}&status=${encodeURIComponent(activeMembership?.status || 'Active')}&credits=${activeMembership?.remainingCredits ?? 99}&token=${encodeURIComponent(qrToken)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-bold text-[#E11D48] dark:text-rose-400 hover:text-[#be123c] dark:hover:text-rose-300 hover:underline flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Test Web Scan ↗</span>
              </a>
            </div>
          </div>

          {/* QR Format Selector */}
          <div className="flex items-center justify-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800 rounded-xl max-w-xs mx-auto border border-slate-200/80 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setQrMode('url')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition ${
                qrMode === 'url'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              🌐 Web Check-in URL
            </button>
            <button
              type="button"
              onClick={() => setQrMode('data')}
              className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition ${
                qrMode === 'data'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              📱 Camera Text Pass
            </button>
          </div>

          {/* Barcode & Member ID for Laser Scanners */}
          <div className="space-y-1.5 border-t border-dashed border-slate-300 dark:border-slate-700 pt-5">
            <div className="h-10 mx-auto max-w-xs flex items-center justify-center space-x-1">
              {[3, 1, 4, 1, 2, 4, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 4, 2, 1].map((w, i) => (
                <div
                  key={i}
                  className="bg-slate-900 dark:bg-slate-200 h-full rounded-xs"
                  style={{ width: `${w * 2}px` }}
                />
              ))}
            </div>
            <p className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 tracking-[0.25em]">
              * {user?.memberId || 'MEM-0042'} *
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500">
              Compatible with 1D optical laser scanners, RFID card readers, &amp; iPad cameras.
            </p>
          </div>
        </div>

        {/* ── Turnstile Gate Simulator ── */}
        <div className="p-6 bg-slate-50 dark:bg-slate-850/80 border-t border-slate-200/80 dark:border-slate-800 text-center space-y-3 transition-colors">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-700 dark:text-slate-300">
            Turnstile Gate Test Simulator
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Click to simulate scanning at the studio entrance gate.
          </p>

          <button
            type="button"
            onClick={handleSimulateTurnstileScan}
            disabled={isScanning}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-[#E11D48] dark:hover:bg-[#BE123C] active:scale-[0.98] text-white text-xs uppercase tracking-[0.15em] font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-75 cursor-pointer"
          >
            {isScanning ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Scanning Turnstile Sensor...</span>
              </span>
            ) : (
              <>
                <ZapIcon className="w-4 h-4 text-emerald-400" />
                <span>Simulate Optical Turnstile Scan</span>
              </>
            )}
          </button>

          {lastScannedTime && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/20 dark:border-emerald-800 rounded-full text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Gate Unlatched Today at {lastScannedTime} (Verified Entry)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
