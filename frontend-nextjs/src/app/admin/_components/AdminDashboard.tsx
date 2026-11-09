'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIcon, AlertCircleIcon, AlertTriangleIcon, ArrowRightIcon, CalendarIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon, CreditCardIcon, SparklesIcon, TrendingUpIcon, UserPlusIcon, UsersIcon } from '@/components/ui/icons';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { getStudioSession, STUDIO_SESSION_EVENT, studioRoleLabel, type StudioSession } from '@/lib/auth/studio-session';
import { isPersonalStaffName } from '@/lib/auth/staff-display';
import { formatIndianMobile, formatInr, formatIstDateTime, isValidIndianMobile } from '@/lib/localization/india';
import { ApiClient } from '@/lib/api-client';
import { currentStaffStudio, staffAssistantName, staffAssistantPromptMarker, staffAssistantPrompts, useAdminWorkspaceData, generateAdminAuraResponse, type LocalAuraAnswer, type StaffClassAttendance, type StaffClassBooking, type StaffMember, type StaffPayment, type StaffStudioClass } from './AdminDataProvider';
import { StatusBadge } from './AdminWorkspacePages';
import { listTeamInvitations } from '@/lib/auth/team-invitations';
import { FloatingAIChat } from '@/components/chat/FloatingAIChat';
import { useAIChat } from '@/features/ai/hooks/useAIChat';

type Range = '7D' | '30D' | '90D' | '12M';
type ActivityCategory = 'Payments' | 'Attendance' | 'Bookings' | 'Memberships';
type ActivityRecord = { id: string; at: Date; dateOnly?: boolean; category: ActivityCategory; status: string; title: string; detail: string; initials: string; tone: string; metadata: string[] };

const planColors = ['bg-slate-400', 'bg-rose-600', 'bg-violet-500', 'bg-amber-500', 'bg-sky-500', 'bg-emerald-500'];
const rangeDays: Record<Range, number> = { '7D': 7, '30D': 30, '90D': 90, '12M': 365 };
const recordDate = (value: string) => {
  if (!value || value === 'Not set' || value === '—') return new Date(NaN);
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
};
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatDate = (value: Date | string, weekday = false) => {
  if (!value || value === 'Not set' || value === '—') return String(value || '—');
  const d = typeof value === 'string' ? recordDate(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : '—';
  }
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...(weekday ? { weekday: 'long' as const } : {}), day: 'numeric', month: 'long', year: 'numeric' }).format(d);
};
const formatTime = (value: Date | string) => {
  if (!value || value === '—') return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return typeof value === 'string' ? value : '—';
  }
  return formatIstDateTime(d).split(', ').slice(-1)[0];
};
const formatDateTime = (value: Date | string, weekday = false) => {
  const d = typeof value === 'string' ? recordDate(value) : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return typeof value === 'string' ? value : '—';
  return `${formatDate(d, weekday)} · ${formatTime(d)}`;
};
const formatClock = (value: string) => { const [hourText, minutes] = value.split(':'); const hour = Number(hourText); return { time: `${hour % 12 || 12}:${minutes}`, period: hour >= 12 ? 'PM' : 'AM' }; };
const localDateTimeInput = (value: string) => { const date = new Date(value); return `${localDateKey(date)}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };
const linePoints = (values: number[], max: number, bucketCount: number) => values.map((value, index) => `${48 + (bucketCount > 1 ? index * 632 / (bucketCount - 1) : 0)},${190 - (max ? value / max : 0) * 150}`).join(' ');
const compactCurrency = formatInr;
const dateBucket = (value: string, windowStart: Date, windowEndMs: number, range: Range, bucketCount: number) => {
  const timestamp = recordDate(value).getTime();
  if (!Number.isFinite(timestamp) || timestamp < windowStart.getTime() || timestamp > windowEndMs) return -1;
  if (range === '12M') {
    const date = recordDate(value);
    return Math.min(bucketCount - 1, Math.max(0, (date.getFullYear() - windowStart.getFullYear()) * 12 + date.getMonth() - windowStart.getMonth()));
  }
  const calendarDays = Math.floor((timestamp - windowStart.getTime()) / 86400000);
  return Math.min(bucketCount - 1, Math.floor(calendarDays / rangeDays[range] * bucketCount));
};

function SectionHeading({ title, detail, href, action, onAction }: { title: string; detail?: string; href?: string; action?: string; onAction?: () => void }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{title}</h2>{detail && <p className="mt-1.5 text-[10px] font-semibold uppercase leading-5 tracking-[0.14em] text-slate-500">{detail}</p>}</div>{href ? <Link href={href} className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">{action ?? 'View all'}<ArrowRightIcon size="xs" /></Link> : onAction && <button type="button" onClick={onAction} className="inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">{action ?? 'View details'}<ArrowRightIcon size="xs" /></button>}</div>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-2xl border border-slate-200/90 bg-white shadow-subtle ${className}`}>{children}</div>;
}

export function AdminDashboardPage() {
  const previewState = useAdminWorkspaceData();
  const { classes, setClasses, bookings, setBookings, members, setMembers, attendance, setAttendance, payments, setPayments, paymentsUnavailable, plans, feedback, setFeedback, events, setEvents, leads, setLeads, notifications, setNotifications } = previewState;
  const { addToast } = useToast();
  const [session, setSession] = useState<StudioSession | null>(null);
  useEffect(() => {
    const syncSession = () => setSession(getStudioSession());
    syncSession();
    window.addEventListener('storage', syncSession);
    window.addEventListener(STUDIO_SESSION_EVENT, syncSession);
    return () => {
      window.removeEventListener('storage', syncSession);
      window.removeEventListener(STUDIO_SESSION_EVENT, syncSession);
    };
  }, []);
  const activeRole = 'admin' as const;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const update = () => setNow(new Date()); update(); const timer = window.setInterval(update, 60_000); return () => window.clearInterval(timer); }, []);
  
  // AI Chat integration for Admin
  const { sendMessage, isLoading, error, sessionId } = useAIChat({
    variant: 'member',
    onMessageReceived: (response) => {
      console.log('Admin AI Response:', response);
    },
    onError: (err) => {
      console.error('Admin AI Chat Error:', err);
    },
  });

  const today = now ?? new Date();
  const todayKey = localDateKey(today);
  const todayLabel = formatDate(today, true);
  const dayLabel = todayLabel;
  const greeting = today.getHours() < 12 ? 'Good morning' : today.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const [range, setRange] = useState<Range>('30D');
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string>(todayKey);
  type PaymentGraphRange = '7D' | '30D' | '12M';
  const [paymentGraphRange, setPaymentGraphRange] = useState<PaymentGraphRange>('30D');
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState('');
  const [sessionForm, setSessionForm] = useState({ name: '', category: '', date: localDateKey(new Date()), startTime: '', endTime: '', trainer: '', room: '', capacity: '12' });
  const [sessionError, setSessionError] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const quickActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (quickActionsRef.current && !quickActionsRef.current.contains(event.target as Node)) {
        setQuickActionsOpen(false);
      }
    }
    if (quickActionsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [quickActionsOpen]);

  const [activePanel, setActivePanel] = useState<'schedule' | 'renewals' | 'leads' | 'trainers' | 'attendance' | 'events' | 'activity' | 'notifications' | null>(null);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityCategory, setActivityCategory] = useState<'All' | ActivityCategory>('All');
  const [activityStart, setActivityStart] = useState('');
  const [activityEnd, setActivityEnd] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [renewalDrafts, setRenewalDrafts] = useState<Record<string, string>>({});
  const [leadDrafts, setLeadDrafts] = useState<Record<string, { date: string; note: string }>>({});
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [eventDraft, setEventDraft] = useState<{ title: string; category: string; startAt: string; endAt: string; venue: string }>({ title: '', category: '', startAt: '', endAt: '', venue: currentStaffStudio.name });
  const [eventError, setEventError] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [attendanceDialogOpen, setAttendanceDialogOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [attendanceError, setAttendanceError] = useState('');
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberForm, setMemberForm] = useState({ name: '', email: '', phone: '', plan: '', coach: '' });
  const [memberPayment, setMemberPayment] = useState({ recordNow: false, amount: '', method: 'Cash' as 'Cash' | 'UPI' | 'Card' | 'Bank transfer', status: 'Paid' as 'Paid' | 'Pending', notes: '' });
  const [memberError, setMemberError] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [showAllRenewals, setShowAllRenewals] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingForm, setBookingForm] = useState({ memberId: '', classId: '', status: 'Confirmed' as StaffClassBooking['status'] });
  const [bookingError, setBookingError] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ memberId: '', type: 'Membership', date: localDateKey(new Date()), amount: '', method: 'UPI', status: 'Paid' as 'Paid' | 'Pending' });
  const [paymentError, setPaymentError] = useState('');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantTurns, setAssistantTurns] = useState<{ id: number; prompt: string; answer: LocalAuraAnswer }[]>([]);
  const trainers = Array.from(new Set([...classes.map((item) => item.trainer), ...members.map((item) => item.coach).filter((item) => item && item !== 'Unassigned')])).sort();
  const sessionCategories = Array.from(new Set(classes.map((item) => item.category).filter(Boolean))).sort();
  const sessions = useMemo(() => classes.map((item) => {
    const { time, period } = formatClock(item.startTime);
    const scheduledDate = new Date(`${item.date}T12:00:00`);
    return {
      ...item,
      instructor: item.trainer,
      booked: bookings.filter((booking) => booking.classId === item.id && booking.status === 'Confirmed').length,
      time,
      period,
      displayDate: formatDate(scheduledDate),
      status: item.status === 'Cancelled' ? 'Cancelled' : item.sessionStatus === 'Completed' ? 'Completed' : item.sessionStatus === 'In Progress' ? 'In progress' : new Date(`${item.date}T${item.startTime}:00`).getTime() > today.getTime() ? new Date(`${item.date}T${item.startTime}:00`).getTime() - today.getTime() <= 30 * 60_000 ? 'Starts soon' : 'Upcoming' : new Date(`${item.date}T${item.endTime}:00`).getTime() > today.getTime() ? 'In progress' : 'Completed',
    };
  }).sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)), [classes, bookings, today]);
  const todaySessions = sessions.filter((session) => session.date === todayKey);
  const scheduleWindowEnd = new Date(today); scheduleWindowEnd.setDate(scheduleWindowEnd.getDate() + 7);
  const upcomingSessions = sessions.filter((session) => session.date >= todayKey && session.date <= localDateKey(scheduleWindowEnd) && session.status !== 'Cancelled').slice(0, 12);
  const attendanceBookings = bookings.filter((booking) => booking.status === 'Confirmed' && todaySessions.some((session) => session.id === booking.classId) && !attendance.some((record) => record.bookingId === booking.id));
  const presentToday = attendance.filter((record) => record.status === 'Present' && bookings.some((booking) => booking.id === record.bookingId && todaySessions.some((session) => session.id === booking.classId))).length;
  const confirmedToday = bookings.filter((booking) => booking.status === 'Confirmed' && todaySessions.some((session) => session.id === booking.classId)).length;
  const attendanceRate = confirmedToday ? Math.round(presentToday / confirmedToday * 100) : null;
  const activeMemberCount = members.filter((member) => member.status === 'Active').length;
  const recordedRevenue = payments.filter((payment) => ['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status)).reduce((sum, payment) => sum + Math.max(0, payment.amount - payment.refundedAmount), 0);
  const unsettledPayments = payments.filter((payment) => ['Pending', 'Review', 'Failed'].includes(payment.status));
  const unsettledTotal = unsettledPayments.reduce((sum, payment) => sum + Math.max(0, payment.amount - payment.refundedAmount), 0);
  const planNames = Array.from(new Set(members.map((member) => member.plan.trim() || 'No Plan / Drop-in only'))).sort();
  const rawPlanShares = planNames.map((name) => members.length ? members.filter((member) => (member.plan.trim() || 'No Plan / Drop-in only') === name).length / members.length * 100 : 0);
  const planShareRemainders = rawPlanShares.map((share, index) => ({ index, remainder: share - Math.floor(share) })).sort((a, b) => b.remainder - a.remainder);
  const remainingPlanPoints = members.length ? 100 - rawPlanShares.reduce((sum, share) => sum + Math.floor(share), 0) : 0;
  const membershipMix = planNames.map((name, index) => ({ name, members: members.filter((member) => (member.plan.trim() || 'No Plan / Drop-in only') === name).length, share: Math.floor(rawPlanShares[index]) + (planShareRemainders.findIndex((item) => item.index === index) < remainingPlanPoints ? 1 : 0), color: planColors[index % planColors.length] }));
  const referenceDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const expiringMembers = members.flatMap((member) => {
    const expiry = recordDate(member.expiry);
    const days = Math.ceil((expiry.getTime() - referenceDate.getTime()) / 86400000);
    return ['Active', 'Review'].includes(member.status) && Number.isFinite(expiry.getTime()) && days >= 0 && days <= 7
      ? [{ ...member, expiryDate: expiry, daysToExpiry: days }]
      : [];
  }).sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

  const [selectedRenewalMember, setSelectedRenewalMember] = useState<(typeof expiringMembers)[0] | null>(null);

  const renewalPlan = useMemo(() => {
    if (!selectedRenewalMember) return null;
    const cleanPlanName = (selectedRenewalMember.plan || '').trim().toLowerCase();
    return plans.find((p) => p.name.trim().toLowerCase() === cleanPlanName) || null;
  }, [selectedRenewalMember, plans]);

  const renewalMemberPayments = useMemo(() => {
    if (!selectedRenewalMember) return [];
    const memberEmail = (selectedRenewalMember.email || '').toLowerCase();
    const memberId = selectedRenewalMember.id.toLowerCase();
    return payments
      .filter((p) => p.memberId.toLowerCase() === memberId || (memberEmail && p.memberId.toLowerCase() === memberEmail))
      .sort((a, b) => recordDate(b.date).getTime() - recordDate(a.date).getTime());
  }, [selectedRenewalMember, payments]);

  const renewalLatestPayment = renewalMemberPayments[0] || null;
  const renewalAmountDue = renewalPlan?.price ?? (renewalLatestPayment?.amount ?? 4500);

  const classesScheduledThisWeek = useMemo(() => {
    const currentWeekStart = new Date(today);
    const dayOfWeek = currentWeekStart.getDay();
    const diffToMonday = (dayOfWeek + 6) % 7;
    currentWeekStart.setDate(currentWeekStart.getDate() - diffToMonday);
    currentWeekStart.setHours(0, 0, 0, 0);

    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
    currentWeekEnd.setHours(23, 59, 59, 999);

    return classes.filter((item) => {
      const d = recordDate(item.date);
      return Number.isFinite(d.getTime()) && d >= currentWeekStart && d <= currentWeekEnd && item.status !== 'Cancelled';
    });
  }, [classes, today]);

  const selectedDateClasses = useMemo(() => {
    return classes
      .filter((c) => c.date === selectedScheduleDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [classes, selectedScheduleDate]);

  const getClassMembers = (classId: string) => {
    const classBookings = bookings.filter((b) => b.classId === classId);
    return classBookings
      .map((b) => members.find((m) => m.id === b.memberId)?.name)
      .filter(Boolean) as string[];
  };

  const getSessionStatus = (cls: StaffStudioClass) => {
    if (cls.status === 'Cancelled') return { label: 'Cancelled', tone: 'rose' as const };
    const nowMs = today.getTime();
    const startMs = recordDate(`${cls.date}T${cls.startTime}:00`).getTime();
    const endMs = recordDate(`${cls.date}T${cls.endTime}:00`).getTime();
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      if (nowMs >= startMs && nowMs <= endMs) return { label: 'Ongoing', tone: 'amber' as const };
      if (nowMs > endMs) return { label: 'Completed', tone: 'slate' as const };
    }
    return { label: 'Scheduled', tone: 'blue' as const };
  };

  const paymentGraphData = useMemo(() => {
    const validPayments = payments.filter((p) =>
      ['Paid', 'Partially Refunded', 'Refunded'].includes(p.status)
    );

    if (paymentGraphRange === '7D') {
      const points = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateKey = localDateKey(d);
        const dayPayments = validPayments.filter((p) => p.date === dateKey);
        const amount = dayPayments.reduce((sum, p) => sum + Math.max(0, p.amount - p.refundedAmount), 0);
        points.push({
          dateKey,
          label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
          dateText: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }),
          amount,
          count: dayPayments.length,
        });
      }
      return points;
    } else if (paymentGraphRange === '30D') {
      const points = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateKey = localDateKey(d);
        const dayPayments = validPayments.filter((p) => p.date === dateKey);
        const amount = dayPayments.reduce((sum, p) => sum + Math.max(0, p.amount - p.refundedAmount), 0);
        points.push({
          dateKey,
          label: i % 5 === 0 || i === 0 ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '',
          dateText: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          amount,
          count: dayPayments.length,
        });
      }
      return points;
    } else {
      const points = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthPayments = validPayments.filter((p) => p.date.startsWith(yearMonth));
        const amount = monthPayments.reduce((sum, p) => sum + Math.max(0, p.amount - p.refundedAmount), 0);
        points.push({
          dateKey: yearMonth,
          label: d.toLocaleDateString('en-IN', { month: 'short' }),
          dateText: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          amount,
          count: monthPayments.length,
        });
      }
      return points;
    }
  }, [payments, paymentGraphRange, today]);

  const totalPeriodCollected = useMemo(() => {
    return paymentGraphData.reduce((sum, item) => sum + item.amount, 0);
  }, [paymentGraphData]);

  const totalPeriodTransactions = useMemo(() => {
    return paymentGraphData.reduce((sum, item) => sum + item.count, 0);
  }, [paymentGraphData]);

  const maxChartAmount = useMemo(() => {
    const max = Math.max(...paymentGraphData.map((d) => d.amount));
    return max > 0 ? max : 50000;
  }, [paymentGraphData]);

  const chartWidth = 670;
  const chartHeight = 150;
  const chartLeft = 65;
  const chartTop = 25;
  const chartBottom = 175;

  const chartPoints = useMemo(() => {
    return paymentGraphData.map((pt, i) => {
      const x = chartLeft + (paymentGraphData.length > 1 ? (i / (paymentGraphData.length - 1)) * chartWidth : chartWidth / 2);
      const y = chartBottom - (maxChartAmount > 0 ? (pt.amount / maxChartAmount) * chartHeight : 0);
      return { ...pt, x, y };
    });
  }, [paymentGraphData, maxChartAmount]);

  const linePath = useMemo(() => {
    return chartPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  }, [chartPoints]);

  const areaPath = useMemo(() => {
    return `${linePath} L ${(chartLeft + chartWidth).toFixed(1)},${chartBottom} L ${chartLeft},${chartBottom} Z`;
  }, [linePath]);
  const dueLeads = leads.filter((lead) => lead.stage !== 'Converted' && lead.followUpDate && lead.followUpDate <= todayKey).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const openLeads = leads.filter((lead) => lead.stage !== 'Converted' && lead.followUpDate).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
  const upcomingEvents = events.filter((event) => !event.cancelled && recordDate(event.startAt) >= new Date(today.getFullYear(), today.getMonth(), today.getDate())).sort((a, b) => recordDate(a.startAt).getTime() - recordDate(b.startAt).getTime()).slice(0, 3);
  const ratedFeedback = feedback.filter((item) => Number.isFinite(item.rating));
  const averageTrainerRating = ratedFeedback.length ? ratedFeedback.reduce((sum, item) => sum + item.rating, 0) / ratedFeedback.length : null;
  const scheduledTrainerCount = new Set(todaySessions.map((item) => item.instructor).filter(Boolean)).size;
  const [staffCount, setStaffCount] = useState<number>(0);
  useEffect(() => {
    let active = true;
    listTeamInvitations().then((rows) => { if (active) setStaffCount(rows.filter((row) => row.status === 'accepted').length); }).catch(() => { if (active) setStaffCount(0); });
    return () => { active = false; };
  }, []);
  const trainerMetrics = useMemo(() => {
    return trainers.map((name) => {
      const trainerFeedback = feedback.filter((item) => item.trainerName === name && Number.isFinite(item.rating));
      const average = trainerFeedback.length
        ? trainerFeedback.reduce((sum, item) => sum + item.rating, 0) / trainerFeedback.length
        : null;
      return {
        name,
        average,
        reviewCount: trainerFeedback.length,
      };
    }).sort((a, b) => {
      if (a.average !== null && b.average !== null) return b.average - a.average;
      if (a.average !== null) return -1;
      if (b.average !== null) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [trainers, feedback]);
  const rangeStart = new Date(referenceDate);
  if (range === '12M') { rangeStart.setDate(1); rangeStart.setMonth(rangeStart.getMonth() - 11); }
  else rangeStart.setDate(rangeStart.getDate() - rangeDays[range] + 1);
  rangeStart.setHours(0, 0, 0, 0);
  const windowEndMs = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime();
  const bucketCount = range === '7D' ? 7 : range === '12M' ? 12 : 6;
  const series = useMemo(() => {
    const revenue = Array(bucketCount).fill(0) as number[];
    const joins = Array(bucketCount).fill(0) as number[];
    const checkIns = Array(bucketCount).fill(0) as number[];
    for (const payment of payments) {
      const bucket = dateBucket(payment.date, rangeStart, windowEndMs, range, bucketCount);
      if (bucket >= 0 && ['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status)) revenue[bucket] += Math.max(0, payment.amount - payment.refundedAmount);
    }
    for (const member of members) {
      const bucket = dateBucket(member.joined, rangeStart, windowEndMs, range, bucketCount);
      if (bucket >= 0) joins[bucket] += 1;
    }
    for (const record of attendance) {
      const bucket = record.checkedInAt ? dateBucket(record.checkedInAt, rangeStart, windowEndMs, range, bucketCount) : -1;
      if (bucket >= 0 && record.status === 'Present') checkIns[bucket] += 1;
    }
    const labels = Array.from({ length: bucketCount }, (_, index) => {
      if (range === '12M') { const date = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + index, 1); return date.toLocaleDateString('en-IN', { month: 'short' }); }
      if (range === '7D') { const date = new Date(rangeStart); date.setDate(date.getDate() + index); return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }); }
      const dayOffset = Math.floor((index + 0.5) * rangeDays[range] / bucketCount);
      const date = new Date(rangeStart); date.setDate(date.getDate() + dayOffset);
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    });
    return { labels, revenue, joins, checkIns };
  }, [range, payments, members, attendance, rangeStart, windowEndMs, bucketCount]);
  const revenueAxisMax = Math.max(1000, ...series.revenue);
  const activityAxisMax = Math.max(1, ...series.joins, ...series.checkIns);
  const hasRevenueSource = payments.length > 0;
  const hasJoinSource = members.length > 0;
  const hasCheckInSource = attendance.some((item) => item.status === 'Present' && item.checkedInAt);
  const collectedInRange = series.revenue.reduce((sum, amount) => sum + amount, 0);
  const previousRangeEnd = new Date(rangeStart.getTime() - 1);
  const previousRangeStart = new Date(rangeStart);
  if (range === '12M') previousRangeStart.setFullYear(previousRangeStart.getFullYear() - 1);
  else previousRangeStart.setDate(previousRangeStart.getDate() - rangeDays[range]);
  const previousCollected = payments.filter((payment) => {
    const timestamp = recordDate(payment.date).getTime();
    return timestamp >= previousRangeStart.getTime() && timestamp <= previousRangeEnd.getTime() && ['Paid', 'Partially Refunded', 'Refunded'].includes(payment.status);
  }).reduce((sum, payment) => sum + Math.max(0, payment.amount - payment.refundedAmount), 0);
  const revenueChange = previousCollected > 0 ? ((collectedInRange - previousCollected) / previousCollected) * 100 : null;
  const membershipJoinsInRange = series.joins.reduce((sum, count) => sum + count, 0);
  const checkInsInRange = series.checkIns.reduce((sum, count) => sum + count, 0);
  const recordActivity: ActivityRecord[] = [
    ...members.map((member) => ({ id: `member:${member.id}`, at: recordDate(member.joined), dateOnly: true, category: 'Memberships' as const, status: member.status, title: 'Member joined', detail: `${member.name ?? 'Unnamed Member'} · ${member.plan || 'No plan recorded'}`, initials: (member.name ?? 'Unnamed Member').split(/\s+/).map((part) => part[0]).join('').slice(0, 2), tone: 'bg-rose-50 text-rose-700', metadata: [`Member: ${member.name ?? 'Unnamed Member'}`, `Membership plan: ${member.plan || 'Not recorded'}`, `Member status: ${member.status}`, `Joined: ${formatDate(member.joined)}`, `Renewal date: ${member.expiry && member.expiry !== 'Not set' ? formatDate(member.expiry) : 'Not set'}`] })),
    ...bookings.map((booking) => { const member = members.find((item) => item.id === booking.memberId); const session = classes.find((item) => item.id === booking.classId); return { id: `booking:${booking.id}`, at: recordDate(booking.bookedAt), category: 'Bookings' as const, status: booking.status, title: `${booking.status} booking`, detail: `${member?.name ?? 'Member record unavailable'} · ${session?.name ?? 'Class record unavailable'}`, initials: 'B', tone: 'bg-violet-50 text-violet-700', metadata: [`Member: ${member?.name ?? 'Member record unavailable'}`, `Class: ${session?.name ?? 'Class record unavailable'}`, `Booking status: ${booking.status}`, `Booked: ${formatDateTime(booking.bookedAt)}`, ...(session ? [`Session date: ${formatDate(session.date)}`, `Trainer: ${session.trainer}`] : [])] }; }),
    ...attendance.filter((record) => record.checkedInAt).map((record) => { const booking = bookings.find((item) => item.id === record.bookingId); const member = members.find((item) => item.id === booking?.memberId); const session = classes.find((item) => item.id === booking?.classId); return { id: `attendance:${record.id}`, at: recordDate(record.checkedInAt as string), category: 'Attendance' as const, status: record.status, title: 'Attendance recorded', detail: `${member?.name ?? 'Member record unavailable'} · ${session?.name ?? 'Class record unavailable'}`, initials: '✓', tone: 'bg-emerald-50 text-emerald-700', metadata: [`Member: ${member?.name ?? 'Member record unavailable'}`, `Class: ${session?.name ?? 'Class record unavailable'}`, `Attendance status: ${record.status}`, `Checked in: ${formatDateTime(record.checkedInAt as string)}`, ...(session ? [`Trainer: ${session.trainer}`, `Session time: ${session.startTime}–${session.endTime}`] : [])] }; }),
    ...payments.map((payment) => { const member = members.find((item) => item.id === payment.memberId); const net = Math.max(0, payment.amount - payment.refundedAmount); return { id: `payment:${payment.ref}`, at: recordDate(payment.date), dateOnly: true, category: 'Payments' as const, status: payment.status, title: `Payment · ${payment.status}`, detail: `${member?.name ?? 'Member record unavailable'} · ${formatInr(net)}`, initials: '₹', tone: 'bg-amber-50 text-amber-700', metadata: [`Member: ${member?.name ?? 'Member record unavailable'}`, `Payment type: ${payment.type}`, `Status: ${payment.status}`, `Method: ${payment.method}`, `Recorded amount: ${formatInr(payment.amount)}`, ...(payment.refundedAmount ? [`Refunded: ${formatInr(payment.refundedAmount)}`] : []), `Net amount: ${formatInr(net)}`, `Date: ${formatDate(payment.date)}`, ...(payment.notes ? [`Note: ${payment.notes}`] : [])] }; }),
  ].filter((item) => Number.isFinite(item.at.getTime())).sort((a, b) => b.at.getTime() - a.at.getTime());
  const displayedActivity = recordActivity.slice(0, 5);
  const filteredActivity = recordActivity.filter((item) => {
    const dateKey = localDateKey(item.at);
    const query = activitySearch.trim().toLocaleLowerCase();
    const matchesSearch = !query || [item.title, item.detail, item.category, item.status, ...item.metadata].join(' ').toLocaleLowerCase().includes(query);
    return (activityCategory === 'All' || item.category === activityCategory) && (!activityStart || dateKey >= activityStart) && (!activityEnd || dateKey <= activityEnd) && matchesSearch;
  });

  function openAddMember() {
    const defaultPlan = plans.find((plan) => plan.active);
    setMemberForm({ name: '', email: '', phone: '', plan: defaultPlan?.name ?? '', coach: trainers[0] ?? '' });
    setMemberPayment({
      recordNow: false,
      amount: defaultPlan?.price ? String(defaultPlan.price) : '2500',
      method: 'Cash',
      status: 'Paid',
      notes: '',
    });
    setMemberError('');
    setQuickActionsOpen(false);
    setMemberDialogOpen(true);
  }

  async function handleMemberSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = memberForm.name.trim();
    const email = memberForm.email.trim().toLowerCase();
    const phone = memberForm.phone.trim();
    const digits = phone.replace(/\D/g, '');
    if (!name || !email || !memberForm.plan) { setMemberError('Name, email, and membership plan are required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMemberError('Enter a valid email address.'); return; }
    if (phone && !isValidIndianMobile(phone)) { setMemberError('Enter a valid Indian mobile number or leave it blank.'); return; }
    if (members.some((member) => member.email.trim().toLowerCase() === email || (digits && member.phone.replace(/\D/g, '') === digits))) { setMemberError('A member already uses that email or phone number.'); return; }

    setIsSavingMember(true);
    setMemberError('');

    try {
      // 1. Create member via ApiClient (persists to PostgreSQL)
      const createdMember = await ApiClient.createMember({
        full_name: name,
        email,
        phone: phone ? formatIndianMobile(phone) : '+91 98765 43210',
        date_of_birth: '1995-01-01',
        gender: 'other',
        emergency_contact: phone ? `+91${phone.replace(/\D/g, '')}` : '+919876543210',
        join_date: new Date().toISOString().slice(0, 10),
        status: 'active',
      });
      const memberId = createdMember.id || email;

      // 2. If recordNow is enabled, record payment via ApiClient
      if (memberPayment.recordNow && Number(memberPayment.amount) > 0) {
        const payAmount = Number(memberPayment.amount);
        const ref = `MEM-${Date.now().toString(36).toUpperCase()}`;
        try {
          await ApiClient.createPayment({
            ref,
            date: new Date().toISOString(),
            amount: payAmount,
            currency: 'INR',
            method: memberPayment.method,
            status: memberPayment.status,
            type: 'Membership',
            memberId,
            notes: memberPayment.notes.trim() || `Payment for ${memberForm.plan} membership`,
          });
          const paymentRecord: StaffPayment = {
            ref,
            memberId,
            type: 'Membership',
            date: localDateKey(new Date()),
            amount: payAmount,
            currency: 'INR',
            method: memberPayment.method,
            status: memberPayment.status,
            refundedAmount: 0,
            notes: memberPayment.notes.trim() || `Payment for ${memberForm.plan} membership`,
            source: 'Live API',
          };
          setPayments((current) => [paymentRecord, ...current]);
        } catch {
          // If payment API errored, continue adding member and warn
          addToast({ type: 'error', title: 'Payment recording issue', message: 'Member was created, but payment recording failed.' });
        }
      }

      const joined = formatDate(new Date());
      const newMember: StaffMember = {
        id: memberId,
        name,
        email,
        phone: phone ? formatIndianMobile(phone) : 'Not provided',
        plan: memberForm.plan,
        status: 'Active',
        joined,
        expiry: 'Not set',
        visits: '0 this month',
        lastVisit: '—',
        coach: memberForm.coach || 'Unassigned',
      };
      setMembers((current) => [newMember, ...current]);
      addToast({ type: 'success', title: 'Member added', message: `${name} is now in the shared member roster.` });
      setMemberDialogOpen(false);
    } catch (err: any) {
      setMemberError(err.message || 'Could not save member. Please try again.');
    } finally {
      setIsSavingMember(false);
    }
  }

  function openCreateBooking() {
    setBookingForm({ memberId: members.find((member) => member.status === 'Active')?.id ?? '', classId: classes.find((item) => item.status === 'Scheduled')?.id ?? '', status: 'Confirmed' });
    setBookingError('');
    setQuickActionsOpen(false);
    setBookingDialogOpen(true);
  }

  function handleBookingSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const member = members.find((item) => item.id === bookingForm.memberId && item.status === 'Active');
    const session = classes.find((item) => item.id === bookingForm.classId && item.status === 'Scheduled');
    if (!member || !session) { setBookingError('Choose an active member and scheduled class.'); return; }
    if (bookings.some((item) => item.memberId === member.id && item.classId === session.id && ['Confirmed', 'Waitlisted'].includes(item.status))) { setBookingError('This member already has an active booking for that class.'); return; }
    const confirmed = bookings.filter((item) => item.classId === session.id && item.status === 'Confirmed').length;
    if (bookingForm.status === 'Confirmed' && confirmed >= session.capacity) { setBookingError('This class is full. Choose Waitlisted or another class.'); return; }
    const booking: StaffClassBooking = { id: globalThis.crypto.randomUUID(), memberId: member.id, classId: session.id, status: bookingForm.status, bookedAt: new Date().toISOString() };
    setBookings((current) => [booking, ...current]);
    addToast({ type: 'success', title: 'Booking created', message: `${member.name} was ${booking.status.toLowerCase()} for ${session.name}.` });
    setBookingDialogOpen(false);
  }

  function openRecordPayment() {
    setPaymentForm({ memberId: members[0]?.id ?? '', type: 'Membership', date: localDateKey(new Date()), amount: '', method: 'UPI', status: 'Paid' });
    setPaymentError('');
    setQuickActionsOpen(false);
    setPaymentDialogOpen(true);
  }

  function handlePaymentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(paymentForm.amount);
    const member = members.find((item) => item.id === paymentForm.memberId);
    if (!member || !paymentForm.type.trim() || !paymentForm.date || !paymentForm.method) { setPaymentError('Choose a member and complete every required payment field.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setPaymentError('Enter a payment amount greater than zero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentForm.date) || Number.isNaN(new Date(`${paymentForm.date}T12:00:00`).getTime())) { setPaymentError('Choose a valid payment date.'); return; }
    const ref = `MAN-${Date.now()}`;
    const payment: StaffPayment = { ref, memberId: member.id, type: paymentForm.type.trim(), date: paymentForm.date, amount, currency: 'INR', method: paymentForm.method, status: paymentForm.status, refundedAmount: 0, notes: 'Recorded from the dashboard.', source: 'Pending save' };
    setPayments((current) => [payment, ...current]);
    addToast({ type: 'success', title: 'Payment recorded', message: `${ref} was added to the shared payment records.` });
    setPaymentDialogOpen(false);
  }

  function openAttendance(classId?: string) {
    setSelectedBookingId(attendanceBookings.find((booking) => !classId || booking.classId === classId)?.id ?? '');
    setAttendanceError('');
    setAttendanceDialogOpen(true);
  }

  function handleAttendanceSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const booking = bookings.find((item) => item.id === selectedBookingId && item.status === 'Confirmed');
    if (!booking) { setAttendanceError('Choose a confirmed booking to check in.'); return; }
    if (attendance.some((record) => record.bookingId === booking.id)) { setAttendanceError('Attendance has already been recorded for this booking.'); return; }
    const record: StaffClassAttendance = { id: globalThis.crypto.randomUUID(), bookingId: booking.id, status: 'Present', checkedInAt: new Date().toISOString() };
    setAttendance((current) => [...current, record]);
    const member = members.find((item) => item.id === booking.memberId);
    const session = todaySessions.find((item) => item.id === booking.classId);
    addToast({ type: 'success', title: 'Check-in recorded', message: `${member?.name ?? 'Member'} was marked present.` });
    setAttendanceDialogOpen(false);
  }

  function openAddSession() {
    setSessionForm({ name: '', category: sessionCategories[0] ?? '', date: localDateKey(new Date()), startTime: '', endTime: '', trainer: trainers[0] ?? '', room: '', capacity: '12' });
    setSessionError('');
    setScheduleNotice('');
    setQuickActionsOpen(false);
    setScheduleDialogOpen(true);
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSavingSession) return;
    const name = sessionForm.name.trim();
    const category = sessionForm.category.trim();
    const trainer = sessionForm.trainer.trim();
    const room = sessionForm.room.trim();
    const capacity = Number(sessionForm.capacity);
    if (!name || !category || !sessionForm.date || !sessionForm.startTime || !sessionForm.endTime || !trainer || !room) {
      setSessionError('Complete all required fields before adding the session.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionForm.date) || Number.isNaN(new Date(`${sessionForm.date}T12:00:00`).getTime())) {
      setSessionError('Choose a valid session date.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionForm.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(sessionForm.endTime) || sessionForm.endTime <= sessionForm.startTime) {
      setSessionError('Enter valid times and make the end time later than the start time.');
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 1) {
      setSessionError('Capacity must be a whole number greater than zero.');
      return;
    }
    const duplicate = classes.some((item) => item.name.trim().toLowerCase() === name.toLowerCase() && item.date === sessionForm.date && item.startTime === sessionForm.startTime);
    if (duplicate) {
      setSessionError('A session with this title is already scheduled at that date and time.');
      return;
    }
    const overlaps = classes.filter((item) => item.date === sessionForm.date && item.status === 'Scheduled' && item.startTime < sessionForm.endTime && item.endTime > sessionForm.startTime);
    const trainerConflict = overlaps.find((item) => item.trainer.trim().toLowerCase() === trainer.toLowerCase());
    if (trainerConflict) {
      setSessionError(`${trainer} already has “${trainerConflict.name}” scheduled during that time.`);
      return;
    }
    const roomConflict = overlaps.find((item) => item.room.trim().toLowerCase() === room.toLowerCase());
    if (roomConflict) {
      setSessionError(`${room} is already reserved for “${roomConflict.name}” during that time.`);
      return;
    }
    setIsSavingSession(true);
    setSessionError('');
    try {
      const [startH, startM] = sessionForm.startTime.split(':').map(Number);
      const [endH, endM] = sessionForm.endTime.split(':').map(Number);
      const durationMins = Math.max(15, (endH * 60 + endM) - (startH * 60 + startM));

      const payload = {
        name,
        trainer_id: trainer,
        trainer,
        category,
        duration_mins: durationMins,
        capacity,
        location: room,
        room,
        date: sessionForm.date,
        startTime: sessionForm.startTime,
        endTime: sessionForm.endTime,
      };

      let sessionId = globalThis.crypto.randomUUID();
      try {
        const created = await ApiClient.createClass(payload);
        if (created && created.id) {
          sessionId = created.id;
        }
      } catch (err: any) {
        console.warn('Backend class persistence notice:', err);
      }

      const nextSession: StaffStudioClass = {
        id: sessionId,
        name,
        category,
        date: sessionForm.date,
        startTime: sessionForm.startTime,
        endTime: sessionForm.endTime,
        trainer,
        room,
        capacity,
        status: 'Scheduled',
      };

      setClasses((current) => {
        if (current.some((item) => item.id === sessionId || (item.name.trim().toLowerCase() === name.toLowerCase() && item.date === sessionForm.date && item.startTime === sessionForm.startTime))) {
          return current;
        }
        return [...current, nextSession];
      });

      setScheduleNotice(`${nextSession.name} was added to the shared schedule.`);
      addToast({ type: 'success', title: 'Session added', message: `${nextSession.name} has been added to the schedule.` });
      setScheduleDialogOpen(false);
      setSessionError('');
    } catch (err: any) {
      setSessionError(err.message || 'Could not save session. Please try again.');
    } finally {
      setIsSavingSession(false);
    }
  }

  function saveRenewalNote(memberId: string) {
    const note = (renewalDrafts[memberId] ?? members.find((item) => item.id === memberId)?.renewalFollowUp ?? '').trim();
    setMembers((current) => current.map((member) => member.id === memberId ? { ...member, renewalFollowUp: note } : member));
    addToast({ type: 'success', title: 'Renewal note saved', message: 'The note was saved with the member record in this browser.' });
  }

  function saveLeadFollowUp(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    const draft = leadDrafts[leadId] ?? { date: lead.followUpDate, note: '' };
    if (!draft.date) { addToast({ type: 'error', title: 'Follow-up date required', message: 'Choose a date or mark the follow-up complete.' }); return; }
    if (!draft.note.trim()) { addToast({ type: 'error', title: 'Add a follow-up note', message: 'A short note is required to save a scheduled follow-up.' }); return; }
    const history = [...(lead.followUpHistory ?? []), { date: todayKey, note: draft.note.trim() }];
    setLeads((current) => current.map((item) => item.id === leadId ? { ...item, followUpDate: draft.date, followUpHistory: history } : item));
    setLeadDrafts((current) => ({ ...current, [leadId]: { date: draft.date, note: '' } }));
    addToast({ type: 'success', title: 'Lead follow-up saved', message: `${lead.name} was updated in the shared lead list.` });
  }

  function completeLeadFollowUp(leadId: string) {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return;
    const draftNote = (leadDrafts[leadId]?.note ?? '').trim();
    if (!draftNote) { addToast({ type: 'error', title: 'Add an outcome note', message: 'Record what happened before marking the follow-up complete.' }); return; }
    setLeads((current) => current.map((item) => item.id === leadId ? { ...item, followUpDate: '', followUpHistory: [...(item.followUpHistory ?? []), { date: todayKey, note: draftNote }] } : item));
    addToast({ type: 'success', title: 'Follow-up completed', message: `${lead.name} no longer appears in the due follow-up list.` });
  }

  function saveTrainerNote(feedbackId: string) {
    const note = feedbackDrafts[feedbackId] ?? feedback.find((item) => item.id === feedbackId)?.followUpNote ?? '';
    setFeedback((current) => current.map((item) => item.id === feedbackId ? { ...item, followUpNote: note.trim() } : item));
    addToast({ type: 'success', title: 'Trainer follow-up saved', message: 'The note was saved with the feedback record in this browser.' });
  }

  function createDashboardEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = eventDraft.title.trim();
    const category = eventDraft.category.trim();
    if (!title || !category || !eventDraft.startAt || !eventDraft.endAt || !eventDraft.venue.trim()) { setEventError('Complete the title, category, venue, start, and end fields.'); return; }
    if (new Date(eventDraft.endAt).getTime() <= new Date(eventDraft.startAt).getTime()) { setEventError('The event end time must be after its start time.'); return; }
    const nextEvent = { id: editingEventId ?? globalThis.crypto.randomUUID(), title, category, description: events.find((event) => event.id === editingEventId)?.description ?? '', startAt: new Date(eventDraft.startAt).toISOString(), endAt: new Date(eventDraft.endAt).toISOString(), venue: eventDraft.venue.trim(), organizer: events.find((event) => event.id === editingEventId)?.organizer ?? '', capacity: events.find((event) => event.id === editingEventId)?.capacity ?? null, cancelled: false };
    setEvents((current) => editingEventId ? current.map((event) => event.id === editingEventId ? nextEvent : event) : [...current, nextEvent]);
    const wasEditing = Boolean(editingEventId);
    setEditingEventId(null);
    setEventDraft({ title: '', category: '', startAt: '', endAt: '', venue: currentStaffStudio.name });
    setEventError('');
    addToast({ type: 'success', title: wasEditing ? 'Event updated' : 'Event added', message: `${title} was saved to the shared event list.` });
  }

  const pendingFreezesCount = previewState.freezeRequests.filter((f) => f.status === 'Pending').length;

  function parse24To12(hhmm: string) {
    const [hStr, mStr] = (hhmm || '09:00').split(':');
    const h24 = Number(hStr);
    const minute = ['00', '15', '30', '45'].includes(mStr) ? mStr : '00';
    if (!Number.isFinite(h24)) return { hour: '09', minute: '00', period: 'AM' as const };
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 || 12;
    return { hour: String(h12).padStart(2, '0'), minute, period };
  }

  function to24Hour(hour12: string, minute: string, period: 'AM' | 'PM') {
    let h = Number(hour12) % 12;
    if (period === 'PM') h += 12;
    return `${String(h).padStart(2, '0')}:${minute}`;
  }

  const adminPersonalName = isPersonalStaffName(session?.name) ? session!.name.trim() : null;
  const adminGreetingName = adminPersonalName ?? 'Admin';
  const adminAvatarUrl = session?.avatarUrl?.trim() ?? '';
  const adminInitials = adminPersonalName
    ? adminPersonalName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0] ?? '')
        .join('')
        .toUpperCase()
    : 'AD';

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-7 font-sans sm:space-y-8">
      <header className="relative z-30 rounded-2xl border border-rose-200/70 bg-gradient-to-br from-white via-rose-50/40 to-slate-50 p-6 shadow-sm dark:border-studio-700 dark:from-studio-900 dark:via-studio-900/90 dark:to-studio-950">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-gradient-to-br from-rose-500/15 via-violet-500/10 to-transparent blur-3xl" />
        </div>
        <div className="relative flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative shrink-0">
              {adminAvatarUrl ? (
                <img
                  src={adminAvatarUrl}
                  alt={adminPersonalName ?? 'Studio Admin'}
                  className="h-16 w-16 rounded-2xl object-cover shadow-md ring-4 ring-white dark:ring-studio-800"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#E11D48] via-rose-600 to-violet-600 text-xl font-bold text-white shadow-md ring-4 ring-white dark:ring-studio-800">
                  {adminInitials}
                </div>
              )}
              <span
                title="Studio Admin Online & Synced"
                className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-studio-900"
              >
                ✓
              </span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E11D48] px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
                  <SparklesIcon size="xs" />
                  {studioRoleLabel(activeRole)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/70 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/60 dark:text-rose-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {currentStaffStudio.name} · {currentStaffStudio.city}
                </span>
              </div>

              <h1 className="mt-2.5 font-serif text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white">
                {`${greeting}, ${adminGreetingName} 👋`}
              </h1>

              <p className="mt-1 text-xs font-medium text-slate-600 sm:text-sm dark:text-slate-300">
                <span className="font-bold text-slate-900 dark:text-white">{todayLabel}</span>
                {' · '}
                <span>Executive studio control, member enrollments, staff attendance & financial reporting</span>
              </p>
            </div>
          </div>

          <div className="flex items-center self-start xl:shrink-0 xl:self-center">
            <div ref={quickActionsRef} className="relative">
              <button
                type="button"
                aria-expanded={quickActionsOpen}
                aria-haspopup="true"
                aria-controls="dashboard-quick-actions"
                onClick={() => setQuickActionsOpen((open) => !open)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-[#E11D48] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:from-rose-700 hover:to-rose-800 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 active:scale-95"
              >
                <SparklesIcon size="sm" className="text-white" />
                <span>Quick Actions</span>
                <ChevronDownIcon size="xs" className={`transition-transform duration-200 ${quickActionsOpen ? 'rotate-180' : ''}`} />
              </button>

              {quickActionsOpen && (
                <div
                  id="dashboard-quick-actions"
                  role="menu"
                  aria-label="Admin quick actions"
                  className="absolute right-0 top-full z-50 mt-2 w-72 origin-top-right rounded-2xl border border-rose-100 bg-white p-2 shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150 sm:w-80 dark:border-studio-700 dark:bg-studio-900 dark:ring-white/10"
                >
                  <div className="border-b border-slate-100 px-3 py-2.5 dark:border-studio-800">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Studio Actions</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Quickly create and schedule records</p>
                  </div>
                  <div className="space-y-1 py-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickActionsOpen(false);
                        openAddMember();
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-800 transition hover:bg-rose-50 hover:text-rose-700 dark:text-slate-200 dark:hover:bg-studio-800 dark:hover:text-rose-300"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 transition group-hover:bg-rose-600 group-hover:text-white dark:bg-rose-950/60 dark:text-rose-400">
                        <UserPlusIcon size="sm" />
                      </span>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 group-hover:text-rose-700 dark:text-white dark:group-hover:text-rose-300">Add Member</span>
                        <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">Enroll member with plan & details</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickActionsOpen(false);
                        openAddSession();
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs font-semibold text-slate-800 transition hover:bg-violet-50 hover:text-violet-700 dark:text-slate-200 dark:hover:bg-studio-800 dark:hover:text-violet-300"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 transition group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-950/60 dark:text-violet-400">
                        <CalendarIcon size="sm" />
                      </span>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-900 group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-300">Add Session / Schedule</span>
                        <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">Schedule studio class with trainer</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div role="status" className="-mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] leading-5 text-sky-900"><AlertCircleIcon size="sm" className="mt-0.5 shrink-0 text-sky-700" /><p>Dashboard summaries use records in this browser workspace. Schedule, renewal windows, and comparisons use your local date; missing data is called out below.</p></div>
      <Modal singleScroll={activePanel === 'activity'} isOpen={activePanel !== null} onClose={() => { setActivePanel(null); setSelectedActivityId(null); }} title={activePanel === 'activity' ? (selectedActivityId ? 'Activity details' : 'Studio activity') : { schedule: 'Schedule details', renewals: 'Membership renewals', leads: 'CRM follow-ups', trainers: 'Trainer performance', attendance: 'Attendance & team', events: 'Upcoming events', activity: 'Studio activity', notifications: 'Notifications' }[activePanel ?? 'schedule']} description={activePanel === 'activity' ? `${recordActivity.length} records from this browser workspace` : `Workspace records · ${dayLabel}`} size="xl" footer={<button type="button" onClick={() => { setActivePanel(null); setSelectedActivityId(null); }} className="min-h-10 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white">Close</button>}>
        {activePanel === 'schedule' && <div className="space-y-3"><p className="text-xs text-slate-600">Today’s sessions and the next seven days. Existing class dates are shown as saved.</p>{upcomingSessions.length ? upcomingSessions.map((session) => <article key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-900">{session.name} <span className="ml-1 font-normal text-slate-500">· {session.displayDate} · {session.time} {session.period}</span></p><p className="mt-1 text-[10px] text-slate-500">{session.trainer} · {session.room} · {session.booked}/{session.capacity} booked · {session.status}</p></div><div className="flex gap-2">{attendanceBookings.some((booking) => booking.classId === session.id) && <button type="button" onClick={() => { setActivePanel(null); openAttendance(session.id); }} className="min-h-8 rounded-lg bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-800">Check in</button>}<button type="button" disabled={session.status === 'Cancelled' || session.status === 'Completed'} onClick={() => { setClasses((current) => current.map((item) => item.id === session.id ? { ...item, status: 'Cancelled' } : item)); addToast({ type: 'success', title: 'Session cancelled', message: `${session.name} was cancelled in this browser workspace.` }); }} className="min-h-8 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold text-slate-600 disabled:opacity-40">Cancel session</button></div></article>) : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No sessions are scheduled today or in the next seven days.</p>}</div>}
        {activePanel === 'renewals' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Active and review member records expiring within the next 7 days. Click Details to view full renewal info.
            </p>
            {expiringMembers.length ? (
              expiringMembers.map((member) => (
                <article
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-slate-300 dark:border-studio-700 dark:bg-studio-900/60"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{member.name}</p>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        {member.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {member.plan || 'Standard Plan'} · Expiry {formatDate(member.expiryDate)} ·{' '}
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {member.daysToExpiry < 0
                          ? `${Math.abs(member.daysToExpiry)} days overdue`
                          : member.daysToExpiry === 0
                            ? 'Due today'
                            : `in ${member.daysToExpiry} days`}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePanel(null);
                      setSelectedRenewalMember(member);
                    }}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-studio-700 dark:bg-studio-800 dark:text-slate-200"
                  >
                    Details →
                  </button>
                </article>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500 dark:border-studio-700 dark:text-slate-400">
                No active or review memberships are overdue or expiring within 7 days.
              </p>
            )}
          </div>
        )}
        {activePanel === 'leads' && <div className="space-y-3">{openLeads.length ? openLeads.map((lead) => { const draft = leadDrafts[lead.id] ?? { date: lead.followUpDate, note: '' }; return <article key={lead.id} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900">{lead.name} · {lead.stage}</p><p className="mt-1 text-[10px] text-slate-500">{lead.contact || 'No contact record'} · {lead.assigned} · {lead.followUpDate ? `Follow-up ${new Date(`${lead.followUpDate}T12:00:00`).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : 'No follow-up date'}</p></div><span className={`h-fit rounded-full px-2 py-1 text-[10px] ${lead.followUpDate <= todayKey ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>{lead.followUpDate <= todayKey ? 'Due / overdue' : 'Scheduled'}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-[160px_1fr_auto_auto]"><input aria-label={`Follow-up date for ${lead.name}`} type="date" value={draft.date} onChange={(event) => setLeadDrafts((current) => ({ ...current, [lead.id]: { ...draft, date: event.target.value } }))} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs" /><input aria-label={`Follow-up note for ${lead.name}`} value={draft.note} onChange={(event) => setLeadDrafts((current) => ({ ...current, [lead.id]: { ...draft, note: event.target.value } }))} placeholder="Record contact outcome or plan" className="min-h-9 min-w-0 rounded-lg border border-slate-300 px-3 text-xs" /><button type="button" onClick={() => saveLeadFollowUp(lead.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold">Save</button><button type="button" onClick={() => completeLeadFollowUp(lead.id)} className="min-h-9 rounded-lg bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-800">Complete</button></div>{lead.followUpHistory?.length ? <p className="mt-2 text-[10px] text-slate-500">Latest note: {lead.followUpHistory.at(-1)?.note}</p> : null}</article>; }) : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No open CRM follow-ups are due or scheduled.</p>}<p className="text-[10px] text-slate-500">Lead changes are shared with the CRM page and saved in this browser.</p></div>}
        {activePanel === 'trainers' && <div className="space-y-3">{trainers.map((trainer) => { const trainerFeedback = ratedFeedback.filter((item) => item.trainerName === trainer); const trainerSessions = sessions.filter((item) => item.trainer === trainer && item.date >= todayKey); return <article key={trainer} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900">{trainer}</p><p className="mt-1 text-[10px] text-slate-500">{trainerSessions.length} upcoming scheduled session{trainerSessions.length === 1 ? '' : 's'} · {trainerFeedback.length ? `${(trainerFeedback.reduce((sum, item) => sum + item.rating, 0) / trainerFeedback.length).toFixed(1)} / 5 from ${trainerFeedback.length} member rating${trainerFeedback.length === 1 ? '' : 's'}` : 'No member ratings recorded'}</p></div></div>{trainerFeedback.map((item) => <div key={item.id} className="mt-3 border-t border-slate-100 pt-3"><p className="text-[10px] text-slate-600">{members.find((member) => member.id === item.memberId)?.name ?? 'Member'} · {item.rating}/5 · {formatDate(item.submittedAt)}</p><div className="mt-2 flex gap-2"><input aria-label={`Trainer feedback follow-up note ${item.id}`} value={feedbackDrafts[item.id] ?? item.followUpNote} onChange={(event) => setFeedbackDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Follow-up note" className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-xs" /><button type="button" onClick={() => saveTrainerNote(item.id)} className="rounded-lg border border-slate-200 px-3 text-[10px] font-semibold">Save note</button><button type="button" onClick={() => setFeedback((current) => current.map((entry) => entry.id === item.id ? { ...entry, reviewStatus: entry.reviewStatus === 'Reviewed' ? 'New' : 'Reviewed' } : entry))} className="rounded-lg bg-violet-50 px-3 text-[10px] font-semibold text-violet-800">Mark {item.reviewStatus === 'Reviewed' ? 'new' : 'reviewed'}</button></div></div>)}</article>; })}{!trainers.length && <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No trainers are associated with current schedule or member records.</p>}<p className="text-[10px] text-slate-500">Ratings come only from recorded member feedback. Session counts describe trainer schedules, not staff work activity.</p></div>}
        {activePanel === 'attendance' && <div className="space-y-4"><section><h3 className="text-xs font-bold text-slate-900">Member attendance · {dayLabel}</h3>{todaySessions.length ? <ul className="mt-2 space-y-2">{todaySessions.map((session) => <li key={session.id} className="rounded-xl border border-slate-200 p-3"><p className="text-xs font-semibold text-slate-900">{session.name} · {session.trainer}</p><p className="mt-1 text-[10px] text-slate-500">{session.time} {session.period} · {session.booked}/{session.capacity} confirmed</p>{bookings.filter((booking) => booking.classId === session.id && booking.status === 'Confirmed').map((booking) => <p key={booking.id} className="mt-2 flex items-center justify-between text-[10px] text-slate-600">{members.find((member) => member.id === booking.memberId)?.name ?? 'Member record unavailable'} · {attendance.find((item) => item.bookingId === booking.id)?.status ?? 'Not checked in'}{!attendance.some((item) => item.bookingId === booking.id) && <button type="button" onClick={() => { setActivePanel(null); openAttendance(session.id); }} className="font-semibold text-emerald-700">Check in</button>}</p>)}</li>)}</ul> : <p className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">No classes are scheduled for today.</p>}</section><section className="rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-bold text-slate-900">Trainer schedule</h3><p className="mt-1 text-[10px] text-slate-600">{scheduledTrainerCount} trainers are scheduled today. Trainer sessions and feedback appear in the separate performance view above.</p></section><section className="rounded-xl bg-amber-50/70 p-3"><h3 className="text-xs font-bold text-slate-900">Staff activity</h3><p className="mt-1 text-[10px] text-slate-600">No staff work log is recorded in this workspace, so staff activity totals are unavailable.</p></section></div>}
        {activePanel === 'events' && <div className="space-y-4"><section className="space-y-2">{upcomingEvents.length ? upcomingEvents.map((event) => <article key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-xs font-semibold text-slate-900">{event.title} · {event.category}</p><p className="mt-1 text-[10px] text-slate-500">{formatDateTime(event.startAt)} · {event.venue}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setEditingEventId(event.id); setEventDraft({ title: event.title, category: event.category, startAt: localDateTimeInput(event.startAt), endAt: localDateTimeInput(event.endAt), venue: event.venue }); setEventError(''); }} className="min-h-8 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold">Edit</button><button type="button" disabled={event.cancelled} onClick={() => { setEvents((current) => current.map((item) => item.id === event.id ? { ...item, cancelled: true } : item)); addToast({ type: 'success', title: 'Event cancelled', message: `${event.title} was cancelled in the browser workspace.` }); }} className="min-h-8 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold disabled:opacity-50">Cancel</button></div></article>) : <p className="rounded-xl border border-dashed border-slate-200 p-4 text-xs text-slate-500">No future events are recorded. Create an event below; saved dates remain unchanged.</p>}</section><form onSubmit={createDashboardEvent} className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"><p className="text-xs font-bold text-slate-800 sm:col-span-2">{editingEventId ? 'Edit event' : 'Add event'}</p><input aria-label="Event title" value={eventDraft.title} onChange={(event) => setEventDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="Event title" className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs" /><input aria-label="Event category" value={eventDraft.category} onChange={(event) => setEventDraft((draft) => ({ ...draft, category: event.target.value }))} placeholder="Category" className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs" /><input aria-label="Event venue" value={eventDraft.venue} onChange={(event) => setEventDraft((draft) => ({ ...draft, venue: event.target.value }))} placeholder="Venue" className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs" /><input aria-label="Event starts" type="datetime-local" value={eventDraft.startAt} onChange={(event) => setEventDraft((draft) => ({ ...draft, startAt: event.target.value }))} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs" /><input aria-label="Event ends" type="datetime-local" value={eventDraft.endAt} onChange={(event) => setEventDraft((draft) => ({ ...draft, endAt: event.target.value }))} className="min-h-9 rounded-lg border border-slate-300 px-2 text-xs" />{eventError && <p role="alert" className="text-xs text-rose-700 sm:col-span-2">{eventError}</p>}<div className="flex justify-end gap-2 sm:col-span-2">{editingEventId && <button type="button" onClick={() => { setEditingEventId(null); setEventDraft({ title: '', category: '', startAt: '', endAt: '', venue: currentStaffStudio.name }); setEventError(''); }} className="min-h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-semibold">Cancel edit</button>}<button type="submit" className="min-h-9 rounded-lg bg-rose-600 px-3 text-[10px] font-semibold text-white">{editingEventId ? 'Save changes' : 'Save event'}</button></div></form><p className="text-[10px] text-slate-500">Events are saved to the browser workspace; no invitations or notifications are sent.</p></div>}
        {activePanel === 'activity' && <div className="space-y-4">
          {selectedActivityId ? (() => {
            const selected = recordActivity.find((item) => item.id === selectedActivityId);
            if (!selected) return <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">This record is no longer available in the workspace.</p>;
            return <div className="space-y-4"><button type="button" onClick={() => setSelectedActivityId(null)} className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">← Back to activity</button><article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${selected.tone}`}>{selected.initials}</span><div className="min-w-0 flex-1"><p className="text-base font-semibold text-slate-900">{selected.title}</p><p className="mt-1 text-sm text-slate-600">{selected.detail}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">{selected.category}</span><span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-semibold text-rose-700">{selected.status}</span></div></div></div><dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-slate-100 pt-4 sm:grid-cols-2">{selected.metadata.map((item) => { const [label, ...value] = item.split(': '); return <div key={item}><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-xs text-slate-700">{value.join(': ')}</dd></div>; })}</dl><p className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400">Record date · {selected.dateOnly ? formatDate(selected.at, true) : formatDateTime(selected.at, true)}</p></article></div>;
          })() : <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-[10px] font-semibold text-slate-500 sm:col-span-2 lg:col-span-1">Search activity<input type="search" value={activitySearch} onChange={(event) => setActivitySearch(event.target.value)} placeholder="Member, class, status…" className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-normal text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" /></label>
              <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Activity type<select value={activityCategory} onChange={(event) => setActivityCategory(event.target.value as 'All' | ActivityCategory)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-normal text-slate-800"><option value="All">All activity</option><option>Payments</option><option>Attendance</option><option>Bookings</option><option>Memberships</option></select></label>
              <label className="grid gap-1 text-[10px] font-semibold text-slate-500">From<input type="date" value={activityStart} max={activityEnd || undefined} onChange={(event) => setActivityStart(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-2 text-xs font-normal text-slate-800" /></label>
              <label className="grid gap-1 text-[10px] font-semibold text-slate-500">Through<input type="date" value={activityEnd} min={activityStart || undefined} onChange={(event) => setActivityEnd(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 px-2 text-xs font-normal text-slate-800" /></label>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2"><p className="text-xs font-semibold text-slate-700">{filteredActivity.length} {filteredActivity.length === 1 ? 'record' : 'records'}</p>{(activitySearch || activityCategory !== 'All' || activityStart || activityEnd) && <button type="button" onClick={() => { setActivitySearch(''); setActivityCategory('All'); setActivityStart(''); setActivityEnd(''); }} className="min-h-8 rounded-lg px-2 text-[10px] font-semibold text-rose-700 hover:bg-rose-50">Clear filters</button>}</div>
            {filteredActivity.length ? <ol className="divide-y divide-slate-100">{filteredActivity.map((item) => <li key={item.id}><button type="button" onClick={() => setSelectedActivityId(item.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 sm:px-3"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10px] font-semibold ${item.tone}`}>{item.initials}</span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-900">{item.title}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">{item.category}</span></span><span className="mt-1 block text-[10px] text-slate-500">{item.detail}</span></span><span className="flex shrink-0 items-center gap-2"><time className="text-[10px] text-slate-400">{item.dateOnly ? formatDate(item.at) : formatDateTime(item.at)}</time><span className="rounded-full bg-rose-50 px-2 py-1 text-[9px] font-semibold text-rose-700">{item.status}</span></span><span aria-hidden="true" className="text-slate-400">›</span></button></li>)}</ol> : recordActivity.length ? <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No activity matches these filters.</p> : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No record history is available in the workspace. Membership, booking, attendance and payment records will appear here when available.</p>}
            <p className="text-[10px] text-slate-500">Rows use existing member, booking, attendance, and payment records. Staff audit history is not recorded in this workspace.</p>
          </>}
        </div>}
        {activePanel === 'notifications' && <div>{notifications.length ? <ul className="space-y-2">{notifications.map((item) => <li key={item.id} className={`rounded-xl border p-3 ${item.unread ? 'border-rose-200 bg-rose-50/40' : 'border-slate-200'}`}><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-semibold text-slate-900">{item.title}</p><p className="mt-1 text-[10px] text-slate-600">{item.detail}</p><p className="mt-1 text-[10px] text-slate-400">{item.category} · {formatDateTime(item.createdAt)}</p></div><button type="button" onClick={() => setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, unread: !notification.unread } : notification))} className="h-fit rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold">Mark {item.unread ? 'read' : 'unread'}</button></div></li>)}</ul> : <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">No notifications are recorded in this workspace. No sample alerts are shown as real notifications.</p>}</div>}
      </Modal>
      <Modal isOpen={memberDialogOpen} onClose={() => setMemberDialogOpen(false)} title="Add member" description="Register a new member in the studio roster with optional initial payment." size="md" footer={<><button type="button" onClick={() => setMemberDialogOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" form="dashboard-member-form" disabled={isSavingMember} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-60">{isSavingMember ? 'Saving…' : 'Save member'}</button></>}>
        <form id="dashboard-member-form" noValidate onSubmit={handleMemberSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 sm:col-span-2">Full name<input autoFocus value={memberForm.name} onChange={(event) => setMemberForm({ ...memberForm, name: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20" placeholder="e.g. Rahul Sharma" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Email address<input type="email" value={memberForm.email} onChange={(event) => setMemberForm({ ...memberForm, email: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20" placeholder="rahul@example.com" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Phone number<input type="tel" value={memberForm.phone} onChange={(event) => setMemberForm({ ...memberForm, phone: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20" placeholder="9876543210" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Membership plan<select value={memberForm.plan} onChange={(event) => {
            const selectedPlan = event.target.value;
            const planObj = plans.find((p) => p.name === selectedPlan);
            setMemberForm({ ...memberForm, plan: selectedPlan });
            if (planObj?.price) {
              setMemberPayment((prev) => ({ ...prev, amount: String(planObj.price) }));
            }
          }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"><option value="">Choose a plan</option>{plans.filter((plan) => plan.active).map((plan) => <option key={plan.id} value={plan.name}>{plan.name} ({plan.price ? formatInr(plan.price) : 'No fee'})</option>)}<option value="No Plan / Drop-in only">No Plan / Drop-in only</option></select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Coach<select value={memberForm.coach} onChange={(event) => setMemberForm({ ...memberForm, coach: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"><option value="">Unassigned</option>{trainers.map((trainer) => <option key={trainer} value={trainer}>{trainer}</option>)}</select></label>

          {/* Payment Step Container */}
          <div className="sm:col-span-2 rounded-xl border border-rose-100 bg-rose-50/50 p-3.5 dark:border-studio-700 dark:bg-studio-900/60">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Record payment now</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Collect or record initial payment while adding the member</p>
              </div>
              <input
                type="checkbox"
                id="toggle-member-payment"
                checked={memberPayment.recordNow}
                onChange={(e) => {
                  const checked = e.target.checked;
                  const planObj = plans.find((p) => p.name === memberForm.plan);
                  setMemberPayment({
                    ...memberPayment,
                    recordNow: checked,
                    amount: checked ? (planObj?.price ? String(planObj.price) : '2500') : '',
                  });
                }}
                className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
            </div>

            {memberPayment.recordNow && (
              <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                <label className="grid gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Amount (INR) *
                  <input
                    type="number"
                    value={memberPayment.amount}
                    onChange={(e) => setMemberPayment({ ...memberPayment, amount: e.target.value })}
                    placeholder="2500"
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Method
                  <select
                    value={memberPayment.method}
                    onChange={(e) => setMemberPayment({ ...memberPayment, method: e.target.value as any })}
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                    <option value="Bank transfer">Bank transfer</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  Status
                  <select
                    value={memberPayment.status}
                    onChange={(e) => setMemberPayment({ ...memberPayment, status: e.target.value as any })}
                    className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </label>
              </div>
            )}
          </div>

          {memberError && <p role="alert" className="text-xs font-medium text-rose-700 sm:col-span-2">{memberError}</p>}
        </form>
      </Modal>
      <Modal isOpen={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} title="Add session or class" description="Add a session to the shared schedule (12-hour AM/PM)." size="md" footer={<><button type="button" onClick={() => setScheduleDialogOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700 dark:border-studio-700 dark:text-slate-200">Cancel</button><button type="submit" form="dashboard-session-form" disabled={isSavingSession} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-60">{isSavingSession ? 'Adding…' : 'Save session'}</button></>}>
        <form id="dashboard-session-form" noValidate onSubmit={handleScheduleSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 sm:col-span-2">Session title<input autoFocus required value={sessionForm.name} onChange={(event) => setSessionForm({ ...sessionForm, name: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" placeholder="e.g. Evening Mobility" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Class type<input required list="dashboard-session-categories" value={sessionForm.category} onChange={(event) => setSessionForm({ ...sessionForm, category: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" placeholder="Choose or enter a type" /><datalist id="dashboard-session-categories">{sessionCategories.map((category) => <option key={category} value={category} />)}</datalist></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Date<input required type="date" value={sessionForm.date} onChange={(event) => setSessionForm({ ...sessionForm, date: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" /></label>
          {(['startTime', 'endTime'] as const).map((field) => {
            const parsed = parse24To12(sessionForm[field] || (field === 'startTime' ? '09:00' : '10:00'));
            return (
              <fieldset key={field} className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                <legend>{field === 'startTime' ? 'Start time (12-hr)' : 'End time (12-hr)'}</legend>
                <div className="grid grid-cols-3 gap-1.5">
                  <select
                    aria-label={`${field === 'startTime' ? 'Start' : 'End'} hour`}
                    value={parsed.hour}
                    onChange={(e) => setSessionForm({ ...sessionForm, [field]: to24Hour(e.target.value, parsed.minute, parsed.period) })}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  >
                    {Array.from({ length: 12 }, (_, idx) => String(idx + 1).padStart(2, '0')).map((h) => (
                      <option key={h} value={h}>{Number(h)}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`${field === 'startTime' ? 'Start' : 'End'} minute`}
                    value={parsed.minute}
                    onChange={(e) => setSessionForm({ ...sessionForm, [field]: to24Hour(parsed.hour, e.target.value, parsed.period) })}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  >
                    {['00', '15', '30', '45'].map((m) => (
                      <option key={m} value={m}>:{m}</option>
                    ))}
                  </select>
                  <select
                    aria-label={`${field === 'startTime' ? 'Start' : 'End'} AM/PM`}
                    value={parsed.period}
                    onChange={(e) => setSessionForm({ ...sessionForm, [field]: to24Hour(parsed.hour, parsed.minute, e.target.value as 'AM' | 'PM') })}
                    className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"
                  >
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
              </fieldset>
            );
          })}
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Trainer<select required value={sessionForm.trainer} onChange={(event) => setSessionForm({ ...sessionForm, trainer: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100"><option value="">Select a trainer</option>{trainers.map((trainer) => <option key={trainer} value={trainer}>{trainer}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Location / room<input required value={sessionForm.room} onChange={(event) => setSessionForm({ ...sessionForm, room: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" placeholder="Studio A" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">Capacity<input required type="number" min="1" step="1" value={sessionForm.capacity} onChange={(event) => setSessionForm({ ...sessionForm, capacity: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-100" /></label>
          {sessionError && <p role="alert" className="text-xs font-medium text-rose-700 dark:text-rose-300 sm:col-span-2">{sessionError}</p>}
          <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400 sm:col-span-2">Times are selected in 12-hour AM/PM format and checked for trainer and room conflicts.</p>
        </form>
      </Modal>
      <Modal isOpen={bookingDialogOpen} onClose={() => setBookingDialogOpen(false)} title="Create booking" description="Book an active member into a scheduled class." size="sm" footer={<><button type="button" onClick={() => setBookingDialogOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" form="dashboard-booking-form" disabled={!members.some((member) => member.status === 'Active') || !classes.some((item) => item.status === 'Scheduled')} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Save booking</button></>}>
        <form id="dashboard-booking-form" noValidate onSubmit={handleBookingSubmit} className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Member<select value={bookingForm.memberId} onChange={(event) => setBookingForm({ ...bookingForm, memberId: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option value="">Choose a member</option>{members.filter((member) => member.status === 'Active').map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Class<select value={bookingForm.classId} onChange={(event) => setBookingForm({ ...bookingForm, classId: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option value="">Choose a class</option>{classes.filter((item) => item.status === 'Scheduled').map((item) => <option key={item.id} value={item.id}>{item.name} · {formatDate(item.date)} · {formatClock(item.startTime).time} {formatClock(item.startTime).period}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Booking status<select value={bookingForm.status} onChange={(event) => setBookingForm({ ...bookingForm, status: event.target.value as StaffClassBooking['status'] })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option value="Confirmed">Confirmed</option><option value="Waitlisted">Waitlisted</option></select></label>
          {bookingError && <p role="alert" className="text-xs font-medium text-rose-700">{bookingError}</p>}
        </form>
      </Modal>
      <Modal isOpen={paymentDialogOpen} onClose={() => setPaymentDialogOpen(false)} title="Record payment" description="Add a transaction to the shared payment ledger." size="sm" footer={<><button type="button" onClick={() => setPaymentDialogOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" form="dashboard-payment-form" disabled={!members.length} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Save payment</button></>}>
        <form id="dashboard-payment-form" noValidate onSubmit={handlePaymentSubmit} className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Member<select value={paymentForm.memberId} onChange={(event) => setPaymentForm({ ...paymentForm, memberId: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option value="">Choose a member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Payment type<input value={paymentForm.type} onChange={(event) => setPaymentForm({ ...paymentForm, type: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800" /></label>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-xs font-semibold text-slate-700">Amount (₹)<input type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700">Date<input type="date" value={paymentForm.date} onChange={(event) => setPaymentForm({ ...paymentForm, date: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800" /></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1.5 text-xs font-semibold text-slate-700">Method<select value={paymentForm.method} onChange={(event) => setPaymentForm({ ...paymentForm, method: event.target.value })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option>UPI</option><option>Card</option><option>Bank transfer</option></select></label><label className="grid gap-1.5 text-xs font-semibold text-slate-700">Status<select value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value as 'Paid' | 'Pending' })} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-800"><option value="Paid">Paid</option><option value="Pending">Pending</option></select></label></div>
          {paymentError && <p role="alert" className="text-xs font-medium text-rose-700">{paymentError}</p>}
        </form>
      </Modal>
      <Modal isOpen={attendanceDialogOpen} onClose={() => setAttendanceDialogOpen(false)} title="Record a check-in" description="Marks a confirmed booking as present." size="sm" footer={<><button type="button" onClick={() => setAttendanceDialogOpen(false)} className="min-h-10 rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-700">Cancel</button><button type="submit" form="dashboard-attendance-form" disabled={!attendanceBookings.length} className="min-h-10 rounded-lg bg-rose-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Record check-in</button></>}>
        <form id="dashboard-attendance-form" noValidate onSubmit={handleAttendanceSubmit} className="space-y-3">
          {attendanceBookings.length ? <label className="grid gap-1.5 text-xs font-semibold text-slate-700">Confirmed booking<select required value={selectedBookingId} onChange={(event) => setSelectedBookingId(event.target.value)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Select a booking</option>{attendanceBookings.map((booking) => { const member = members.find((item) => item.id === booking.memberId); const session = todaySessions.find((item) => item.id === booking.classId); return <option key={booking.id} value={booking.id}>{member?.name ?? booking.memberId} · {session?.name ?? 'Class'}</option>; })}</select></label> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">All confirmed bookings for this date already have an attendance record.</p>}
          {attendanceError && <p role="alert" className="text-xs font-medium text-rose-700">{attendanceError}</p>}
          <p className="text-[10px] leading-5 text-slate-500">The update is temporary and shared with the Attendance workspace for this browser session.</p>
        </form>
      </Modal>
      {scheduleNotice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">{scheduleNotice}</p>}

      {/* MEMBERSHIP RENEWAL DETAILS MODAL POPUP */}
      <Modal
        isOpen={selectedRenewalMember !== null}
        onClose={() => setSelectedRenewalMember(null)}
        title={selectedRenewalMember ? `Renewal Details · ${selectedRenewalMember.name}` : 'Renewal Details'}
        description="Comprehensive membership renewal, plan allowance, and payment ledger details."
        size="lg"
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Dashboard record review · No route navigation
            </span>
            <button
              type="button"
              onClick={() => setSelectedRenewalMember(null)}
              className="min-h-10 rounded-xl bg-slate-900 px-5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 dark:bg-rose-700 dark:hover:bg-rose-600"
            >
              Close
            </button>
          </div>
        }
      >
        {selectedRenewalMember && (
          <div className="space-y-4">
            {/* Member Identity Header Card */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 dark:border-studio-700 dark:bg-studio-950/60">
              <div className="flex items-center gap-3.5">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 text-base font-bold text-white shadow-xs">
                  {selectedRenewalMember.name
                    .split(/\s+/)
                    .map((p) => p[0] ?? '')
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-serif text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                      {selectedRenewalMember.name}
                    </h3>
                    <StatusBadge
                      tone={
                        selectedRenewalMember.status === 'Active'
                          ? 'green'
                          : selectedRenewalMember.status === 'Review'
                            ? 'amber'
                            : 'slate'
                      }
                    >
                      {selectedRenewalMember.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {selectedRenewalMember.email} · {selectedRenewalMember.phone}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-2xs dark:border-studio-700 dark:bg-studio-900 dark:text-slate-300">
                  Coach: {selectedRenewalMember.coach || 'Unassigned'}
                </span>
              </div>
            </div>

            {/* 4 Summary Metric Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Membership Plan */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-studio-700 dark:bg-studio-900">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Current Plan
                </p>
                <p className="mt-1 font-serif text-base font-bold text-slate-900 dark:text-white">
                  {selectedRenewalMember.plan || 'Standard Plan'}
                </p>
                <p className="mt-0.5 text-[11px] text-rose-700 dark:text-rose-400">
                  {renewalPlan?.planType || 'Monthly'} cycle
                </p>
              </div>

              {/* Renewal / Expiry Date */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-studio-700 dark:bg-studio-900">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Renewal / Expiry
                </p>
                <p className="mt-1 font-serif text-base font-bold text-slate-900 dark:text-white">
                  {formatDate(selectedRenewalMember.expiryDate)}
                </p>
                <p
                  className={`mt-0.5 text-[11px] font-semibold ${
                    selectedRenewalMember.daysToExpiry < 0
                      ? 'text-rose-700 dark:text-rose-400'
                      : selectedRenewalMember.daysToExpiry <= 3
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {selectedRenewalMember.daysToExpiry < 0
                    ? `${Math.abs(selectedRenewalMember.daysToExpiry)} days overdue`
                    : selectedRenewalMember.daysToExpiry === 0
                      ? 'Due today'
                      : `in ${selectedRenewalMember.daysToExpiry} days`}
                </p>
              </div>

              {/* Amount Due */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-studio-700 dark:bg-studio-900">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Amount Due
                </p>
                <p className="mt-1 font-serif text-base font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatInr(renewalAmountDue)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Standard tier fee
                </p>
              </div>

              {/* Payment Status */}
              <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-studio-700 dark:bg-studio-900">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Payment Status
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      renewalLatestPayment?.status === 'Paid'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : renewalLatestPayment?.status === 'Pending'
                          ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                          : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                    }`}
                  >
                    {renewalLatestPayment?.status || 'Renewal Due'}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {renewalLatestPayment ? `Via ${renewalLatestPayment.method}` : 'Pending settlement'}
                </p>
              </div>
            </div>

            {/* Plan Entitlements & Studio Benefits */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-studio-700 dark:bg-studio-900">
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Plan Entitlements &amp; Studio Allowance
              </h4>
              <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-studio-950/50">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Session Limit</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {renewalPlan?.sessionLimit || 'Standard studio class booking allowance'}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-studio-950/50">
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Member Studio Activity</p>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {selectedRenewalMember.visits} · Last visit: {selectedRenewalMember.lastVisit}
                  </p>
                </div>
              </div>
              {renewalPlan?.benefits && (
                <div className="mt-3 border-t border-slate-100 pt-2.5 dark:border-studio-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Included Benefits</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    {renewalPlan.benefits}
                  </p>
                </div>
              )}
            </div>

            {/* Payment Ledger History */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-studio-700 dark:bg-studio-900">
              <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Payment History &amp; Transaction Ledger
              </h4>
              {renewalMemberPayments.length > 0 ? (
                <div className="mt-2.5 divide-y divide-slate-100 dark:divide-studio-800">
                  {renewalMemberPayments.slice(0, 3).map((pmt) => (
                    <div key={pmt.ref} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{pmt.ref}</span>
                          <span className="text-[11px] text-slate-400">· {formatDate(pmt.date)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {pmt.type} via {pmt.method} {pmt.notes ? `(${pmt.notes})` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatInr(pmt.amount)}
                        </span>
                        <StatusBadge
                          tone={
                            pmt.status === 'Paid'
                              ? 'green'
                              : pmt.status === 'Pending'
                                ? 'amber'
                                : 'rose'
                          }
                        >
                          {pmt.status}
                        </StatusBadge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No prior transactions found in the browser workspace for this member.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      <>
        {paymentsUnavailable && (
          <div role="alert" className="-mt-3 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-900">
            <AlertTriangleIcon size="sm" className="mt-0.5 shrink-0 text-amber-700" />
            <p>Payments service is temporarily unavailable. Payment records and revenue metrics may be incomplete.</p>
          </div>
        )}
          {/* OPERATIONAL SUMMARY CARDS */}
          <section aria-label={`Studio operational summary for ${currentStaffStudio.name}`} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Payments */}
            <Link
              href="/admin/payments"
              className="group relative min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-subtle transition hover:border-rose-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-studio-700 dark:bg-studio-900"
            >
              <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-rose-300 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Total Payments</p>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <CreditCardIcon size="xs" />
                </span>
              </div>
              <p className="mt-2 font-serif text-2xl font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-white">
                {formatInr(recordedRevenue)}
              </p>
              <p className="mt-2 truncate text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                Net revenue collected <span className="font-normal text-slate-400">(net of refunds)</span>
              </p>
            </Link>

            {/* Renewals Due (Clickable to view records in workspace modal without leaving the page) */}
            <button
              type="button"
              onClick={() => setActivePanel('renewals')}
              className="group relative min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 text-left shadow-subtle transition hover:border-amber-300 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-studio-700 dark:bg-studio-900"
            >
              <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-amber-300 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Renewals Due</p>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                  <ClockIcon size="xs" />
                </span>
              </div>
              <p className="mt-2 font-serif text-2xl font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-white">
                {expiringMembers.length}
              </p>
              <p className="mt-2 truncate text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Expiring within 30 days <span className="font-normal text-slate-400">· Click to review</span>
              </p>
            </button>

            {/* Classes Scheduled This Week */}
            <Link
              href="/admin/classes"
              className="group relative min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-subtle transition hover:border-violet-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-studio-700 dark:bg-studio-900"
            >
              <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-violet-300 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Classes This Week</p>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                  <CalendarIcon size="xs" />
                </span>
              </div>
              <p className="mt-2 font-serif text-2xl font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-white">
                {classesScheduledThisWeek.length}
              </p>
              <p className="mt-2 truncate text-[10px] font-semibold text-violet-700 dark:text-violet-400">
                Scheduled this calendar week <span className="font-normal text-slate-400">· View roster</span>
              </p>
            </Link>

            {/* Active Members */}
            <Link
              href="/admin/members"
              className="group relative min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-subtle transition hover:border-emerald-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-studio-700 dark:bg-studio-900"
            >
              <span aria-hidden="true" className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Active Members</p>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <UserPlusIcon size="xs" />
                </span>
              </div>
              <p className="mt-2 font-serif text-2xl font-bold leading-none tracking-tight text-slate-950 tabular-nums dark:text-white">
                {activeMemberCount.toLocaleString('en-IN')}
              </p>
              <p className="mt-2 truncate text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                Current studio roster <span className="font-normal text-slate-400">· Active profiles</span>
              </p>
            </Link>
          </section>

          {/* PAYMENTS OVERVIEW GRAPH — RED & PURPLE FITNESS AI THEME */}
          <Card className="p-4 sm:p-6 dark:border-studio-700 dark:bg-studio-900">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                    Payments Overview
                  </h2>
                  <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                    Net Collected
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Collected payments over time (net of refunds). Excludes pending and failed payments.
                </p>
              </div>

              {/* Period Selectors */}
              <div className="flex items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-slate-50/80 p-1 sm:self-auto dark:border-studio-700 dark:bg-studio-950">
                {(['7D', '30D', '12M'] as const).map((p) => {
                  const active = paymentGraphRange === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPaymentGraphRange(p);
                        setHoveredPointIdx(null);
                      }}
                      className={`min-h-7 rounded-lg px-3 text-xs font-semibold transition ${
                        active
                          ? 'bg-gradient-to-r from-[#E11D48] to-[#7C3AED] text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {p === '7D' ? 'Last 7 Days' : p === '30D' ? 'Last 30 Days' : 'Last 12 Months'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Metric Strip & Hover Info */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-slate-100 py-3 dark:border-studio-800">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {paymentGraphRange === '7D' ? 'Last 7 Days Total:' : paymentGraphRange === '30D' ? 'Last 30 Days Total:' : 'Last 12 Months Total:'}
                </span>
                <span className="font-serif text-2xl font-bold tracking-tight text-slate-950 tabular-nums dark:text-white">
                  {formatInr(totalPeriodCollected)}
                </span>
                <span className="text-[11px] text-slate-400">
                  ({totalPeriodTransactions} transaction{totalPeriodTransactions === 1 ? '' : 's'})
                </span>
              </div>

              {hoveredPointIdx !== null && chartPoints[hoveredPointIdx] && (
                <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  <span className="h-2 w-2 rounded-full bg-[#E11D48]" />
                  <span>{chartPoints[hoveredPointIdx].dateText}:</span>
                  <strong className="text-slate-950 dark:text-white">
                    {formatInr(chartPoints[hoveredPointIdx].amount)}
                  </strong>
                  <span className="text-[11px] font-normal text-slate-500">
                    ({chartPoints[hoveredPointIdx].count} trans)
                  </span>
                </div>
              )}
            </div>

            {/* SVG Chart Area */}
            <div className="mt-4 w-full overflow-hidden">
              <svg
                viewBox="0 0 760 220"
                className="h-56 w-full touch-pan-x select-none overflow-visible"
              >
                <defs>
                  <linearGradient id="paymentsLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#E11D48" />
                    <stop offset="100%" stopColor="#7C3AED" />
                  </linearGradient>
                  <linearGradient id="paymentsAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#E11D48" stopOpacity="0.32" />
                    <stop offset="50%" stopColor="#7C3AED" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Gridlines & Y-Axis Labels */}
                {[
                  { ratio: 1.0, y: chartTop, label: compactCurrency(maxChartAmount) },
                  { ratio: 0.67, y: chartTop + chartHeight * 0.33, label: compactCurrency(maxChartAmount * 0.67) },
                  { ratio: 0.33, y: chartTop + chartHeight * 0.67, label: compactCurrency(maxChartAmount * 0.33) },
                  { ratio: 0.0, y: chartBottom, label: '₹0' },
                ].map((grid, idx) => (
                  <g key={idx}>
                    <line
                      x1={chartLeft}
                      y1={grid.y}
                      x2={chartLeft + chartWidth}
                      y2={grid.y}
                      stroke="currentColor"
                      className="text-slate-100 dark:text-studio-800"
                      strokeDasharray={grid.ratio === 0 ? '' : '3 3'}
                    />
                    <text
                      x={chartLeft - 8}
                      y={grid.y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-semibold tabular-nums dark:fill-slate-500"
                    >
                      {grid.label}
                    </text>
                  </g>
                ))}

                {/* Area and Line Paths */}
                {totalPeriodCollected > 0 && (
                  <>
                    <path d={areaPath} fill="url(#paymentsAreaGrad)" />
                    <path
                      d={linePath}
                      fill="none"
                      stroke="url(#paymentsLineGrad)"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}

                {/* Hover line indicator */}
                {hoveredPointIdx !== null && chartPoints[hoveredPointIdx] && (
                  <line
                    x1={chartPoints[hoveredPointIdx].x}
                    y1={chartTop}
                    x2={chartPoints[hoveredPointIdx].x}
                    y2={chartBottom}
                    stroke="#E11D48"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Interactive Points and X-Axis Labels */}
                {chartPoints.map((pt, i) => {
                  const isHovered = hoveredPointIdx === i;
                  return (
                    <g key={i}>
                      {/* X-axis label */}
                      {pt.label && (
                        <text
                          x={pt.x}
                          y={chartBottom + 20}
                          textAnchor="middle"
                          className="fill-slate-400 text-[10px] font-medium dark:fill-slate-500"
                        >
                          {pt.label}
                        </text>
                      )}

                      {/* Interactive dot */}
                      {(isHovered || pt.amount > 0 || paymentGraphRange === '7D') && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isHovered ? 6 : pt.amount > 0 ? 3.5 : 2}
                          fill={isHovered ? '#E11D48' : '#7C3AED'}
                          stroke="#ffffff"
                          strokeWidth={isHovered ? 2.5 : 1.5}
                          className="transition-all duration-150"
                        />
                      )}

                      {/* Hit target for hover */}
                      <rect
                        x={pt.x - chartWidth / (chartPoints.length * 2)}
                        y={chartTop}
                        width={chartWidth / chartPoints.length}
                        height={chartHeight + 25}
                        fill="transparent"
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredPointIdx(i)}
                        onMouseLeave={() => setHoveredPointIdx((cur) => (cur === i ? null : cur))}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Method Breakdown & Financial Insights */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-xs dark:border-studio-800">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recorded Channels:</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Cash:{' '}
                  <strong className="tabular-nums text-slate-900 dark:text-white">
                    {formatInr(payments.filter((p) => p.method === 'Cash' && ['Paid', 'Partially Refunded'].includes(p.status)).reduce((s, p) => s + Math.max(0, p.amount - p.refundedAmount), 0))}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-rose-500" /> UPI:{' '}
                  <strong className="tabular-nums text-slate-900 dark:text-white">
                    {formatInr(payments.filter((p) => p.method === 'UPI' && ['Paid', 'Partially Refunded'].includes(p.status)).reduce((s, p) => s + Math.max(0, p.amount - p.refundedAmount), 0))}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-violet-500" /> Card:{' '}
                  <strong className="tabular-nums text-slate-900 dark:text-white">
                    {formatInr(payments.filter((p) => p.method === 'Card' && ['Paid', 'Partially Refunded'].includes(p.status)).reduce((s, p) => s + Math.max(0, p.amount - p.refundedAmount), 0))}
                  </strong>
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <span className="h-2 w-2 rounded-full bg-amber-500" /> Bank transfer:{' '}
                  <strong className="tabular-nums text-slate-900 dark:text-white">
                    {formatInr(payments.filter((p) => p.method === 'Bank transfer' && ['Paid', 'Partially Refunded'].includes(p.status)).reduce((s, p) => s + Math.max(0, p.amount - p.refundedAmount), 0))}
                  </strong>
                </span>
              </div>
              <Link
                href="/admin/payments"
                className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-800 hover:underline dark:text-rose-400"
              >
                Reconcile in Payments Ledger →
              </Link>
            </div>
          </Card>

          {/* DYNAMIC CLASS SCHEDULE TABLE */}
          <Card className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
            <div className="p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-serif text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                    Class Schedule
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Sessions scheduled for {formatDate(selectedScheduleDate, true)}
                  </p>
                </div>

                {/* Date Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedScheduleDate(todayKey)}
                    className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition ${
                      selectedScheduleDate === todayKey
                        ? 'bg-rose-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const tomorrow = new Date(today);
                      tomorrow.setDate(tomorrow.getDate() + 1);
                      setSelectedScheduleDate(localDateKey(tomorrow));
                    }}
                    className={`min-h-8 rounded-lg px-3 text-xs font-semibold transition ${
                      selectedScheduleDate === localDateKey(new Date(today.getTime() + 86400000))
                        ? 'bg-rose-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-studio-700 dark:bg-studio-900 dark:text-slate-200'
                    }`}
                  >
                    Tomorrow
                  </button>
                  <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 dark:border-studio-700 dark:bg-studio-900">
                    <CalendarIcon size="xs" />
                    <input
                      type="date"
                      value={selectedScheduleDate}
                      onChange={(e) => setSelectedScheduleDate(e.target.value)}
                      className="border-none bg-transparent text-xs font-medium text-slate-800 focus:outline-none dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Class / Session</th>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Trainer</th>
                    <th className="px-4 py-3">Date &amp; Time</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                  {(showAllClasses ? selectedDateClasses : selectedDateClasses.slice(0, 3)).map((cls) => {
                    const status = getSessionStatus(cls);
                    const membersList = getClassMembers(cls.id);
                    return (
                      <tr key={cls.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-900/40">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-slate-900 dark:text-white">{cls.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {cls.category} · {cls.room} (Cap {cls.capacity})
                          </p>
                        </td>
                        <td className="px-4 py-3.5">
                          {membersList.length > 0 ? (
                            <div>
                              <p className="font-medium text-slate-800 dark:text-slate-200">
                                {membersList.slice(0, 2).join(', ')}
                                {membersList.length > 2 && (
                                  <span className="ml-1 text-[11px] text-slate-500">
                                    +{membersList.length - 2} more
                                  </span>
                                )}
                              </p>
                              <p className="text-[10px] text-slate-400">
                                {membersList.length} member{membersList.length === 1 ? '' : 's'} booked
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">No bookings yet</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-slate-700 dark:text-slate-300">
                          {cls.trainer}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {formatDate(cls.date)} · {formatClock(cls.startTime).time} {formatClock(cls.startTime).period} – {formatClock(cls.endTime).time} {formatClock(cls.endTime).period}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge tone={status.tone}>
                            {status.label}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedDateClasses.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                        No classes scheduled for {formatDate(selectedScheduleDate, true)}.
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setSelectedScheduleDate(todayKey)}
                            className="font-semibold text-rose-600 hover:underline"
                          >
                            Return to Today
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {selectedDateClasses.length > 3 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 dark:border-studio-800">
                <button
                  type="button"
                  onClick={() => setShowAllClasses((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-700 shadow-xs hover:bg-rose-50 dark:border-studio-700 dark:bg-studio-900 dark:text-rose-400"
                >
                  {showAllClasses ? 'Show initial 3' : `See More (${selectedDateClasses.length - 3} more)`}
                </button>
                <Link
                  href="/admin/classes"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
                >
                  View All in Classes &amp; Schedules →
                </Link>
              </div>
            )}
            <div className="flex items-center justify-between bg-slate-50/70 px-5 py-2.5 text-[10px] text-slate-500 dark:bg-studio-950 dark:text-slate-400">
              <span>{selectedDateClasses.length} session{selectedDateClasses.length === 1 ? '' : 's'} scheduled</span>
            </div>
          </Card>

          <Card className="overflow-hidden dark:border-studio-700 dark:bg-studio-900">
            <div className="p-4 pb-0 sm:p-5 sm:pb-0">
              <SectionHeading
                title="Membership renewals"
                detail="Expiries due within the next 7 days"
                action="Review all renewals"
                onAction={() => setActivePanel('renewals')}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left">
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:bg-studio-950 dark:text-slate-400">
                  <tr>
                    <th className="px-5 py-2.5">Member</th>
                    <th className="px-3 py-2.5">Plan</th>
                    <th className="px-3 py-2.5">Expiry</th>
                    <th className="px-3 py-2.5">Member status</th>
                    <th className="px-5 py-2.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-studio-800">
                  {(showAllRenewals ? expiringMembers : expiringMembers.slice(0, 3)).map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/70 dark:hover:bg-studio-900/40">
                      <td className="px-5 py-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        <button
                          type="button"
                          onClick={() => setSelectedRenewalMember(member)}
                          className="text-left font-semibold text-slate-800 hover:text-rose-700 hover:underline dark:text-slate-200 dark:hover:text-rose-400"
                        >
                          {member.name}
                        </button>
                        <span className="ml-2 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                          {member.daysToExpiry === 0 ? 'Due today' : `in ${member.daysToExpiry} day${member.daysToExpiry === 1 ? '' : 's'}`}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {member.plan || 'No plan recorded'}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">
                        {formatDate(member.expiryDate)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          {member.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedRenewalMember(member)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
                        >
                          Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                  {expiringMembers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-7 text-center text-xs text-slate-500 dark:text-slate-400">
                        No active or review member records are expiring within the next 7 days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {expiringMembers.length > 3 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 dark:border-studio-800">
                <button
                  type="button"
                  onClick={() => setShowAllRenewals((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-rose-700 shadow-xs hover:bg-rose-50 dark:border-studio-700 dark:bg-studio-900 dark:text-rose-400"
                >
                  {showAllRenewals ? 'Show initial 3' : `See More (${expiringMembers.length - 3} more)`}
                </button>
                <Link
                  href="/admin/memberships"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900 hover:underline dark:text-rose-400 dark:hover:text-rose-300"
                >
                  Manage all in Memberships →
                </Link>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-slate-50/70 px-4 py-3 sm:px-5 dark:bg-studio-950 dark:text-slate-400">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {expiringMembers.length} upcoming expiry records in the next 7 days
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {pendingFreezesCount} pending freeze requests in Memberships
              </span>
            </div>
          </Card>
      </>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-[10px] text-slate-400"><span>{currentStaffStudio.name} · {currentStaffStudio.city} · Main Branch</span><span>Summaries come from workspace records. Historical dates follow the stored schedule reference date.</span></div>
      {/* ── Floating Admin AI Assistant ── */}
      <FloatingAIChat
        variant="member"
        title="Ask AI"
        subtitle="Your admin studio assistant"
        welcomeMessage="Hi! 👋 I'm your admin studio assistant. I can help with studio operations, memberships, bookings, staff management, and more."
        studioName={currentStaffStudio.name}
        onSendMessage={sendMessage}
        onMessageReceived={(response) => {
          console.log('Admin AI Response:', response);
        }}
        isBackendConnected={!!sessionId}
      />
    </div>
  );
}

export { AdminDashboardPage as DashboardPage };
