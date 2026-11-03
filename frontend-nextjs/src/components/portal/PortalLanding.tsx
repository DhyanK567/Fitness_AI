'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthContext, DEMO_PROFILES } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import {
  QrCodeIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  PhoneIcon,
  ZapIcon,
  SparklesIcon,
  ChevronDownIcon,
  ArrowRightIcon,
  LockIcon,
} from '@/components/ui/icons';

export const PortalLanding: React.FC = () => {
  const router = useRouter();
  const { addToast } = useToast();
  const { loginWithOtp, switchProfile } = useAuthContext();

  const [phone, setPhone] = useState('9876543210');
  const [otpStep, setOtpStep] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['1', '2', '3', '4', '5', '6']);
  const [rememberMe, setRememberMe] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const [loading, setLoading] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);


  // Countdown timer for OTP resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (otpStep && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [otpStep, countdown]);

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      addToast({
        type: 'error',
        title: 'Valid Mobile Number Required',
        message: 'Please enter a valid 10-digit Indian mobile number (+91).',
      });
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setOtpStep(true);
      setCountdown(30);
      addToast({
        type: 'success',
        title: 'WhatsApp OTP Sent',
        message: `6-digit pass code sent to +91 ${phone}. (Demo code: 123456)`,
      });
    }, 600);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length !== 6) {
      addToast({
        type: 'error',
        title: '6-Digit Code Required',
        message: 'Please fill in all 6 digits of the OTP.',
      });
      return;
    }

    setLoading(true);
    const res = await loginWithOtp(phone, code);
    setLoading(false);

    if (res.success) {
      addToast({
        type: 'success',
        title: 'Access Granted',
        message: 'Welcome back to your Digital Studio Pass Sanctuary!',
      });
      router.push('/portal');
    } else {
      addToast({
        type: 'error',
        title: 'Verification Failed',
        message: res.message || 'Incorrect verification code. Please try again.',
      });
    }
  };

  const handleQuickDemo = (index: number) => {
    switchProfile(index);
    const profile = DEMO_PROFILES[index];
    addToast({
      type: 'success',
      title: `Logged in as ${profile.user.name}`,
      message: `Welcome to ${profile.user.studioName} (${profile.membership.planName})`,
    });
    router.push('/portal');
  };

  const handleDigitChange = (index: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otpDigits];
    next[index] = val.slice(-1);
    setOtpDigits(next);

    // Auto-advance focus
    if (val && index < 5) {
      const nextInput = document.getElementById(`otp-input-${index + 1}`);
      nextInput?.focus();
    }
  };

  const FAQ_ITEMS = [
    {
      q: 'How does contactless turnstile QR entry work?',
      a: 'Your digital pass displays a rotating, anti-fraud QR code and optical barcode. Tap your phone screen against the studio gate or scanner; the gate unlatches in 0.8 seconds and automatically logs your session attendance.',
    },
    {
      q: 'What is the studio membership freeze policy?',
      a: 'Members can pause their passes for 7 to 30 days due to medical reasons or travel. Self-service freezes retain 100% of your remaining credits without shifting expiration dates.',
    },
    {
      q: 'How does the automated waitlist promotion engine work?',
      a: 'When high-demand classes fill to capacity, join the waitlist in 1 tap. If another member cancels more than 2 hours before start, our ACID engine instantly promotes you, applies credits, and notifies you via WhatsApp.',
    },
    {
      q: 'Where do I download official GST tax invoices?',
      a: 'All desk payments, card transactions, and UPI dues generate printable GST tax receipts available under the "Payments" tab, complete with Studio GSTIN, SAC codes, and breakdown.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FCFAF8] text-slate-800 flex flex-col justify-between font-sans selection:bg-[#E11D48] selection:text-white">
      {/* ── 1. Header ── */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 flex items-center justify-center text-[#E11D48] transition-transform group-hover:scale-105">
              <svg className="w-8 h-8 fill-current" viewBox="0 0 24 24">
                <path d="M12.8 1.5a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6zm-1.6 4.9c-.6.4-1.1 1-1.5 1.7-.6 1.1-.8 2.3-.5 3.5.2.9.8 1.7 1.6 2.3-.4 1.4-1.2 2.7-2.3 3.7l-1.3 1 1.5.9c1.9 1.1 4.2 1.6 6.4 1.6 1.3 0 2.5-.2 3.7-.5l1.4-.5-.8-1.2c-1-1.6-1.6-3.4-1.6-5.3 0-1.4.3-2.8.9-4 .3-.7.5-1.5.5-2.3 0-1.3-.6-2.5-1.7-3.2-1-.7-2.4-.7-3.4-.2l-1.8 1.1zm4.6 3.3c-.5 1.1-.8 2.3-.8 3.5 0 1.7.5 3.4 1.3 4.9-1.8.5-3.7.6-5.5.2 1-1 1.7-2.2 2.1-3.5.5-1.6.4-3.3-.2-4.8l1.9-1.2c.6-.3 1.4-.3 2 .2.6.4 1 1.1 1 1.8 0 .3-.1.6-.2 1-.3.6-.7 1.3-1.2 1.9l-.5.6.6.5z" />
              </svg>
            </div>
            <div>
              <span className="font-serif text-2xl font-bold tracking-tight text-slate-900 block leading-none">
                Fitness Studio Pass
              </span>
              <span className="text-[10px] text-[#E11D48] font-bold uppercase tracking-[0.2em] block mt-1">
                B2C MEMBER SANCTUARY PORTAL
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            <a
              href="#login-box"
              className="text-xs uppercase tracking-wider font-semibold text-slate-700 hover:text-[#E11D48] transition"
            >
              Sign In to Pass
            </a>
            <Link
              href="/"
              className="relative inline-block px-5 py-2 text-[11px] uppercase tracking-widest font-semibold text-[#E11D48] border border-[#E11D48] outline outline-1 outline-[#E11D48] outline-offset-2 hover:bg-[#E11D48] hover:text-white transition-all duration-300"
            >
              Public Website &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* ── 2. Hero & Value Banner + Passwordless Login ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16 w-full flex-1 space-y-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Value Proposition & Pass Highlights */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-rose-50 border border-rose-200 text-[#E11D48] text-xs font-bold uppercase tracking-wider">
              <SparklesIcon className="w-3.5 h-3.5" />
              <span>Contactless Studio Wallet &amp; Check-In Pass</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-[54px] font-bold text-[#1A1A1A] leading-[1.12]">
              Your Studio Pass.<br />
              <span className="text-[#E11D48]">Zero Queues. Full Freedom.</span>
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
              Access your boutique sanctuary in 0.8 seconds. Flash your dynamic turnstile pass, track session credits in real-time, view consistency streaks, manage freezes, and settle desk dues from any device.
            </p>

            {/* Feature Pills Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 max-w-xl">
              {[
                { label: '0.8s Turnstile QR Check-in', desc: 'Dynamic fraud-proof rotating entry codes' },
                { label: 'Live Session Credits Wheel', desc: 'Real-time remaining session tracking' },
                { label: 'Consistency Streaks 🔥', desc: 'Milestones & loyalty perks for habits' },
                { label: 'Self-Service Freeze (Pause)', desc: 'Pause membership for travel or recovery' },
                { label: 'Official GST Invoices', desc: 'Printable tax receipts with SAC codes' },
                { label: 'ACID Concurrency Waitlists', desc: 'Auto-promotion on class cancellations' },
              ].map((feat, idx) => (
                <div key={idx} className="p-3 bg-white border border-slate-200 flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-rose-50 text-[#E11D48] flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{feat.label}</p>
                    <p className="text-[11px] text-slate-500">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Passwordless Mobile OTP Login Card */}
          <div id="login-box" className="lg:col-span-5">
            <div className="bg-white border-2 border-slate-200 shadow-xl p-8 relative space-y-6">
              {/* Header */}
              <div className="border-b border-slate-100 pb-4">
                <span className="text-xs uppercase font-bold text-[#E11D48] tracking-widest block mb-1">
                  MEMBER AUTHENTICATION
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900">
                  Sign In to Studio Pass
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Passwordless authentication via 6-digit WhatsApp OTP.
                </p>
              </div>

              {/* Login Form */}
              {!otpStep ? (
                <form onSubmit={handleSendOtp} className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                      Indian Mobile Number (+91)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        +91
                      </div>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="9876543210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold tracking-wider focus:outline-none focus:border-[#E11D48] transition"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="accent-[#E11D48] w-4 h-4"
                      />
                      <span>Remember this device</span>
                    </label>
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <ShieldCheckIcon className="w-3.5 h-3.5" />
                      Encrypted
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs uppercase tracking-widest font-bold transition shadow-md flex items-center justify-center gap-2"
                  >
                    {loading ? 'Sending Code...' : 'Send WhatsApp OTP'}
                    <ArrowRightIcon className="w-3.5 h-3.5" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Enter 6-Digit WhatsApp Code
                      </label>
                      <button
                        type="button"
                        onClick={() => setOtpStep(false)}
                        className="text-[11px] text-[#E11D48] hover:underline"
                      >
                        Change Number
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-3">
                      Sent to <strong>+91 {phone}</strong> &bull; Demo OTP is <strong className="text-slate-900 font-mono">123456</strong>
                    </p>

                    {/* 6 OTP boxes */}
                    <div className="grid grid-cols-6 gap-2">
                      {otpDigits.map((digit, i) => (
                        <input
                          key={i}
                          id={`otp-input-${i}`}
                          type="text"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleDigitChange(i, e.target.value)}
                          className="w-full h-12 text-center font-mono text-lg font-bold bg-slate-50 border border-slate-300 focus:outline-none focus:border-[#E11D48] transition"
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">
                      Resend code in:{' '}
                      <strong className="text-slate-900 font-mono">
                        {countdown > 0 ? `${countdown}s` : 'Ready'}
                      </strong>
                    </span>
                    <button
                      type="button"
                      disabled={countdown > 0}
                      onClick={handleSendOtp}
                      className="text-[#E11D48] font-bold disabled:text-slate-400 hover:underline"
                    >
                      Resend OTP
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-[#E11D48] hover:bg-[#BE123C] text-white text-xs uppercase tracking-widest font-bold transition shadow-md flex items-center justify-center gap-2"
                  >
                    {loading ? 'Verifying...' : 'Verify Pass & Sign In'}
                    <CheckCircleIcon className="w-3.5 h-3.5" />
                  </button>
                </form>
              )}

              {/* ── 1-Click Demo Profile Switcher ── */}
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest block text-center">
                  &bull; 1-Click Demo Profile Switcher &bull;
                </span>

                <button
                  type="button"
                  onClick={() => handleQuickDemo(0)}
                  className="w-full p-3 bg-[#FCFAF8] hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition text-left flex items-center justify-between group"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-[#E11D48] transition">
                      Neha Sharma (9876543210)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Prana Yoga &amp; Shala &bull; 12/15 Credits Left
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-[#E11D48] bg-white px-2 py-1 border border-rose-200">
                    Switch &rarr;
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickDemo(1)}
                  className="w-full p-3 bg-[#FCFAF8] hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition text-left flex items-center justify-between group"
                >
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-900 group-hover:text-[#E11D48] transition">
                      Aarav Mehta (9845088221)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Zion Dance Academy &bull; Monthly Unlimited &bull; 14-day streak 🔥
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-[#E11D48] bg-white px-2 py-1 border border-rose-200">
                    Switch &rarr;
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. FAQ Accordion & Studio Feature Tour ── */}
        <section className="pt-8 border-t border-slate-200 space-y-8">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <span className="text-xs uppercase font-bold text-[#E11D48] tracking-widest block">
              STUDIO FEATURE TOUR &amp; FAQS
            </span>
            <h3 className="font-serif text-3xl font-bold text-slate-900">
              Everything Members Need to Know
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              Transparent answers regarding studio access, pass freezes, waitlists, and receipts.
            </p>
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = activeFaq === idx;
              return (
                <div key={idx} className="bg-white border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setActiveFaq(isOpen ? null : idx)}
                    className="w-full p-4 text-left flex items-center justify-between text-xs sm:text-sm font-bold text-slate-900 hover:text-[#E11D48] transition"
                  >
                    <span>{item.q}</span>
                    <ChevronDownIcon
                      className={`w-4 h-4 text-slate-400 transition-transform ${
                        isOpen ? 'rotate-180 text-[#E11D48]' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="p-4 pt-0 text-xs text-slate-600 leading-relaxed border-t border-slate-50">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200/80 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>&copy; {new Date().getFullYear()} Fitness Studio Pass Sanctuary. Powered by Wellness Studio OS.</p>
          <div className="flex items-center gap-4 text-slate-400">
            <span>256-Bit SSL Encrypted</span>
            <span>&bull;</span>
            <span>Zero Pass Sharing Policy</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
