'use client';

import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getStudioSession } from '@/lib/auth/studio-session';
import { ApiClient, type MemberApiRecord } from '@/lib/api-client';
import { formatInr } from '@/lib/localization/india';

export const currentAdminStudio = {
  get name(): string {
    if (typeof window !== 'undefined') {
      try {
        const customName = window.localStorage.getItem('fitness-studio-branding-name');
        if (customName && customName.trim()) return customName.trim();
        const raw = window.localStorage.getItem('ws_staff_user');
        if (raw) {
          const user = JSON.parse(raw);
          if (user.studioName) return user.studioName;
        }
      } catch {}
    }
    return 'Your Studio';
  },
  city: '',
  branch: '',
  locationLine: 'Active workspace',
  isSample: false,
};
export const currentStaffStudio = currentAdminStudio;

export const adminAssistantPrompts = [
  'Which memberships need follow-up this week?',
  'Which classes have the most open capacity?',
  'Summarize today’s studio schedule.',
  'What activity should the front desk review?',
  'How do I find an existing member?',
] as const;
export const staffAssistantPrompts = adminAssistantPrompts;

export const adminAssistantName = 'Aura';
export const staffAssistantName = adminAssistantName;

export function adminAssistantPromptMarker(prompt: string) {
  if (prompt.includes('memberships')) return '⏳';
  if (prompt.includes('classes') || prompt.includes('schedule')) return '📅';
  if (prompt.includes('activity')) return '✨';
  return '👤';
}
export const staffAssistantPromptMarker = adminAssistantPromptMarker;

export type AdminMember = { id: string; name: string; email: string; phone: string; plan: string; status: string; joined: string; expiry: string; visits: string; lastVisit: string; coach: string; trainerUserId?: string | null; renewalFollowUp?: string };
export type AdminFreezeRequest = { id: string; memberEmail: string; requestedOn: string; days: 7 | 14; reason: 'Travelling / Vacation' | 'Medical Recovery / Injury'; status: 'Pending' | 'Approved' | 'Declined'; reviewedOn?: string; decisionNote?: string };
export type AdminPlan = { id: string; name: string; planType: 'Monthly' | 'Quarterly' | 'Annual' | 'Not configured'; active: boolean; price?: number; sessionLimit?: string; benefits?: string; description?: string };
export type AdminClassStatus = 'Scheduled' | 'Cancelled';
export type AdminStudioClass = { id: string; name: string; category: string; date: string; startTime: string; endTime: string; trainer: string; room: string; capacity: number; status: AdminClassStatus; sessionStatus?: 'Scheduled' | 'In Progress' | 'Completed'; description?: string };
export type AdminBookingStatus = 'Confirmed' | 'Waitlisted' | 'Cancelled';
export type AdminClassBooking = { id: string; memberId: string; classId: string; status: AdminBookingStatus; bookedAt: string };
export type AdminAttendanceStatus = 'Present' | 'Late' | 'Absent';
export type AdminClassAttendance = { id: string; bookingId: string; status: AdminAttendanceStatus; checkedInAt: string | null };
export type FeedbackCategory = 'Trainer' | 'Staff' | 'General';
export type FeedbackReviewStatus = 'Awaiting Review' | 'Reviewed' | 'Resolved' | 'New';

export type AdminSessionFeedback = {
  id: string;
  sessionId: string;
  trainerName: string;
  memberId: string;
  rating: number;
  strengths: string[];
  improvements: string[];
  comment: string;
  submittedAt: string;
  reviewStatus: FeedbackReviewStatus;
  followUpNote: string;
  source?: 'Member portal' | 'Trainer studio';
  category?: FeedbackCategory;
  trainerId?: string;
  staffId?: string;
  staffName?: string;
};
export type AdminService = { id: string; name: string; description: string; category: string; durationMinutes: number; price: number; currency: 'INR'; trainer: string; location: string; capacity: number | null; active: boolean; archived: boolean; createdAt: string; updatedAt: string };
export type AdminPass = { id: string; name: string; description: string; price: number; currency: 'INR'; validityDays: number; includedCredits: number; eligibleServiceIds: string[]; active: boolean; createdAt: string; updatedAt: string };
export type AdminTrainerReadiness = { roomReady: boolean; equipmentReady: boolean; attendanceDeskReady: boolean; trainerPrepared: boolean };
export type AdminPaymentStatus = 'Paid' | 'Pending' | 'Review' | 'Failed' | 'Refunded' | 'Partially Refunded';
export type AdminPayment = { id?: string; ref: string; memberId: string; type: string; date: string; amount: number; currency: 'INR'; method: string; status: AdminPaymentStatus; refundedAmount: number; notes: string; source: 'Live API' | 'Pending save' | 'Manual preview' };
export type AdminEvent = { id: string; title: string; category: string; description: string; startAt: string; endAt: string; venue: string; organizer: string; capacity: number | null; cancelled: boolean; published?: boolean; coverImageUrl?: string; videoUrl?: string };
export type AdminEventRegistration = { id: string; eventId: string; memberId: string; registeredAt: string; status: 'Registered' | 'Cancelled'; checkedInAt: string | null };
export type AdminLeadStage = 'New enquiry' | 'Trial booked' | 'Trial completed' | 'Follow-up' | 'Converted';
export type AdminLead = { id: string; name: string; contact: string; phone: string; email: string; source: string; stage: AdminLeadStage; followUpDate: string; assigned: string; plan: string; notes: string; outcome: string; followUpHistory?: { date: string; note: string }[] };
export type AdminNotification = { id: string; title: string; detail: string; category: string; createdAt: string; unread: boolean };

export type StaffMember = AdminMember;
export type StaffFreezeRequest = AdminFreezeRequest;
export type StaffPlan = AdminPlan;
export type StaffClassStatus = AdminClassStatus;
export type StaffStudioClass = AdminStudioClass;
export type StaffBookingStatus = AdminBookingStatus;
export type StaffClassBooking = AdminClassBooking;
export type StaffAttendanceStatus = AdminAttendanceStatus;
export type StaffClassAttendance = AdminClassAttendance;
export type StaffSessionFeedback = AdminSessionFeedback;
export type StaffService = AdminService;
export type StaffPass = AdminPass;
export type StaffTrainerReadiness = AdminTrainerReadiness;
export type StaffPaymentStatus = AdminPaymentStatus;
export type StaffPayment = AdminPayment;
export type StaffEvent = AdminEvent;
export type StaffEventRegistration = AdminEventRegistration;
export type StaffLeadStage = AdminLeadStage;
export type StaffLead = AdminLead;
export type StaffNotification = AdminNotification;

const localDateOffset = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const parseExpiry = (value: string) => new Date(`${value} 12:00:00`);
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const formatDate = (date: Date) => date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
const format12h = (hhmm: string) => {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return hhmm;
  return `${h % 12 || 12}:${mStr ?? '00'} ${h >= 12 ? 'PM' : 'AM'}`;
};

export type LocalAuraAnswer = {
  topic: string;
  summary: string;
  bullets: string[];
  footnote: string;
  actionHref?: string;
  actionLabel?: string;
};

export function toAdminRoute(href?: string): string | undefined {
  if (!href) return undefined;
  return href
    .replace(/\/staff\/trainer\b/g, '/admin/trainers')
    .replace(/\/staff\/classes-schedule\b/g, '/admin/classes')
    .replace(/\/staff\/ask-ai\b/g, '/admin/ai-assistant')
    .replace(/\/staff\//g, '/admin/');
}

export function generateAdminAuraResponse(
  rawPrompt: string,
  state: Pick<AdminWorkspaceDataValue, 'members' | 'freezeRequests' | 'classes' | 'bookings' | 'attendance' | 'payments' | 'leads' | 'events' | 'eventRegistrations'> & { feedback?: AdminSessionFeedback[] },
  _role: 'admin' | 'staff' | 'trainer' = 'admin',
): LocalAuraAnswer {
  const q = rawPrompt.trim().toLowerCase();
  const todayIso = localDateOffset(0);
  const activeMembers = state.members.filter((m) => m.status === 'Active');
  const pendingFreezes = state.freezeRequests.filter((f) => f.status === 'Pending');
  const scheduledClasses = state.classes.filter((c) => c.status === 'Scheduled');
  const todayClasses = scheduledClasses.filter((c) => c.date === todayIso);
  const confirmedBookings = state.bookings.filter((b) => b.status === 'Confirmed');
  const waitlistedBookings = state.bookings.filter((b) => b.status === 'Waitlisted');
  const totalCapacity = scheduledClasses.reduce((sum, c) => sum + Math.max(0, c.capacity), 0);
  const occupancyPct = totalCapacity > 0 ? Math.round((confirmedBookings.length / totalCapacity) * 100) : 0;
  const presentRecords = state.attendance.filter((a) => a.status === 'Present' || a.status === 'Late');
  const openLeads = state.leads.filter((l) => l.stage !== 'Converted');
  const convertedLeads = state.leads.filter((l) => l.stage === 'Converted');
  const dueLeads = openLeads.filter((l) => l.followUpDate && l.followUpDate <= todayIso);
  const collectedInr = state.payments
    .filter((p) => ['Paid', 'Partially Refunded', 'Refunded'].includes(p.status))
    .reduce((sum, p) => sum + Math.max(0, p.amount - p.refundedAmount), 0);
  const pendingPayments = state.payments.filter((p) => ['Pending', 'Review'].includes(p.status));
  const pendingInr = pendingPayments.reduce((sum, p) => sum + Math.max(0, p.amount - p.refundedAmount), 0);
  const feedbackList = state.feedback ?? [];
  const footnote = 'Computed deterministically from backend records · Read-only analysis.';

  if (
    q.includes('delete') ||
    q.includes('remove') ||
    q.includes('approve freeze') ||
    q.includes('decline freeze') ||
    q.includes('refund') ||
    q.includes('cancel class') ||
    (q.includes('mark') && (q.includes('paid') || q.includes('present') || q.includes('absent')))
  ) {
    const target =
      q.includes('freeze') ? { href: '/admin/memberships', label: 'Open Memberships · Freeze Requests' } :
      q.includes('payment') || q.includes('refund') || q.includes('paid') ? { href: '/admin/payments', label: 'Open Payments Ledger' } :
      q.includes('class') || q.includes('cancel') ? { href: '/admin/classes', label: 'Open Classes & Schedule' } :
      q.includes('present') || q.includes('absent') ? { href: '/admin/attendance', label: 'Open Member Attendance' } :
      { href: '/admin/members', label: 'Open Members Directory' };

    return {
      topic: 'Action Safety Confirmation Required',
      summary: 'Aura AI never mutates or deletes studio records silently. To keep member, billing, and attendance data accurate, please complete this action in the validated workspace view:',
      bullets: [
        `Pending freeze requests (${pendingFreezes.length}) are reviewed exclusively in the Memberships → Freeze Requests queue.`,
        `Class cancellations, attendance check-ins, and payment status updates validate conflicts and record timestamps before saving.`,
        'Use the shortcut below to open the exact workspace control.',
      ],
      footnote,
      actionHref: target.href,
      actionLabel: target.label,
    };
  }

  if (q.includes('feedback') || q.includes('rating') || q.includes('trainer performance') || q.includes('review')) {
    const avg = feedbackList.length ? (feedbackList.reduce((s, r) => s + r.rating, 0) / feedbackList.length).toFixed(1) : null;
    const unreviewed = feedbackList.filter((r) => r.reviewStatus === 'New' || r.reviewStatus === 'Awaiting Review').length;
    return {
      topic: 'Member Feedback & Reviews',
      summary: feedbackList.length
        ? `${feedbackList.length} feedback record${feedbackList.length === 1 ? ' is' : 's are'} recorded (average rating ${avg}/5 · ${unreviewed} awaiting review).`
        : 'No member feedback records have been recorded yet.',
      bullets: feedbackList.length
        ? feedbackList.slice(0, 4).map((f) => `${f.trainerName || f.staffName || 'Studio'} · ${f.rating}/5 (${f.reviewStatus}) — "${f.comment || f.strengths.join(', ') || 'Rated experience'}"`)
        : [
            'Members can submit session feedback from the Member Portal (/member/home), or staff can review submissions in Member Feedback & Reviews (/admin/feedback).',
            'Feedback categorizes automatically across Trainers, Front Desk Staff, and General studio experience.',
          ],
      footnote,
      actionHref: '/admin/feedback',
      actionLabel: 'Open Member Feedback & Reviews',
    };
  }

  if (q.includes('how do i') || q.includes('how to') || q.includes('find') || q.includes('workflow') || q.includes('guide')) {
    return {
      topic: 'Studio Workflow Guide',
      summary: 'Here is how to complete common studio operations in this workspace:',
      bullets: [
        'Find or inspect a member: Open Members (/admin/members), search by name/email/phone, or click a member row to view bookings, attendance, and payment balances.',
        'Convert a CRM lead: Open CRM / Leads (/admin/leads) and click "Convert to Member" to create a linked member profile.',
        'Review freeze requests: Open Memberships (/admin/memberships) → Freeze Requests tab.',
        'Manage bookings & check-ins: Open Bookings (/admin/bookings) and switch between Reservations, Rosters & Waitlists, and Session Check-In tabs in-page.',
      ],
      footnote,
      actionHref: '/admin/knowledge-base',
      actionLabel: 'Browse Knowledge Base',
    };
  }

  if (q.includes('occupancy') || q.includes('class') || q.includes('schedule') || q.includes('session') || q.includes('booking') || q.includes('waitlist') || q.includes('full')) {
    return {
      topic: 'Schedule, Capacity & Waitlists',
      summary: `There are ${scheduledClasses.length} scheduled sessions (${todayClasses.length} today) with ${confirmedBookings.length} confirmed bookings across ${totalCapacity} total seats (${occupancyPct}% overall occupancy).`,
      bullets: [
        ...scheduledClasses.slice(0, 4).map((cls) => {
          const booked = confirmedBookings.filter((b) => b.classId === cls.id).length;
          const waitlisted = waitlistedBookings.filter((b) => b.classId === cls.id).length;
          return `${cls.name} (${format12h(cls.startTime)} · ${cls.room} · ${cls.trainer}): ${booked}/${cls.capacity} confirmed${waitlisted ? ` · ${waitlisted} waitlisted` : ''}`;
        }),
        `Waitlisted bookings: ${waitlistedBookings.length} · Checked-in attendance records: ${presentRecords.length}`,
      ],
      footnote,
      actionHref: '/admin/classes',
      actionLabel: 'Open Classes & Schedule',
    };
  }

  if (q.includes('renew') || q.includes('expir') || q.includes('member') || q.includes('freeze')) {
    const reviewOrPaused = state.members.filter((m) => m.status !== 'Active');
    return {
      topic: 'Members, Renewals & Freeze Queue',
      summary: `${activeMembers.length} of ${state.members.length} studio members are currently Active, with ${pendingFreezes.length} pending freeze request${pendingFreezes.length === 1 ? '' : 's'} in the Memberships queue.`,
      bullets: [
        ...state.members.slice(0, 4).map((m) => `${m.name} (${m.plan}) · Status: ${m.status} · Expiry: ${m.expiry}`),
        pendingFreezes.length > 0
          ? `Pending freeze requests: ${pendingFreezes.map((f) => `${f.memberEmail} (${f.days}d · ${f.reason})`).join('; ')}`
          : 'No pending freeze requests in the queue.',
        reviewOrPaused.length > 0
          ? `Non-active roster profiles needing attention: ${reviewOrPaused.map((m) => `${m.name} (${m.status})`).join(', ')}`
          : 'All listed members are currently active.',
      ],
      footnote,
      actionHref: '/admin/memberships',
      actionLabel: 'Open Memberships & Freeze Queue',
    };
  }

  if (q.includes('lead') || q.includes('crm') || q.includes('trial') || q.includes('follow') || q.includes('conversion')) {
    const rate = state.leads.length ? Math.round((convertedLeads.length / state.leads.length) * 100) : 0;
    return {
      topic: 'CRM & Lead Pipeline',
      summary: `${state.leads.length} leads are tracked (${openLeads.length} open, ${convertedLeads.length} converted · ${rate}% conversion rate). ${dueLeads.length} lead${dueLeads.length === 1 ? '' : 's'} have follow-ups due on or before today.`,
      bullets: [
        ...dueLeads.map((l) => `Due follow-up: ${l.name} (${l.stage} · ${l.source}) — assigned to ${l.assigned} (due ${l.followUpDate})`),
        ...openLeads.filter((l) => !dueLeads.includes(l)).slice(0, 3).map((l) => `Upcoming lead: ${l.name} (${l.stage}) — assigned to ${l.assigned}`),
      ],
      footnote,
      actionHref: '/admin/leads',
      actionLabel: 'Open CRM / Leads',
    };
  }

  if (q.includes('revenue') || q.includes('payment') || q.includes('collect') || q.includes('unsettled') || q.includes('pending') || q.includes('overdue') || q.includes('finance')) {
    const memberMap = new Map(state.members.map((m) => [m.id, m.name]));
    return {
      topic: 'Revenue & Payments',
      summary: `Net collected revenue is ${formatInr(collectedInr)}, with ${formatInr(pendingInr)} across ${pendingPayments.length} pending/review transaction${pendingPayments.length === 1 ? '' : 's'}.`,
      bullets: state.payments.slice(0, 4).map((p) => `${p.ref} · ${memberMap.get(p.memberId) ?? p.memberId} · ${formatInr(p.amount)} (${p.method} · ${p.type}) — ${p.status}`),
      footnote,
      actionHref: '/admin/payments',
      actionLabel: 'Open Payments Ledger',
    };
  }

  if (q.includes('attendance') || q.includes('check-in') || q.includes('checkin') || q.includes('present')) {
    return {
      topic: 'Attendance & Check-ins',
      summary: `${presentRecords.length} check-in${presentRecords.length === 1 ? ' is' : 's are'} recorded (Present/Late) out of ${confirmedBookings.length} confirmed bookings.`,
      bullets: [
        `Confirmed bookings: ${confirmedBookings.length} · Checked in: ${presentRecords.length} · Waitlisted: ${waitlistedBookings.length}`,
        ...todayClasses.map((c) => `${c.name} (${format12h(c.startTime)} · ${c.trainer}): ${confirmedBookings.filter((b) => b.classId === c.id).length}/${c.capacity} booked`),
      ],
      footnote,
      actionHref: '/admin/attendance',
      actionLabel: 'Open Member Attendance',
    };
  }

  if (q.includes('event') || q.includes('workshop')) {
    const activeEvents = state.events.filter((e) => !e.cancelled);
    return {
      topic: 'Studio Events & Workshops',
      summary: `${activeEvents.length} active event${activeEvents.length === 1 ? '' : 's'} and ${state.eventRegistrations.filter((r) => r.status === 'Registered').length} active registration${state.eventRegistrations.length === 1 ? '' : 's'} are recorded.`,
      bullets: activeEvents.length
        ? activeEvents.slice(0, 4).map((e) => `${e.title} (${e.category} · ${e.venue}) — ${e.published ? 'Published' : 'Draft'}`)
        : ['No active studio events are currently scheduled. Create one from Events & Workshops.'],
      footnote,
      actionHref: '/admin/events',
      actionLabel: 'Open Events & Workshops',
    };
  }

  return {
    topic: 'Studio Workspace Snapshot',
    summary: `Here is the current operational summary:`,
    bullets: [
      `Memberships: ${activeMembers.length} active of ${state.members.length} total members · ${pendingFreezes.length} pending freeze request${pendingFreezes.length === 1 ? '' : 's'}`,
      `Schedule & Attendance: ${scheduledClasses.length} scheduled classes · ${confirmedBookings.length} confirmed bookings (${occupancyPct}% occupancy) · ${presentRecords.length} checked in`,
      `CRM Pipeline: ${openLeads.length} open leads (${dueLeads.length} due/overdue for follow-up) · ${convertedLeads.length} converted`,
      `Payments: ${formatInr(collectedInr)} net collected · ${formatInr(pendingInr)} pending or under review`,
    ],
    footnote,
    actionHref: '/admin/dashboard',
    actionLabel: 'Open Admin Dashboard',
  };
}

type FreezeDecision = { ok: boolean; title: string; message: string };
type AdminWorkspaceDataValue = {
  members: AdminMember[];
  setMembers: Dispatch<SetStateAction<AdminMember[]>>;
  membersLoading: boolean;
  membersError: string | null;
  freezeRequests: AdminFreezeRequest[];
  setFreezeRequests: Dispatch<SetStateAction<AdminFreezeRequest[]>>;
  reviewFreeze: (id: string, decision: 'Approved' | 'Declined') => Promise<FreezeDecision>;
  plans: AdminPlan[];
  setPlans: Dispatch<SetStateAction<AdminPlan[]>>;
  services: AdminService[];
  setServices: Dispatch<SetStateAction<AdminService[]>>;
  passes: AdminPass[];
  setPasses: Dispatch<SetStateAction<AdminPass[]>>;
  classes: AdminStudioClass[];
  setClasses: Dispatch<SetStateAction<AdminStudioClass[]>>;
  bookings: AdminClassBooking[];
  setBookings: Dispatch<SetStateAction<AdminClassBooking[]>>;
  attendance: AdminClassAttendance[];
  setAttendance: Dispatch<SetStateAction<AdminClassAttendance[]>>;
  feedback: AdminSessionFeedback[];
  setFeedback: Dispatch<SetStateAction<AdminSessionFeedback[]>>;
  trainerReadiness: Record<string, AdminTrainerReadiness>;
  setTrainerReadiness: Dispatch<SetStateAction<Record<string, AdminTrainerReadiness>>>;
  trainerSessionNotes: Record<string, string>;
  setTrainerSessionNotes: Dispatch<SetStateAction<Record<string, string>>>;
  payments: AdminPayment[];
  setPayments: Dispatch<SetStateAction<AdminPayment[]>>;
  paymentsUnavailable: boolean;
  setPaymentsUnavailable: Dispatch<SetStateAction<boolean>>;
  events: AdminEvent[];
  setEvents: Dispatch<SetStateAction<AdminEvent[]>>;
  eventRegistrations: AdminEventRegistration[];
  setEventRegistrations: Dispatch<SetStateAction<AdminEventRegistration[]>>;
  leads: AdminLead[];
  setLeads: Dispatch<SetStateAction<AdminLead[]>>;
  notifications: AdminNotification[];
  setNotifications: Dispatch<SetStateAction<AdminNotification[]>>;
  refresh: () => Promise<void>;
};

const AdminWorkspaceDataContext = createContext<AdminWorkspaceDataValue | null>(null);

function mapMember(record: MemberApiRecord): AdminMember {
  const source = record as MemberApiRecord & Record<string, unknown>;
  const joinedValue = String(source.joined ?? source.join_date ?? '');
  const expiryValue = String(source.expiry ?? '');
  return {
    id: record.id,
    name: String(source.fullName ?? source.full_name ?? 'Unnamed Member'),
    email: String(source.email ?? ''),
    phone: String(source.phone ?? ''),
    plan: String(source.plan ?? (source.membership_id ? 'Active Plan' : 'No Plan')),
    status:
      record.status === 'frozen'
        ? 'Frozen'
        : record.status === 'inactive'
          ? 'Inactive'
          : 'Active',
    joined: joinedValue
      ? new Date(joinedValue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Not set',
    expiry: expiryValue ? new Date(expiryValue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not set',
    visits: '0',
    lastVisit: 'Not yet',
    coach: String(source.coach ?? 'Unassigned'),
    trainerUserId: source.trainerUserId ? String(source.trainerUserId) : source.trainer_user_id ? String(source.trainer_user_id) : null,
  };
}

const isoDate = (value: unknown) => value ? new Date(String(value)).toISOString().slice(0, 10) : '';
const text = (value: unknown, fallback = '') => value === null || value === undefined ? fallback : String(value);

function mapClass(row: Record<string, unknown>): AdminStudioClass {
  return {
    id: text(row.id), name: text(row.name), category: text(row.category), date: isoDate(row.date),
    startTime: text(row.startTime ?? row.start_time), endTime: text(row.endTime ?? row.end_time),
    trainer: text(row.trainer), room: text(row.room), capacity: Number(row.capacity ?? 0),
    status: text(row.status, 'Scheduled') === 'Cancelled' ? 'Cancelled' : 'Scheduled',
  };
}

function mapLead(row: Record<string, unknown>): AdminLead {
  const email = text(row.email);
  const phone = text(row.phone);
  return {
    id: text(row.id), name: text(row.name ?? row.full_name), email, phone,
    contact: email || phone, source: text(row.source), stage: text(row.stage ?? row.status, 'New enquiry') as AdminLeadStage,
    followUpDate: isoDate(row.followUpDate ?? row.follow_up_date), assigned: text(row.assigned ?? row.assigned_to, 'Unassigned'),
    plan: text(row.plan, 'Not specified'), notes: text(row.notes), outcome: text(row.outcome),
  };
}

function mapPayment(row: Record<string, unknown>): AdminPayment {
  return {
    id: text(row.id), ref: text(row.ref), memberId: text(row.memberId ?? row.member_id), type: text(row.type), date: isoDate(row.date),
    amount: Number(row.amount ?? 0), currency: 'INR', method: text(row.method),
    status: text(row.status, 'Pending') as AdminPaymentStatus,
    refundedAmount: Number(row.refundedAmount ?? row.refunded_amount ?? 0), notes: text(row.notes), source: 'Live API',
  };
}

function mapPlan(row: Record<string, unknown>): AdminPlan {
  const planType = text(row.planType ?? row.plan_type, 'Not configured') as AdminPlan['planType'];
  return {
    id: text(row.id), name: text(row.name), planType,
    active: row.active !== false && text(row.active).toLowerCase() !== 'inactive',
    price: Number(row.priceINR ?? row.price_inr ?? row.price ?? 0),
    sessionLimit: text(row.sessionLimit ?? row.session_limit), benefits: text(row.benefits),
  };
}

function mapBooking(row: Record<string, unknown>): AdminClassBooking {
  return {
    id: text(row.id), memberId: text(row.memberId ?? row.member_id), classId: text(row.classId ?? row.class_id),
    status: text(row.status, 'Confirmed') as AdminBookingStatus,
    bookedAt: text(row.bookedAt ?? row.booked_at),
  };
}

function mapAttendance(row: Record<string, unknown>): AdminClassAttendance {
  return {
    id: text(row.id), bookingId: text(row.bookingId ?? row.booking_id),
    status: text(row.status, 'Present') as AdminAttendanceStatus,
    checkedInAt: row.checkedInAt || row.checked_in_at ? text(row.checkedInAt ?? row.checked_in_at) : null,
  };
}

function mapEvent(row: Record<string, unknown>): AdminEvent {
  return {
    id: text(row.id), title: text(row.title), category: text(row.category), description: text(row.description),
    startAt: text(row.startAt ?? row.start_at), endAt: text(row.endAt ?? row.end_at), venue: text(row.venue),
    organizer: text(row.organizer), capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    cancelled: row.cancelled === true || text(row.cancelled).toLowerCase() === 'true',
    published: row.published === true || text(row.published).toLowerCase() === 'true',
  };
}

export function AdminWorkspaceDataProvider({ children }: { children: React.ReactNode }) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [freezeRequests, setFreezeRequests] = useState<AdminFreezeRequest[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [services, setServices] = useState<AdminService[]>([]);
  const [passes, setPasses] = useState<AdminPass[]>([]);
  const [classes, setClasses] = useState<AdminStudioClass[]>([]);
  const [bookings, setBookings] = useState<AdminClassBooking[]>([]);
  const [attendance, setAttendance] = useState<AdminClassAttendance[]>([]);
  const [feedback, setFeedback] = useState<AdminSessionFeedback[]>([]);
  const [trainerReadiness, setTrainerReadiness] = useState<Record<string, AdminTrainerReadiness>>({});
  const [trainerSessionNotes, setTrainerSessionNotes] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [paymentsUnavailable, setPaymentsUnavailable] = useState(false);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventRegistrations, setEventRegistrations] = useState<AdminEventRegistration[]>([]);
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const reviewedRequests = useRef(new Set<string>());

  async function refresh() {
    setMembersLoading(true);
    setMembersError(null);

    try {
      const [membersRes, leadsRes, classesRes, bookingsRes, attendanceRes, paymentsRes, eventsRes, membershipsRes, freezeRes, feedbackRes] = await Promise.allSettled([
        ApiClient.getMembers(),
        ApiClient.getLeads(),
        ApiClient.getClasses(),
        ApiClient.getBookings(),
        ApiClient.getAttendance(),
        ApiClient.getPayments(),
        ApiClient.getEvents(),
        ApiClient.getMemberships(),
        ApiClient.getFreezeRequests().catch(() => []),
        ApiClient.getFeedback().catch(() => []),
      ]);

      if (membersRes.status === 'fulfilled') {
        const records = membersRes.value as MemberApiRecord[];
        setMembers(records.map(mapMember));
      } else setMembers([]);
      if (leadsRes.status === 'fulfilled') setLeads((leadsRes.value as Record<string, unknown>[]).map(mapLead)); else setLeads([]);
      if (classesRes.status === 'fulfilled') setClasses((classesRes.value as unknown as Record<string, unknown>[]).map(mapClass)); else setClasses([]);
      if (bookingsRes.status === 'fulfilled') setBookings((bookingsRes.value as Record<string, unknown>[]).map(mapBooking)); else setBookings([]);
      if (attendanceRes.status === 'fulfilled') setAttendance((attendanceRes.value as Record<string, unknown>[]).map(mapAttendance)); else setAttendance([]);
      if (paymentsRes.status === 'fulfilled') {
        const paymentsResult = paymentsRes.value as { data: any[]; unavailable?: boolean };
        setPayments((paymentsResult.data as Record<string, unknown>[]).map(mapPayment));
        if (paymentsResult.unavailable) {
          setMembersError('Payments service is temporarily unavailable. Some features may be limited.');
        }
      } else setPayments([]);
      if (eventsRes.status === 'fulfilled') setEvents((eventsRes.value as Record<string, unknown>[]).map(mapEvent)); else setEvents([]);
      if (membershipsRes.status === 'fulfilled') setPlans((membershipsRes.value as Record<string, unknown>[]).map(mapPlan));
      else setPlans([]);
      if (freezeRes.status === 'fulfilled') {
        const memberEmail = new Map((membersRes.status === 'fulfilled' ? membersRes.value : []).map((member) => [String(member.id), String(member.email)]));
        setFreezeRequests((freezeRes.value as Record<string, unknown>[]).map((row) => ({
          id: text(row.id), memberEmail: memberEmail.get(text(row.memberId ?? row.member_id)) ?? text(row.memberId ?? row.member_id),
          requestedOn: text(row.createdAt ?? row.created_at).slice(0, 10), days: Number(row.days) as 7 | 14,
          reason: text(row.reason) as AdminFreezeRequest['reason'], status: text(row.status, 'Pending') as AdminFreezeRequest['status'],
          reviewedOn: text(row.reviewedAt ?? row.reviewed_at).slice(0, 10) || undefined, decisionNote: text(row.decisionNote ?? row.decision_note) || undefined,
        })));
      } else setFreezeRequests([]);
      if (feedbackRes.status === 'fulfilled') setFeedback((feedbackRes.value as Record<string, unknown>[]).map((row) => ({
        id: text(row.id), sessionId: text(row.sessionId ?? row.session_id), trainerName: '', memberId: text(row.memberId ?? row.member_id),
        rating: Number(row.rating), strengths: Array.isArray(row.strengths) ? row.strengths.map(String) : [], improvements: Array.isArray(row.improvements) ? row.improvements.map(String) : [],
        comment: text(row.comment), submittedAt: text(row.createdAt ?? row.created_at), reviewStatus: text(row.reviewStatus ?? row.review_status, 'New') as FeedbackReviewStatus,
        followUpNote: text(row.followUpNote ?? row.follow_up_note), trainerId: text(row.trainerUserId ?? row.trainer_user_id) || undefined,
      })));

      const isTierForbidden = (reason: unknown) => {
        const msg = reason instanceof Error ? reason.message : String(reason ?? '');
        return msg.includes('403') || msg.toLowerCase().includes('is required for') || msg.toLowerCase().includes('forbidden');
      };

      const rejected = [membersRes, leadsRes, classesRes, bookingsRes, attendanceRes, paymentsRes, eventsRes, membershipsRes]
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected' && !isTierForbidden(result.reason));
      if (rejected.length) {
        setMembersError(`${rejected.length} workspace dataset${rejected.length === 1 ? '' : 's'} could not be loaded. Retry before making operational decisions.`);
      }
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : 'Failed to load workspace data.');
    } finally {
      setMembersLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function reviewFreeze(id: string, decision: 'Approved' | 'Declined'): Promise<FreezeDecision> {
    const session = getStudioSession();
    if (!session || !['admin', 'owner'].includes(session.role)) {
      return {
        ok: false,
        title: 'Admin authorization required',
        message: 'Only Studio Admin is authorized to approve or reject membership freeze requests and adjust membership dates.',
      };
    }
    const request = freezeRequests.find((item) => item.id === id);
    if (!request || request.status !== 'Pending' || reviewedRequests.current.has(id)) return { ok: false, title: 'Request already reviewed', message: 'This request is no longer pending.' };
    const member = members.find((item) => item.email === request.memberEmail);
    if (!member) return { ok: false, title: 'Request cannot be reviewed', message: 'The associated member record is not available.' };
    const decisionDate = new Date().toISOString().slice(0, 10);
    try {
      await ApiClient.reviewFreezeRequest(id, decision);
    } catch (error) {
      return { ok: false, title: 'Review failed', message: error instanceof Error ? error.message : 'The freeze request could not be reviewed.' };
    }
    if (decision === 'Approved') {
      const currentExpiry = parseExpiry(member.expiry);
      if (!Number.isFinite(currentExpiry.getTime()) || ![7, 14].includes(request.days) || member.status !== 'Active') return { ok: false, title: 'Request is not eligible', message: 'Approval requires an active member and a valid 7- or 14-day request with a known expiry.' };
      const end = addDays(new Date(`${request.requestedOn}T12:00:00`), request.days - 1);
      const expiry = addDays(currentExpiry, request.days);
      const note = `Membership paused through ${formatDate(end)}; validity extended ${request.days} days to ${formatDate(expiry)}.`;
      setMembers((current) => current.map((item) => item.id === member.id ? { ...item, status: 'Paused', expiry: formatDate(expiry) } : item));
      reviewedRequests.current.add(id);
      setFreezeRequests((current) => current.map((item) => item.id === id ? { ...item, status: decision, reviewedOn: decisionDate, decisionNote: note } : item));
      return { ok: true, title: 'Freeze approved', message: `${member.name} is Paused through ${formatDate(end)}. Validity extended ${request.days} days.` };
    }
    reviewedRequests.current.add(id);
    const declineNote = 'Declined by Studio Admin; membership status and expiry remain unchanged.';
    setFreezeRequests((current) => current.map((item) => item.id === id ? { ...item, status: decision, reviewedOn: decisionDate, decisionNote: declineNote } : item));
    return { ok: true, title: 'Request declined', message: `${member.name} remains unchanged.` };
  }

  return (
    <AdminWorkspaceDataContext.Provider
      value={{
        members,
        setMembers,
        membersLoading,
        membersError,
        freezeRequests,
        setFreezeRequests,
        reviewFreeze,
        plans,
        setPlans,
        services,
        setServices,
        passes,
        setPasses,
        classes,
        setClasses,
        bookings,
        setBookings,
        attendance,
        setAttendance,
        feedback,
        setFeedback,
        trainerReadiness,
        setTrainerReadiness,
        trainerSessionNotes,
        setTrainerSessionNotes,
        payments,
        setPayments,
        paymentsUnavailable,
        setPaymentsUnavailable,
        events,
        setEvents,
        eventRegistrations,
        setEventRegistrations,
        leads,
        setLeads,
        notifications,
        setNotifications,
        refresh,
      }}
    >
      {membersError && (
        <div role="alert" className="mx-auto mb-4 flex max-w-7xl flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
          <p>{membersError} The empty tables may be incomplete until the connection is restored.</p>
          <button type="button" onClick={() => void refresh()} disabled={membersLoading} className="min-h-9 rounded-lg border border-rose-300 bg-white px-3 font-semibold disabled:opacity-50 dark:border-rose-800 dark:bg-studio-900">
            {membersLoading ? 'Retrying…' : 'Retry data load'}
          </button>
        </div>
      )}
      {children}
    </AdminWorkspaceDataContext.Provider>
  );
}

export function useAdminWorkspaceData() {
  const context = useContext(AdminWorkspaceDataContext);
  if (!context) throw new Error('useAdminWorkspaceData must be used inside AdminWorkspaceDataProvider');
  return context;
}
