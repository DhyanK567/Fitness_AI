'use client';

import React, { useState } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { QrCodeIcon, CheckCircleIcon, ShieldCheckIcon, RefreshCwIcon, MapPinIcon, ClockIcon } from '@/components/ui/icons';

export default function MemberCheckInPage() {
  const { user, activeMembership } = useAuthContext();
  const { addToast } = useToast();
  const [verifying, setVerifying] = useState(false);

  const handleSimulateTurnstileCheckIn = () => {
    setVerifying(true);
    setTimeout(() => {
      setVerifying(false);
      addToast({
        type: 'success',
        title: 'Turnstile Unlocked!',
        message: 'Welcome to Indiranagar Sanctuary. Attendance logged for Dynamic Vinyasa Flow.',
      });
    }, 1000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center space-y-2">
        <span className="text-xs uppercase font-bold tracking-[0.25em] text-[#E11D48] block">
          CONTACTLESS TURNSTILE ACCESS
        </span>
        <h1 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900">
          Digital Member Sanctuary Pass
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
          Scan this dynamic QR code at any Indiranagar or Bandra studio turnstile for seamless entry.
        </p>
      </div>

      {/* Main Digital Pass Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-[#14181B] text-white rounded-3xl p-8 sm:p-10 border border-slate-700 shadow-2xl space-y-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-teal-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between border-b border-slate-700/80 pb-6 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#E11D48] text-white flex items-center justify-center font-bold font-serif text-lg">
              F
            </div>
            <div>
              <span className="font-serif text-xl font-bold text-white block leading-none">Fitness Studio OS</span>
              <span className="text-[10px] text-teal-300 font-semibold uppercase tracking-widest mt-1 block">
                Official Sanctuary Pass
              </span>
            </div>
          </div>
          <span className="px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold uppercase tracking-wider">
            {activeMembership?.status}
          </span>
        </div>

        {/* Dynamic QR Code Display */}
        <div className="text-center space-y-4 relative z-10">
          <div className="bg-white p-6 rounded-3xl inline-block shadow-2xl border-4 border-slate-800">
            <QrCodeIcon className="w-48 h-48 sm:w-56 sm:h-56 text-slate-900 mx-auto" />
          </div>
          <div>
            <span className="font-mono text-xs text-teal-300 tracking-widest block font-bold">
              ID: {user?.memberId}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">
              Refreshes automatically every 60s for anti-duplication security
            </span>
          </div>
        </div>

        {/* Member Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-700/80 text-xs relative z-10">
          <div>
            <span className="text-slate-400 block">Practitioner Name</span>
            <span className="font-bold text-white text-sm">{user?.name}</span>
          </div>
          <div>
            <span className="text-slate-400 block">Current Membership</span>
            <span className="font-bold text-white text-sm">{activeMembership?.planName.split(' ')[0]} Pass</span>
          </div>
          <div>
            <span className="text-slate-400 block">Remaining Credits</span>
            <span className="font-bold text-teal-300 text-sm">{activeMembership?.remainingCredits} Sessions</span>
          </div>
        </div>

        {/* Turnstile Check-in Simulator Button */}
        <div className="pt-2 text-center relative z-10">
          <button
            type="button"
            onClick={handleSimulateTurnstileCheckIn}
            disabled={verifying}
            className="w-full py-4 rounded-2xl bg-[#E11D48] hover:bg-[#BE123C] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2"
          >
            {verifying ? (
              <>
                <RefreshCwIcon className="w-4 h-4 animate-spin" />
                <span>Verifying QR at Door Sensor...</span>
              </>
            ) : (
              <>
                <ShieldCheckIcon className="w-4 h-4" />
                <span>Simulate Gate Check-in Sensor</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
