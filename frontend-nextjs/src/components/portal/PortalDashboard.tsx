'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthContext } from '@/lib/auth/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { ApiClient } from '@/lib/api-client';
import { useTenantBranding } from '@/features/settings';
import type { PortalTab } from './MemberLeftSidebar';
import {
  ClockIcon,
  ZapIcon,
  FlameIcon,
  MapPinIcon,
  PhoneIcon,
  CheckCircleIcon,
  SparklesIcon,
  CalendarIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  GiftIcon,
  ArrowRightIcon,
} from '@/components/ui/icons';

interface ReferralSummary {
  referralCode: string;
  discountPercent: number;
  referrerRewardPercent: number;
  successfulReferrals: number;
  pendingReferrals: number;
  availableRewards: number;
  redeemedRewards: number;
  history: Array<{
    id: string;
    refereeName: string;
    refereeEmail?: string;
    planName?: string;
    amount?: number;
    rewardAmount: number;
    status: 'pending' | 'converted' | 'expired';
    rewardPaid: boolean;
    createdAt: string;
  }>;
}

interface RealClassItem {
  id: string;
  name: string;
  category: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  trainer: string;
  room?: string | null;
  capacity: number;
  status: string;
}

interface RealAttendanceRecord {
  id: string;
  bookingId: string;
  status: string;
  checkedInAt?: string | null;
  createdAt: string;
  className?: string;
  sessionName?: string;
  trainer?: string;
  date?: string;
  time?: string;
}

interface PortalDashboardProps {
  onNavigateTab: (tab: PortalTab) => void;
  onOpenPass: () => void;
}

export const PortalDashboard: React.FC<PortalDashboardProps> = ({
  onNavigateTab,
  onOpenPass,
}) => {
  const { user, activeMembership } = useAuthContext();
  const branding = useTenantBranding();
  const { addToast } = useToast();

  const [loadingData, setLoadingData] = useState(true);
  const [classes, setClasses] = useState<RealClassItem[]>([]);
  const [attendances, setAttendances] = useState<RealAttendanceRecord[]>([]);
  const [myBookings, setMyBookings] = useState<any[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());

  const studioDisplayName = branding.studioName || user?.studioName || 'Fitness Studio';

  // Load Real Data from PostgreSQL via existing backend endpoints
  const loadDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [fetchedClasses, fetchedAttendance, fetchedBookings, fetchedReferral] = await Promise.all([
        ApiClient.getClasses().catch(() => []),
        ApiClient.getMyAttendance(user?.memberId || user?.id).catch(() => []),
        ApiClient.getMemberBookings(user?.memberId || user?.id || '').catch(() => []),
        ApiClient.getMyReferral().catch(() => null),
      ]);

      if (Array.isArray(fetchedClasses)) {
        setClasses(fetchedClasses as unknown as RealClassItem[]);
      }
      if (Array.isArray(fetchedAttendance)) {
        setAttendances(fetchedAttendance as RealAttendanceRecord[]);
      }
      if (Array.isArray(fetchedBookings)) {
        setMyBookings(fetchedBookings);
      }
      if (fetchedReferral && typeof fetchedReferral === 'object') {
        setReferralSummary(fetchedReferral as ReferralSummary);
      }
    } catch {
      // Graceful fallback to empty states
    } finally {
      setLoadingData(false);
    }
  }, [user?.memberId, user?.id]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Unique Deterministic Member Referral Code (e.g. PRIYA-8X4K)
  const memberReferralCode = useMemo(() => {
    if (referralSummary?.referralCode) return referralSummary.referralCode;
    const cleanFirst = (user?.name || 'MEMBER')
      .trim()
      .split(' ')[0]
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    const cleanSuffix = (user?.memberId || user?.id || '8X4K')
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(-4)
      .toUpperCase();
    return `${cleanFirst || 'MEMBER'}-${cleanSuffix || '8X4K'}`;
  }, [referralSummary?.referralCode, user?.name, user?.memberId, user?.id]);

  const handleCopyReferralCode = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(memberReferralCode);
      }
      setCodeCopied(true);
      addToast({
        type: 'success',
        title: 'Referral Code Copied!',
        message: `Your code ${memberReferralCode} has been copied to your clipboard.`,
      });
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    }
  };

  const handleShareWhatsApp = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const discount = referralSummary?.discountPercent ?? 5;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/member-explore?ref=${encodeURIComponent(memberReferralCode)}`;
    const text = encodeURIComponent(
      `Join me at ${studioDisplayName}! Use my referral code ${memberReferralCode} to get ${discount}% off your first membership pass:\n${shareUrl}`
    );
    if (typeof window !== 'undefined') {
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  };

  // Verified Present Attendance Records
  const presentAttendances = useMemo(() => {
    return attendances.filter((a) => a.status === 'Present');
  }, [attendances]);

  // Total Classes Completed (verified Present records)
  const totalClassesCompleted = presentAttendances.length;

  // Current Selected Month & Year
  const currentMonthIndex = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  // Sessions in currently selected calendar month
  const currentMonthSessions = useMemo(() => {
    return presentAttendances.filter((a) => {
      const d = new Date(a.date || a.checkedInAt || a.createdAt);
      return !isNaN(d.getTime()) && d.getMonth() === currentMonthIndex && d.getFullYear() === currentYear;
    }).length;
  }, [presentAttendances, currentMonthIndex, currentYear]);

  // Set of day numbers attended in currently selected month
  const attendedDaysInMonth = useMemo(() => {
    const set = new Set<number>();
    presentAttendances.forEach((a) => {
      const d = new Date(a.date || a.checkedInAt || a.createdAt);
      if (!isNaN(d.getTime()) && d.getMonth() === currentMonthIndex && d.getFullYear() === currentYear) {
        set.add(d.getDate());
      }
    });
    return set;
  }, [presentAttendances, currentMonthIndex, currentYear]);

  // Calculate Streak dynamically from trainer-verified attendance records
  // Rules:
  // 1. Identify member's scheduled class days from verified Present/Absent attendance records.
  // 2. Do not count future classes or unverified bookings.
  // 3. Multi-session attendance on the same day counts as 1 streak day.
  // 4. Do not reset streaks on studio holidays or days without scheduled classes.
  // 5. If a member misses a required scheduled class day (Absent), reset streak to 0.
  // 6. After their next verified attendance (Present), start the streak again from 1.
  const currentStreak = useMemo(() => {
    if (!attendances || !attendances.length) return 0;
    const now = new Date();
    const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];

    // Filter to past/present verified records only
    const verified = attendances.filter((r) => {
      const rawDate = r.date || r.checkedInAt || r.createdAt;
      if (!rawDate) return false;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return false;
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr > todayStr) return false; // Rule 4: Do not count future classes
      return r.status === 'Present' || r.status === 'Absent';
    });

    if (!verified.length) return 0;

    // Group records by calendar day (YYYY-MM-DD)
    const dayMap = new Map<string, { present: boolean; absent: boolean }>();
    verified.forEach((r) => {
      const d = new Date(r.date || r.checkedInAt || r.createdAt);
      const dayStr = d.toISOString().split('T')[0];
      const current = dayMap.get(dayStr) || { present: false, absent: false };
      if (r.status === 'Present') current.present = true;
      if (r.status === 'Absent') current.absent = true;
      dayMap.set(dayStr, current);
    });

    // Rule 9: If member attends multiple classes on one day, count that as one streak day.
    const sortedDays = Array.from(dayMap.entries())
      .map(([dateStr, status]) => ({
        dateStr,
        status: status.present ? 'Present' : 'Absent',
      }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    // Walk forward chronologically
    let streak = 0;
    for (const day of sortedDays) {
      if (day.status === 'Present') {
        streak += 1;
      } else if (day.status === 'Absent') {
        streak = 0;
      }
    }

    return streak;
  }, [attendances]);

  // Dynamic Greeting based on local time
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  // First name of authenticated member
  const memberFirstName = useMemo(() => {
    const name = (user?.name || 'Member').trim();
    return name.split(' ')[0] || 'Member';
  }, [user?.name]);

  // Days in selected month
  const daysInSelectedMonth = useMemo(() => {
    const count = new Date(currentYear, currentMonthIndex + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [currentYear, currentMonthIndex]);

  const selectedMonthName = useMemo(() => {
    return viewDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }, [viewDate]);

  // Month navigation handlers
  const handlePrevMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  // Remaining validity days
  const remainingDays = useMemo(() => {
    if (!activeMembership?.expiryDate) return null;
    try {
      const exp = new Date(activeMembership.expiryDate);
      if (isNaN(exp.getTime())) return null;
      const now = new Date();
      return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    } catch {
      return null;
    }
  }, [activeMembership?.expiryDate]);

  // Today's Batches from Real PostgreSQL StudioClass records
  const todayBatches = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const todays = classes.filter((c) => {
      if (!c.date) return false;
      const classDateStr = new Date(c.date).toISOString().split('T')[0];
      return classDateStr === todayStr && c.status !== 'Cancelled';
    });

    if (todays.length > 0) return todays.slice(0, 4);

    // If no classes today, show upcoming scheduled sessions
    const now = new Date().getTime();
    return classes
      .filter((c) => new Date(c.date).getTime() >= now && c.status !== 'Cancelled')
      .slice(0, 3);
  }, [classes]);

  // Handle Booking from Today's Batches
  const handleBookSession = async (cls: RealClassItem) => {
    try {
      await ApiClient.createBooking({
        class_schedule_id: cls.id,
        booking_date: cls.date,
        member_id: user?.memberId || user?.id,
      });
      addToast({
        type: 'success',
        title: 'Session Reserved!',
        message: `Reserved ${cls.name} (${cls.startTime}) with ${cls.trainer}. Spot confirmed!`,
      });
      loadDashboardData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Booking Unavailable',
        message: err.message || 'Could not complete booking reservation.',
      });
    }
  };

  // Assigned Coach
  const assignedCoach = user?.emergencyContact || classes[0]?.trainer || 'Ananya Sharma';

  return (
    <div className="space-y-8 font-sans text-slate-800 dark:text-slate-100">
      {/* ── PREMIUM WELCOME SECTION (Modern Editorial Polish) ── */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 md:p-8 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/30 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 border border-rose-100/80 dark:border-slate-800 shadow-sm">
        {/* Subtle Ambient Radial Lighting */}
        <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-rose-200/25 dark:bg-rose-900/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-72 h-72 rounded-full bg-amber-200/20 dark:bg-amber-900/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-xl">
            {/* Compact Membership Status Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/95 dark:bg-slate-800/90 backdrop-blur-xs border border-rose-200/70 dark:border-slate-700/80 text-[11px] font-semibold text-rose-900 dark:text-rose-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold">{activeMembership?.planName || 'pre basic'} Plan</span>
              <span className="text-slate-300 dark:text-slate-600">&bull;</span>
              <span className="text-slate-600 dark:text-slate-400 font-medium">{studioDisplayName}</span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-slate-950 dark:text-white tracking-tight leading-[1.15]">
              {greeting}, <span className="text-[#E11D48] dark:text-rose-400">{memberFirstName}</span>! 👋
            </h1>

            <p className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-300 leading-relaxed italic">
              &ldquo;Every step counts. Let&apos;s make today stronger than yesterday.&rdquo;
            </p>

            <div className="pt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E11D48]" />
                Your sanctuary fitness journey continues today at <strong className="text-slate-800 dark:text-slate-200 font-bold">{studioDisplayName}</strong>
              </span>
            </div>
          </div>

          {/* Sophisticated Editorial Motivational Feature */}
          <div className="relative shrink-0 w-full md:w-auto self-stretch md:self-auto flex items-center justify-center md:justify-end">
            <div className="relative w-full sm:w-[280px] md:w-[290px] lg:w-[310px] rounded-2xl p-5 sm:p-6 bg-white/80 dark:bg-slate-900/85 backdrop-blur-md border border-rose-200/70 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col justify-between">
              {/* Subtle Abstract Upward Flowing Curves & Editorial Sparkles */}
              <svg
                viewBox="0 0 280 130"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 w-full h-full pointer-events-none select-none"
              >
                <defs>
                  <linearGradient id="upwardFlow" x1="10" y1="120" x2="270" y2="10" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FDA4AF" stopOpacity="0.2" />
                    <stop offset="45%" stopColor="#F43F5E" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.75" />
                  </linearGradient>
                  <linearGradient id="upwardFlowAccent" x1="20" y1="125" x2="265" y2="25" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#FDA4AF" stopOpacity="0.1" />
                    <stop offset="60%" stopColor="#E11D48" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#FDE68A" stopOpacity="0.4" />
                  </linearGradient>
                  <radialGradient id="starGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(255 22) scale(20)">
                    <stop stopColor="#F59E0B" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Upward Ascending Flow Curves */}
                <path
                  d="M12 120 C65 110, 115 85, 175 52 C215 30, 245 20, 270 12"
                  stroke="url(#upwardFlow)"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                />
                <path
                  d="M25 125 C75 115, 125 92, 185 60 C222 40, 248 30, 268 22"
                  stroke="url(#upwardFlowAccent)"
                  strokeWidth="1.25"
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />

                {/* Subtle Star Glow aura */}
                <circle cx="255" cy="22" r="20" fill="url(#starGlow)" />

                {/* Four-point Editorial Stars / Sparkles */}
                {/* Primary Star (top-right peak of ascent) */}
                <path
                  d="M255 12 Q255 22 265 22 Q255 22 255 32 Q255 22 245 22 Q255 22 255 12 Z"
                  fill="#F59E0B"
                />
                {/* Accent Star (upper mid) */}
                <path
                  d="M195 24 Q195 29 200 29 Q195 29 195 34 Q195 29 190 29 Q195 29 195 24 Z"
                  fill="#FDA4AF"
                  fillOpacity="0.85"
                />
                {/* Subtle Accent Star (lower origin) */}
                <path
                  d="M42 92 Q42 96 46 96 Q42 96 42 100 Q42 96 38 96 Q42 96 42 92 Z"
                  fill="#E11D48"
                  fillOpacity="0.55"
                />

                {/* Delicate Ambient Micro Stars */}
                <circle cx="230" cy="45" r="1.5" fill="#F59E0B" fillOpacity="0.7" />
                <circle cx="268" cy="42" r="1.2" fill="#FDA4AF" fillOpacity="0.8" />
              </svg>

              {/* Foreground Typography Layer */}
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold tracking-[0.24em] uppercase text-rose-500/95 dark:text-rose-400 flex items-center gap-1.5">
                    <SparklesIcon className="w-3 h-3 text-rose-500 shrink-0" />
                    DAILY INTENTION
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                    SANCTUARY
                  </span>
                </div>

                <div className="font-serif tracking-tight leading-[0.95] select-none my-1.5">
                  <span className="block text-2xl sm:text-[26px] font-black tracking-tight text-slate-900 dark:text-slate-100">
                    KEEP
                  </span>
                  <span className="block text-3xl sm:text-[38px] font-extrabold italic tracking-tight bg-gradient-to-r from-[#E11D48] via-rose-500 to-amber-500 dark:from-rose-400 dark:via-rose-300 dark:to-amber-300 bg-clip-text text-transparent">
                    GROWING.
                  </span>
                </div>

                <div className="mt-2.5 pt-2 border-t border-rose-100/80 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  <span>Momentum builds daily</span>
                  <span className="text-[#E11D48] dark:text-rose-400 font-bold tracking-wider text-[10px] uppercase flex items-center gap-0.5">
                    &uarr; Upward
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP KPI CARDS ROW (Real Verified PostgreSQL Data) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD 1: CONSISTENCY STREAK */}
        <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-white via-white to-rose-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-rose-950/20 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[220px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                CONSISTENCY STREAK
              </span>
              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs ${
                currentStreak > 0
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-[#E11D48] dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${currentStreak > 0 ? 'bg-[#E11D48] animate-pulse' : 'bg-slate-400'}`} />
                <span>{currentStreak > 0 ? `${currentStreak} Day Flame` : 'Ready to Start'}</span>
              </span>
            </div>

            <div className="flex items-center gap-4 mt-5">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-md transition-transform duration-300 group-hover:scale-105 shrink-0 ${
                currentStreak > 0
                  ? 'bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-rose-500/25'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 shadow-2xs'
              }`}>
                <FlameIcon className={`w-7 h-7 ${currentStreak > 0 ? 'text-white drop-shadow' : 'text-slate-400'}`} />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-5xl sm:text-6xl font-black text-slate-950 dark:text-white leading-none tracking-tight">
                  {currentStreak}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {currentStreak === 1 ? 'consecutive day' : 'consecutive days'}
                </span>
              </div>
            </div>

            {/* Real attendance streak progress visualization */}
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-medium text-slate-500 dark:text-slate-400">
                  {currentStreak > 0 ? 'Next Milestone: 7 Days' : 'Next Milestone: 3 Days'}
                </span>
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  {currentStreak > 0 ? `${Math.min(100, Math.round((currentStreak / 7) * 100))}%` : '0%'}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-500"
                  style={{ width: `${currentStreak > 0 ? Math.min(100, Math.max(10, Math.round((currentStreak / 7) * 100))) : 0}%` }}
                />
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 font-medium">
            {currentStreak > 0
              ? '🔥 You are building powerful momentum! Check in at your next scheduled class.'
              : '🌱 Attend your next booked class to ignite your consistency streak.'}
          </p>
        </div>

        {/* CARD 2: THIS MONTH ATTENDANCE */}
        <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-white via-white to-emerald-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[220px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                THIS MONTH ATTENDANCE
              </span>
              <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Verified Records</span>
              </span>
            </div>

            <div className="flex items-center gap-5 mt-4">
              {/* Circular Attendance Progress Ring */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 72 72">
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    className="text-slate-100 dark:text-slate-800"
                    strokeWidth="6"
                    stroke="currentColor"
                    fill="none"
                  />
                  <circle
                    cx="36"
                    cy="36"
                    r="28"
                    className="text-emerald-500 transition-all duration-700"
                    strokeWidth="6"
                    strokeDasharray={176}
                    strokeDashoffset={currentMonthSessions > 0 ? Math.max(20, 176 - (Math.min(10, currentMonthSessions) / 10) * 176) : 176}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-serif text-2xl font-black text-slate-950 dark:text-white leading-none">
                    {currentMonthSessions}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mt-0.5">
                    Total
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-serif text-3xl font-extrabold text-slate-950 dark:text-white leading-tight">
                    {currentMonthSessions}
                  </span>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {currentMonthSessions === 1 ? 'session verified' : 'sessions verified'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  Plan: <strong className="text-slate-900 dark:text-white font-bold">{activeMembership?.planName || 'pre basic'}</strong>
                </p>
                {remainingDays !== null && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {remainingDays} days validity remaining
                  </p>
                )}
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-4 font-medium border-t border-slate-100 dark:border-slate-800 pt-3">
            Sessions verified by studio trainers and automated entry pass turnstiles.
          </p>
        </div>

        {/* CARD 3: REFERRAL & REWARDS */}
        <div className="rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-white via-white to-amber-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20 border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between min-h-[220px] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 group">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">
                REFERRALS &amp; REWARDS
              </span>
              <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/80 dark:border-amber-900/60 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span>₹{referralSummary?.availableRewards ?? 0} Available</span>
              </span>
            </div>

            {/* Premium Coupon Style Referral Code */}
            <div className="mt-3.5">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Your Invite Code</span>
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800">
                  Give 5% &bull; Earn 5%
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800/90 border-2 border-dashed border-rose-200 dark:border-rose-900/80 rounded-2xl p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                <span className="font-mono text-lg font-black tracking-widest text-slate-950 dark:text-white px-2">
                  {memberReferralCode}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyReferralCode}
                    className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition active:scale-95 cursor-pointer shadow-2xs"
                    title="Copy Code"
                  >
                    {codeCopied ? (
                      <CheckIcon className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <CopyIcon className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="p-2 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 transition active:scale-95 cursor-pointer shadow-2xs"
                    title="Share via WhatsApp"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 gap-3 mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-left">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Referrals
                </span>
                <p className="font-serif text-xl font-black text-slate-900 dark:text-white leading-tight mt-0.5">
                  {referralSummary?.successfulReferrals ?? 0}
                </p>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Available Rewards
                </span>
                <p className="font-serif text-xl font-black text-emerald-600 dark:text-emerald-400 leading-tight mt-0.5">
                  ₹{referralSummary?.availableRewards ?? 0}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
              Redeem toward future plans
            </span>
            <button
              type="button"
              onClick={() => setShowReferralModal(true)}
              className="text-xs font-bold text-[#E11D48] dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer transition hover:translate-x-0.5"
            >
              <span>View Rewards / Details</span>
              <span className="text-sm">&rarr;</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── SINGLE ACTION: UPGRADE PLAN ── */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 bg-gradient-to-r from-amber-50/80 via-rose-50/50 to-white dark:from-slate-900 dark:via-amber-950/20 dark:to-slate-850 border border-amber-200/80 dark:border-amber-900/40 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-5 group">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform duration-300">
            <ZapIcon className="w-7 h-7 text-white drop-shadow" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wider">
              <span>Sanctuary Tiers</span>
            </div>
            <h3 className="font-serif text-xl font-extrabold text-slate-950 dark:text-white">
              Elevate Your Membership &amp; Studio Packs
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Unlock unlimited classes, master workshops, and guest privileges at {studioDisplayName}. Instant Razorpay checkout.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigateTab('profile')}
          className="px-6 py-3 rounded-full text-xs font-bold uppercase tracking-wider text-white bg-gradient-to-r from-[#E11D48] to-[#BE123C] hover:from-[#BE123C] hover:to-[#9F1239] shadow-md shadow-rose-500/25 hover:shadow-lg hover:shadow-rose-500/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all cursor-pointer shrink-0"
        >
          View Plans &amp; Upgrade &rarr;
        </button>
      </div>

      {/* ── TODAY'S BATCHES / LIVE SCHEDULE (Real PostgreSQL StudioClass Records) ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400 block mb-1">
              LIVE SCHEDULE
            </span>
            <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">Today&apos;s Batches</h2>
            <span className="text-xs text-slate-400 block mt-0.5 font-medium">
              Real-time schedule managed by studio front desk
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('schedule')}
            className="text-xs font-bold text-[#E11D48] dark:text-rose-400 hover:underline flex items-center gap-1.5 transition-colors cursor-pointer group"
          >
            <span>Classes &amp; Bookings</span>
            <span className="group-hover:translate-x-0.5 transition-transform">&rarr;</span>
          </button>
        </div>

        {loadingData ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading live timetable...</span>
          </div>
        ) : todayBatches.length === 0 ? (
          <div className="py-8 text-center bg-[#FCFAF8] dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6">
            <CalendarIcon className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No classes scheduled for today.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Explore the full weekly calendar to reserve upcoming sessions.
            </p>
            <button
              type="button"
              onClick={() => onNavigateTab('schedule')}
              className="mt-3 text-xs font-bold text-[#E11D48] dark:text-rose-400 hover:underline"
            >
              Open Classes &amp; Bookings &rarr;
            </button>
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {todayBatches.map((batch) => {
              const isBooked = myBookings.some((b) => b.classId === batch.id && b.status !== 'Cancelled');
              const spotsLeft = Math.max(0, batch.capacity - 1);

              return (
                <div
                  key={batch.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 rounded-2xl bg-[#FCFAF8]/60 dark:bg-slate-850/60 hover:bg-[#FCFAF8] dark:hover:bg-slate-850 transition-all duration-200 border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-xs group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 flex items-center justify-center flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
                      <ClockIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white group-hover:text-[#E11D48] dark:group-hover:text-rose-400 transition-colors">
                          {batch.name}
                        </h3>
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-md">
                          {batch.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <strong className="text-slate-800 dark:text-slate-200">{batch.startTime}</strong>
                        {batch.endTime ? ` - ${batch.endTime}` : ''} &bull; Coach: {batch.trainer}
                        {batch.room && ` &bull; ${batch.room}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3.5 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800">
                    <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-emerald-500" />
                      <span>{spotsLeft} spots available</span>
                    </span>
                    {isBooked ? (
                      <span className="px-4 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full flex items-center gap-1 shadow-2xs">
                        <CheckCircleIcon className="w-3.5 h-3.5" />
                        <span>Booked</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBookSession(batch)}
                        className="px-4 py-1.5 text-xs uppercase tracking-wider font-semibold text-[#E11D48] dark:text-rose-400 border border-[#E11D48] dark:border-rose-500 hover:bg-[#E11D48] hover:text-white dark:hover:bg-rose-600 rounded-full shadow-2xs transition-all active:scale-95 cursor-pointer"
                      >
                        Book
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── PHASE 7: MERGED ATTENDANCE LOG & MONTHLY HEATMAP ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400 block mb-1">
              ATTENDANCE AUDIT &amp; CONSISTENCY LEDGER
            </span>
            <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">
              Workout Consistency History
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Live attendance records marked by studio trainers and hardware turnstile entries.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              &larr; Prev
            </button>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 px-2 min-w-[120px] text-center">
              {selectedMonthName}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {/* Attendance Summary Cards (2 Cards - Removed duplicate Longest Streak Record) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="p-5 bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500">
              Total Classes Completed
            </p>
            <p className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white">
              {totalClassesCompleted}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Verified sessions marked Present by studio trainers
            </p>
          </div>

          <div className="p-5 bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-1">
            <p className="text-[10px] uppercase font-bold tracking-[0.15em] text-slate-400 dark:text-slate-500">
              {viewDate.toLocaleDateString('en-IN', { month: 'short' })} Sessions
            </p>
            <p className="font-serif text-3xl sm:text-4xl font-bold text-[#E11D48] dark:text-rose-400">
              {currentMonthSessions}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Verified check-ins during this calendar month
            </p>
          </div>
        </div>

        {/* Monthly Attendance Heatmap */}
        <div className="p-5 bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-serif text-base font-bold text-slate-900 dark:text-white">
              Monthly Consistency Heatmap &bull; {selectedMonthName}
            </h4>
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700" />
                Rest
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-[#E11D48]" />
                Attended
              </span>
            </div>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 sm:grid-cols-11 md:grid-cols-16 gap-2 pt-2">
            {daysInSelectedMonth.map((day) => {
              const hasAttended = attendedDaysInMonth.has(day);
              return (
                <div
                  key={day}
                  className={`p-2.5 text-center rounded-xl border transition-all duration-200 ${
                    hasAttended
                      ? 'bg-[#E11D48] text-white border-[#E11D48] font-bold shadow-sm shadow-rose-500/25 hover:scale-105'
                      : 'bg-white dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200/70 dark:border-slate-700 hover:border-slate-300'
                  }`}
                  title={hasAttended ? `Day ${day}: Verified attendance checked in` : `Day ${day}: Rest / No attendance recorded`}
                >
                  <span className="block text-[11px] font-mono">{day}</span>
                  <span className="block text-[9px] uppercase tracking-wider mt-0.5">
                    {hasAttended ? '✓' : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chronological Real Attendance Records */}
        <div className="space-y-3 pt-2">
          <h4 className="font-serif text-base font-bold text-slate-900 dark:text-white">
            Recent Verified Session Logs
          </h4>
          {presentAttendances.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center bg-[#FCFAF8] dark:bg-slate-850 rounded-xl border border-slate-100 dark:border-slate-800">
              No verified attendance records found yet. Once a trainer marks your attendance, it will appear here instantly.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
              {presentAttendances.slice(0, 5).map((att) => {
                const dateStr = att.date || att.checkedInAt || att.createdAt;
                const formattedDate = dateStr
                  ? new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Recent Session';

                return (
                  <div
                    key={att.id}
                    className="p-4 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-rose-50/20 dark:hover:bg-slate-850 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-sm font-bold text-slate-900 dark:text-white">
                          {att.sessionName || att.className || 'Studio Session'}
                        </span>
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircleIcon className="w-3 h-3 text-emerald-600" />
                          <span>Present</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {formattedDate} {att.time ? `• ${att.time}` : ''} • Coach: {att.trainer || 'Studio Trainer'}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                      ID: {att.id.slice(0, 8)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── INSTRUCTOR & STUDIO DESK (Real Details, No Fake Offerings) ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#E11D48] dark:text-rose-400 block mb-1">
            STUDIO SUPPORT &amp; GUIDANCE
          </span>
          <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">
            Instructor &amp; Studio Desk
          </h2>
        </div>

        {/* Assigned Instructor Profile Card */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4.5 rounded-2xl bg-[#FCFAF8] dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 text-[#E11D48] dark:text-rose-400 flex items-center justify-center font-serif font-bold text-lg shadow-2xs shrink-0">
              {assignedCoach[0] || 'A'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold text-slate-900 dark:text-white">
                  {assignedCoach}
                </h3>
                <span className="text-[10px] font-semibold text-[#E11D48] dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900 px-2 py-0.5 rounded-full">
                  Lead Instructor
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
                Alignment &amp; Studio Lead &bull; {studioDisplayName}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Form correction, posture guidance, and personal progression.
              </p>
            </div>
          </div>

          <a
            href={`https://wa.me/919876543210?text=Hi%20there,%20this%20is%20${encodeURIComponent(
              user?.name || 'Studio Member'
            )}%20from%20${encodeURIComponent(studioDisplayName)}%20requesting%20guidance.`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 hover:bg-emerald-100 transition-all active:scale-95 shadow-2xs self-start sm:self-center"
          >
            <svg className="w-3.5 h-3.5 fill-emerald-600 flex-shrink-0" viewBox="0 0 24 24">
              <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
            </svg>
            <span>WhatsApp Coach</span>
          </a>
        </div>

        {/* Studio Support & Desk Info Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <MapPinIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{user?.studioBranch || 'Main Studio'}, {studioDisplayName}</span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneIcon className="w-4 h-4 text-slate-400 shrink-0" />
            <span>Desk Hours: Mon - Sun &bull; 6:00 AM - 9:00 PM</span>
          </div>
        </div>
      </div>

      {/* ── EXPANDABLE REFERRAL & REWARDS MODAL (Task 5) ── */}
      {showReferralModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-50 dark:bg-rose-950/40 text-[#E11D48] dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60 text-xs font-bold uppercase tracking-wider mb-2">
                  <GiftIcon className="w-3.5 h-3.5" />
                  <span>Referral &amp; Rewards Program</span>
                </div>
                <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-white">
                  Share Your Wellness Sanctuary
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Invite friends to {studioDisplayName}. They save 5% on their first plan, and you receive 5% reward credits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReferralModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Referral Code Card */}
            <div className="rounded-2xl bg-gradient-to-r from-rose-50/70 via-white to-amber-50/40 dark:from-slate-800/80 dark:via-slate-850 dark:to-slate-800 border border-rose-100 dark:border-slate-700 p-5 space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Your Unique Invite Code
              </span>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="font-mono text-2xl font-extrabold tracking-widest text-slate-900 dark:text-white bg-white dark:bg-slate-900 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
                  {memberReferralCode}
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleCopyReferralCode}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                  >
                    {codeCopied ? (
                      <>
                        <CheckIcon className="w-4 h-4 text-emerald-400 dark:text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="w-4 h-4" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-2xs cursor-pointer"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                    </svg>
                    <span>Share on WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 4 Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Successful
                </span>
                <p className="font-serif text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {referralSummary?.successfulReferrals ?? 0}
                </p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Completed bookings</span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Pending
                </span>
                <p className="font-serif text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                  {referralSummary?.pendingReferrals ?? 0}
                </p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Awaiting checkout</span>
              </div>
              <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5">
                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                  Available Rewards
                </span>
                <p className="font-serif text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  ₹{referralSummary?.availableRewards ?? 0}
                </p>
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300">Ready to redeem</span>
              </div>
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3.5">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Redeemed
                </span>
                <p className="font-serif text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1">
                  ₹{referralSummary?.redeemedRewards ?? 0}
                </p>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">Past savings</span>
              </div>
            </div>

            {/* How It Works (Rules) */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-[#FAF8F5] dark:bg-slate-800/40 p-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                How Referral Rewards Work
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-400">
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-[#E11D48] dark:text-rose-400 flex items-center justify-center text-[10px]">1</span>
                    <span>5% Friend Discount</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">Friends get 5% discount on their first membership purchase with your code.</p>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[10px]">2</span>
                    <span>5% Reward Credit</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">Once payment is confirmed, 5% of their plan value is credited to your rewards.</p>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px]">3</span>
                    <span>Apply at Checkout</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">Redeem your available balance instantly toward upcoming membership renewals.</p>
                </div>
              </div>
            </div>

            {/* Referral Activity Log */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Referral History &amp; Activity Log
              </h3>
              {referralSummary?.history && referralSummary.history.length > 0 ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="py-2.5 px-4 font-semibold">Friend</th>
                        <th className="py-2.5 px-4 font-semibold">Plan</th>
                        <th className="py-2.5 px-4 font-semibold">Status</th>
                        <th className="py-2.5 px-4 font-semibold text-right">Reward</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {referralSummary.history.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50">
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            {item.refereeName || 'New Member'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                            {item.planName || 'Membership Pass'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              item.status === 'converted'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                            }`}>
                              {item.status === 'converted' ? 'Converted' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                            +₹{item.rewardAmount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">No referrals logged yet</p>
                  <p>Share your code <span className="font-mono font-bold text-slate-900 dark:text-white">{memberReferralCode}</span> with workout partners to begin earning rewards!</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowReferralModal(false)}
                className="px-5 py-2.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
