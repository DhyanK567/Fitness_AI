/**
 * Wellness Studio OS — Frontend API Client
 * Interfacing with NestJS API Gateway (Default: http://localhost:3001)
 * Standardized with global /api/v1 prefix and tenant context header
 */

import { resolveClientTenantHost } from '@/lib/tenant';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
).replace(/\/+$/, '');

export interface MemberApiRecord {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  join_date: string;
  status: 'active' | 'inactive' | 'frozen';
  membership_id?: string | null;
  profile_photo_url?: string | null;
  emergency_contact: string;
  trainerUserId?: string | null;
  trainer_user_id?: string | null;
}

function unwrapApiResult<T>(result: unknown): T {
  let current = result;
  // Some legacy modules return their own ToolResult inside the gateway's
  // standard response envelope. Unwrap both layers consistently.
  for (let depth = 0; depth < 2 && current && typeof current === 'object' && 'success' in current; depth += 1) {
    const envelope = current as {
      success: boolean;
      data?: unknown;
      error?: { message?: string } | string;
      message?: string;
    };

    if (!envelope.success) {
      const errorMessage =
        typeof envelope.error === 'string'
          ? envelope.error
          : envelope.error?.message || envelope.message;

      throw new Error(errorMessage || 'The API operation failed.');
    }
    current = envelope.data;
  }
  return current as T;
}

export interface ClassItem {
  id: string;
  name: string;
  category: string;
  trainer_id: string;
  duration_mins: number;
  capacity: number;
  location?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
}

export interface BookingItem {
  id: string;
  member_id: string;
  class_schedule_id: string;
  booking_date: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  booked_at: string;
  payment_id?: string | null;
  class_name?: string;
  location?: string;
  instructor?: string;
}

export interface LeadPayload {
  full_name: string;
  phone: string;
  email?: string;
  source?: string;
  status?: string;
  stage?: string;
  plan?: string | null;
  notes?: string;
  follow_up_date?: string | null;
  followUpDate?: string;
  assigned_to?: string | null;
}

export interface PublicEnquiryPayload {
  full_name: string;
  phone: string;
  email?: string;
}

export interface RecommendationItem {
  sessionId: string;
  session_id?: string;
  className: string;
  class_name?: string;
  category: string;
  trainer: string;
  date: string;
  session_date?: string;
  startTime: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  availableSpots: number;
  available_spots?: number;
  matchScore: number;
  match_score?: number;
  reason: string;
  bookHref?: string;
  book_href?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
}

export interface PaymentItem {
  ref: string;
  date: string;
  memberId: string;
  type: string;
  method: string;
  status: string;
  amount: number;
  currency: string;
  refundedAmount: number;
  notes: string;
}

export type TrainerOverview = {
  trainer: { id: string; displayName: string; email?: string | null; phoneE164?: string | null };
  studio: { id: string; code: string; name: string; timezone: string; currency: string; tier: string; tierName: string };
  members: Array<{ id: string; fullName: string; email: string; phone: string; plan: string; status: string; joined: string; expiry?: string | null }>;
  sessions: Array<{ id: string; name: string; category: string; date: string; startTime: string; endTime?: string | null; trainer: string; room?: string | null; capacity: number; status: string }>;
  bookings: Array<{ id: string; classId: string; memberId: string; status: string; bookedAt: string }>;
  attendance: Array<{ id: string; bookingId: string; status: string; checkedInAt?: string | null }>;
  workouts: Array<{ id: string; memberId: string; title: string; goal?: string | null; exercises: unknown; active: boolean; updatedAt: string }>;
  progress: Array<{ id: string; memberId: string; recordedAt: string; metrics: unknown; notes?: string | null; milestone?: string | null; updatedAt: string }>;
  feedback: Array<{ id: string; memberId: string; sessionId?: string | null; rating: number; strengths: string[]; improvements: string[]; comment?: string | null; reviewStatus: string; createdAt: string }>;
};

export type EmployeeWorkspaceIdentity = {
  user: { id: string; displayName: string; email?: string | null; phoneE164?: string | null };
  studio: { id: string; code: string; name: string; timezone: string; currency: string; tier: string; tierName: string };
};

export type FrontDeskOverview = EmployeeWorkspaceIdentity & {
  members: Array<{ id: string; fullName: string; email: string; phone: string; plan: string; status: string; joined: string; expiry?: string | null }>;
  sessions: Array<{ id: string; name: string; category: string; date: string; startTime: string; endTime?: string | null; trainer: string; room?: string | null; capacity: number; status: string }>;
  bookings: Array<{ id: string; classId: string; memberId: string; status: string; bookedAt: string }>;
  attendance: Array<{ id: string; bookingId: string; status: string; checkedInAt?: string | null }>;
};

export type BillingOverview = EmployeeWorkspaceIdentity & {
  members: Array<{ id: string; fullName: string; email: string; phone: string; status: string }>;
  payments: Array<{ id: string; ref: string; date: string; memberId: string; type: string; method: string; status: string; amount: number; refundedAmount: number; notes?: string | null }>;
  totals: { collected: number; pending: number; refunded: number };
};

export type LeadTrainerOverview = EmployeeWorkspaceIdentity & {
  trainers: Array<{ id: string; displayName: string; email?: string | null; phoneE164?: string | null; lastLoginAt?: string | null; role: string }>;
  members: Array<{ id: string; fullName: string; email: string; phone: string; plan: string; status: string; trainerUserId?: string | null }>;
  sessions: Array<{ id: string; name: string; category: string; date: string; startTime: string; endTime?: string | null; trainer: string; room?: string | null; capacity: number; status: string }>;
  feedback: Array<{ id: string; memberId: string; trainerUserId: string; sessionId?: string | null; rating: number; strengths: string[]; improvements: string[]; comment?: string | null; reviewStatus: string; createdAt: string }>;
};

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

export type DuplicatePolicy = 'skip' | 'update';

export function canonicalizeImportRows(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const fieldNames: Record<string, string> = {
    fullname: 'name',
    full_name: 'name',
    followupdate: 'followUpDate',
    starttime: 'startTime',
    endtime: 'endTime',
    priceinr: 'priceINR',
    plantype: 'planType',
    plan_type: 'planType',
    sessionlimit: 'sessionLimit',
    memberid: 'memberId',
    classid: 'classId',
    bookingid: 'bookingId',
    checkedinat: 'checkedInAt',
    refundedamount: 'refundedAmount',
    startat: 'startAt',
    endat: 'endAt',
  };
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [fieldNames[key.toLowerCase()] ?? key, value]),
    ),
  );
}

export type ExportDataset =
  | 'members'
  | 'leads'
  | 'classes'
  | 'memberships'
  | 'bookings'
  | 'attendance'
  | 'payments'
  | 'events';

export class ApiClient {
  public static getBaseUrl(): string {
    return API_BASE_URL;
  }

  public static getEndpoint(path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return clean.startsWith('/api/v1') ? `${API_BASE_URL}${clean}` : `${API_BASE_URL}/api/v1${clean}`;
  }

  private static async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('ws_staff_token') ??
          localStorage.getItem('ws_member_token')
        : null;
    const tenantHost = resolveClientTenantHost();
    const isFormData = typeof FormData !== 'undefined' && options?.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(tenantHost ? { 'x-tenant-host': tenantHost } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers as Record<string, string>),
    };

    const url = this.getEndpoint(endpoint);

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = null;
      }
      const rawMessage =
        errBody?.message ||
        errBody?.error?.message ||
        errBody?.error ||
        `API error ${res.status}: ${res.statusText}`;
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
      throw new Error(message);
    }

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return (await res.json()) as T;
  }

  private static async sessionRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(endpoint, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options?.headers as Record<string, string>) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const raw = payload?.message ?? payload?.error?.message ?? payload?.error ?? 'The workspace request failed.';
      throw new Error(Array.isArray(raw) ? raw.join(', ') : String(raw));
    }
    return payload as T;
  }

  // Members API
  static async getMembers(): Promise<MemberApiRecord[]> {
    const result = await this.request<unknown>('/members');
    const data = unwrapApiResult<unknown>(result);

    if (Array.isArray(data)) return data as MemberApiRecord[];

    if (
      data &&
      typeof data === 'object' &&
      'members' in data &&
      Array.isArray((data as { members: unknown[] }).members)
    ) {
      return (data as { members: MemberApiRecord[] }).members;
    }

    throw new Error('Unexpected members API response.');
  }

  static async createMember(
    payload: Omit<MemberApiRecord, 'id'>,
  ): Promise<MemberApiRecord> {
    const result = await this.request<unknown>('/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<MemberApiRecord>(result);
  }

  static async updateMember(
    id: string,
    payload: Partial<Omit<MemberApiRecord, 'id'>>,
  ): Promise<MemberApiRecord> {
    const result = await this.request<unknown>(
      `/members/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    );
    return unwrapApiResult<MemberApiRecord>(result);
  }

  static async assignMemberTrainer(id: string, trainerUserId: string | null): Promise<MemberApiRecord> {
    const result = await this.request<unknown>(`/members/${encodeURIComponent(id)}/trainer`, {
      method: 'PATCH',
      body: JSON.stringify({ trainer_user_id: trainerUserId }),
    });
    return unwrapApiResult<MemberApiRecord>(result);
  }

  // Classes API (Public / Member catalogue)
  static async getClasses(): Promise<ClassItem[]> {
    const result = await this.request<unknown>('/classes');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as ClassItem[];
    if (data && typeof data === 'object' && 'classes' in data) {
      return (data as { classes: ClassItem[] }).classes;
    }
    return [];
  }

  static async getClassById(id: string): Promise<ClassItem | null> {
    return this.request<ClassItem>(`/classes/${id}`);
  }

  // Bookings API
  static async getMemberBookings(memberId: string): Promise<BookingItem[]> {
    return this.request<BookingItem[]>(`/bookings?member_id=${encodeURIComponent(memberId)}`);
  }

  static async createBooking(payload: {
    member_id?: string;
    class_schedule_id: string;
    booking_date: string;
    payment_id?: string | null;
  }): Promise<BookingItem> {
    return this.request<BookingItem>('/bookings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async cancelBooking(id: string): Promise<BookingItem> {
    return this.request<BookingItem>(`/bookings/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    });
  }

  // Member Portal Dedicated APIs
  static async getMyPayments(): Promise<any[]> {
    const result = await this.request<unknown>('/payments/my-payments');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'payments' in data) {
      return (data as { payments: any[] }).payments;
    }
    return [];
  }

  static async getMyAttendance(memberId?: string): Promise<any[]> {
    const path = memberId ? `/attendance/member/${encodeURIComponent(memberId)}` : '/attendance';
    const result = await this.request<unknown>(path);
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'attendance' in data) {
      return (data as { attendance: any[] }).attendance;
    }
    return [];
  }

  static async getMembershipPlans(): Promise<any[]> {
    const result = await this.request<unknown>('/memberships/plans');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'plans' in data) {
      return (data as { plans: any[] }).plans;
    }
    return [];
  }

  static async getMyMembership(): Promise<any[]> {
    const result = await this.request<unknown>('/memberships/me');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data;
    return data ? [data] : [];
  }

  static async getMyReferral(): Promise<any> {
    const result = await this.request<unknown>('/referrals/my-referral');
    return unwrapApiResult<unknown>(result);
  }

  static async validateReferralCode(referral_code: string, plan_id?: string): Promise<any> {
    const result = await this.request<unknown>('/referrals/validate', {
      method: 'POST',
      body: JSON.stringify({ referral_code, plan_id }),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async updateMemberProfile(payload: { full_name?: string; emergency_contact?: string }): Promise<any> {
    const result = await this.request<unknown>('/members/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<any>(result);
  }

  static async changeMemberPassword(payload: { current_password: string; new_password: string }): Promise<any> {
    const result = await this.request<unknown>('/auth/member/password/change', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<any>(result);
  }

  static async changeStaffPassword(payload: { current_password: string; new_password: string }): Promise<any> {
    const result = await this.request<unknown>('/auth/password/change', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<any>(result);
  }

  // Public Lead Enquiry API (Document 5 Section 3 & PublicEnquiryController)
  static async createPublicEnquiry(
    payload: PublicEnquiryPayload,
  ): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>('/leads/public', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // ============================================================================
  // Import / Export API
  // ============================================================================

  static async importDataset(
    dataset: ExportDataset,
    source: Array<Record<string, unknown>> | string | File,
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    let body: BodyInit;
    const isFile = typeof File !== 'undefined' && source instanceof File;
    if (isFile) {
      const form = new FormData();
      form.append('file', source);
      form.append('dryRun', String(dryRun));
      form.append('duplicatePolicy', duplicatePolicy);
      body = form;
    } else {
      body = JSON.stringify({
        ...(typeof source === 'string'
          ? { rawCsv: source }
          : { rows: canonicalizeImportRows(source as Array<Record<string, unknown>>) }),
        dryRun,
        duplicatePolicy,
      });
    }
    const result = await this.request<unknown>(`/import-export/import/${dataset}`, { method: 'POST', body });
    return unwrapApiResult<ImportResult>(result);
  }

  static async importMembers(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('members', rows, { dryRun, duplicatePolicy });
  }

  static async importLeads(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('leads', rows, { dryRun, duplicatePolicy });
  }

  static async importClasses(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('classes', rows, { dryRun, duplicatePolicy });
  }

  static async importMemberships(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('memberships', rows, { dryRun, duplicatePolicy });
  }

  static async importBookings(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('bookings', rows, { dryRun, duplicatePolicy });
  }

  static async importAttendance(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('attendance', rows, { dryRun, duplicatePolicy });
  }

  static async importPayments(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('payments', rows, { dryRun, duplicatePolicy });
  }

  static async importEvents(
    rows: any[],
    { dryRun = false, duplicatePolicy = 'skip' }: { dryRun?: boolean; duplicatePolicy?: DuplicatePolicy } = {},
  ): Promise<ImportResult> {
    return this.importDataset('events', rows, { dryRun, duplicatePolicy });
  }

  static async exportDataset(
    dataset: ExportDataset,
    {
      format = 'json',
      page = 1,
      limit = 100,
      from,
      to,
      status,
    }: {
      format?: string;
      page?: number;
      limit?: number;
      from?: string;
      to?: string;
      status?: string;
    } = {},
  ): Promise<{ data: any[]; count: number; format: string }> {
    const params = new URLSearchParams({
      dataset,
      format,
      page: String(page),
      limit: String(limit),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(status ? { status } : {}),
    });
    const result = await this.request<unknown>(
      `/import-export/export/${dataset}?${params}`,
    );
    return unwrapApiResult<{ data: any[]; count: number; format: string }>(result);
  }

  static async downloadDatasetCsv(dataset: ExportDataset): Promise<{ blob: Blob; fileName: string }> {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ws_staff_token') : null;
    const tenantHost = resolveClientTenantHost();
    const response = await fetch(this.getEndpoint(`/import-export/export/${dataset}?format=csv&limit=5000`), {
      headers: {
        ...(tenantHost ? { 'x-tenant-host': tenantHost } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error?.message ?? payload?.message ?? `Export failed (${response.status})`);
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `${dataset}.csv`;
    return { blob: await response.blob(), fileName };
  }

  // ============================================================================
  // CRM Leads API (read)
  // ============================================================================

  static async getLeads(): Promise<any[]> {
    const result = await this.request<unknown>('/leads');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'leads' in data) {
      return (data as { leads: any[] }).leads;
    }
    return [];
  }

  static async getMemberships(): Promise<any[]> {
    const result = await this.request<unknown>('/memberships');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'memberships' in data) {
      return (data as { memberships: any[] }).memberships;
    }
    return [];
  }

  static async createMembership(payload: {
    name: string;
    planType: string;
    price: number;
    sessionLimit?: number | string;
    benefits?: string;
    description?: string;
    active?: boolean;
  }): Promise<any> {
    const result = await this.request<unknown>('/memberships', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async updateMembership(
    id: string,
    payload: {
      name?: string;
      planType?: string;
      price?: number;
      sessionLimit?: number | string;
      benefits?: string;
      description?: string;
      active?: boolean;
    },
  ): Promise<any> {
    const result = await this.request<unknown>(`/memberships/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async deleteMembership(id: string): Promise<void> {
    await this.request<unknown>(`/memberships/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Bookings API (read all)
  // ============================================================================

  static async getBookings(): Promise<any[]> {
    const result = await this.request<unknown>('/bookings');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'bookings' in data) {
      return (data as { bookings: any[] }).bookings;
    }
    return [];
  }

  // ============================================================================
  // Attendance API (read all)
  // ============================================================================

  static async getAttendance(): Promise<any[]> {
    const result = await this.request<unknown>('/attendance');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'attendance' in data) {
      return (data as { attendance: any[] }).attendance;
    }
    return [];
  }

  // ============================================================================
  // Payments API (read all)
  // ============================================================================

  // Payments API (read all)
  // ============================================================================

  static async getPayments(): Promise<{ data: any[]; unavailable?: boolean }> {
    try {
      const result = await this.request<unknown>('/payments');
      const data = unwrapApiResult<unknown>(result);
      if (Array.isArray(data)) return { data: data as any[] };
      if (data && typeof data === 'object' && 'payments' in data) {
        return { data: (data as { payments: any[] }).payments };
      }
      return { data: [] };
    } catch (error: any) {
      if (error.message.includes('503') || error.message.includes('Service Unavailable')) {
        return { data: [], unavailable: true };
      }
      throw error;
    }
  }

  // ============================================================================
  // Events API (read all)
  // ============================================================================

  static async getEvents(): Promise<any[]> {
    const result = await this.request<unknown>('/events');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'events' in data) {
      return (data as { events: any[] }).events;
    }
    return [];
  }

  // ============================================================================
  // Member CRUD API
  // ============================================================================

  static async getMember(id: string): Promise<any> {
    const result = await this.request<unknown>(`/members/${encodeURIComponent(id)}`);
    return unwrapApiResult<unknown>(result);
  }

  static async deleteMember(id: string): Promise<void> {
    await this.request<unknown>(`/members/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Class CRUD API
  // ============================================================================

  static async createClass(payload: {
    name: string;
    trainer_id: string;
    category: string;
    duration_mins: number;
    capacity: number;
    location?: string;
  }): Promise<any> {
    const result = await this.request<unknown>('/classes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async updateClass(
    id: string,
    payload: {
      name?: string;
      trainer_id?: string;
      category?: string;
      duration_mins?: number;
      capacity?: number;
      location?: string;
      status?: string;
    },
  ): Promise<any> {
    const result = await this.request<unknown>(`/classes/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async deleteClass(id: string): Promise<void> {
    await this.request<unknown>(`/classes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Booking CRUD API
  // ============================================================================

  static async getBooking(id: string): Promise<any> {
    const result = await this.request<unknown>(`/bookings/${encodeURIComponent(id)}`);
    return unwrapApiResult<unknown>(result);
  }

  static async updateBookingStatus(
    id: string,
    status: 'confirmed' | 'cancelled',
  ): Promise<any> {
    const result = await this.request<unknown>(`/bookings/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async deleteBooking(id: string): Promise<void> {
    await this.request<unknown>(`/bookings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Lead CRUD API
  // ============================================================================

  static async createLead(payload: LeadPayload): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>('/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async updateLead(
    id: string,
    payload: Partial<LeadPayload>,
  ): Promise<{ id: string; status: string }> {
    return this.request<{ id: string; status: string }>(`/leads/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  static async getLead(id: string): Promise<any> {
    const result = await this.request<unknown>(`/leads/${encodeURIComponent(id)}`);
    return unwrapApiResult<unknown>(result);
  }

  static async deleteLead(id: string): Promise<void> {
    await this.request<unknown>(`/leads/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Event CRUD API
  // ============================================================================

  static async createEvent(payload: {
    title: string;
    category: string;
    description: string;
    startAt: string;
    endAt: string;
    venue: string;
    organizer: string;
    capacity?: number;
  }): Promise<any> {
    const result = await this.request<unknown>('/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async updateEvent(
    id: string,
    payload: {
      title?: string;
      category?: string;
      description?: string;
      startAt?: string;
      endAt?: string;
      venue?: string;
      organizer?: string;
      capacity?: number;
      published?: boolean;
    },
  ): Promise<any> {
    const result = await this.request<unknown>(`/events/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async deleteEvent(id: string): Promise<void> {
    await this.request<unknown>(`/events/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  static async getEvent(id: string): Promise<any> {
    const result = await this.request<unknown>(`/events/${encodeURIComponent(id)}`);
    return unwrapApiResult<unknown>(result);
  }

  // ============================================================================
  // Event Registration API
  // ============================================================================

  static async registerForEvent(
    eventId: string,
    payload: { registrant_name: string; member_id?: string; registrant_phone?: string; registrant_email?: string },
  ): Promise<any> {
    const result = await this.request<unknown>(`/events/${encodeURIComponent(eventId)}/registrations`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async cancelEventRegistration(eventId: string, registrationId: string): Promise<void> {
    await this.request<unknown>(
      `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(registrationId)}`,
      { method: 'DELETE' },
    );
  }

  static async checkInEventRegistration(eventId: string, registrationId: string): Promise<any> {
    const result = await this.request<unknown>(
      `/events/${encodeURIComponent(eventId)}/registrations/${encodeURIComponent(registrationId)}/checkin`,
      { method: 'PATCH' },
    );
    return unwrapApiResult<unknown>(result);
  }

  // ============================================================================
  // Staff API (read all)
  // ============================================================================

  static async getStaff(): Promise<any[]> {
    const result = await this.request<unknown>('/staff');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'staff' in data) {
      return (data as { staff: any[] }).staff;
    }
    return [];
  }

  // ============================================================================
  // Attendance CRUD API
  // ============================================================================

  static async createAttendance(payload: {
    booking_id: string;
    status: 'Present' | 'Late' | 'Absent';
    checked_in_at?: string;
  }): Promise<any> {
    const result = await this.request<unknown>('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async checkInBooking(bookingId: string, status: 'Present' | 'Absent' = 'Present'): Promise<any> {
    return unwrapApiResult(await this.request<unknown>('/attendance', {
      method: 'POST',
      body: JSON.stringify({ booking_id: bookingId, attendance_method: 'Trainer Marked', status }),
    }));
  }

  static async updateTrainerProfile(payload: { displayName?: string; phoneE164?: string }): Promise<any> {
    return unwrapApiResult(await this.request<unknown>('/trainer/profile', { method: 'PATCH', body: JSON.stringify(payload) }));
  }

  static async correctAttendance(
    id: string,
    status: 'Present' | 'Late' | 'Absent',
    reason?: string,
  ): Promise<any> {
    const result = await this.request<unknown>(`/attendance/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason }),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async getFreezeRequests(): Promise<any[]> {
    const result = await this.request<unknown>('/memberships/freeze-requests');
    const data = unwrapApiResult<unknown>(result);
    return Array.isArray(data) ? data : [];
  }

  static async createFreezeRequest(payload: { member_id: string; days: 7 | 14; reason: string }): Promise<any> {
    return unwrapApiResult(await this.request<unknown>('/memberships/freeze-requests', { method: 'POST', body: JSON.stringify(payload) }));
  }

  static async reviewFreezeRequest(id: string, decision: 'Approved' | 'Declined', note?: string): Promise<any> {
    return unwrapApiResult(await this.request<unknown>(`/memberships/freeze-requests/${encodeURIComponent(id)}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) }));
  }

  static async getTrainerWorkouts(): Promise<any[]> {
    const data = unwrapApiResult<unknown>(await this.request<unknown>('/trainer/workouts'));
    return Array.isArray(data) ? data : [];
  }

  static async getTrainerOverview(): Promise<TrainerOverview> {
    return unwrapApiResult<TrainerOverview>(await this.request<unknown>('/trainer/overview'));
  }

  static async getFrontDeskOverview(): Promise<FrontDeskOverview> {
    return unwrapApiResult<FrontDeskOverview>(await this.sessionRequest<unknown>('/api/workspaces/front-desk'));
  }

  static async getBillingOverview(): Promise<BillingOverview> {
    return unwrapApiResult<BillingOverview>(await this.sessionRequest<unknown>('/api/workspaces/billing'));
  }

  static async getLeadTrainerOverview(): Promise<LeadTrainerOverview> {
    return unwrapApiResult<LeadTrainerOverview>(await this.sessionRequest<unknown>('/api/workspaces/lead-trainer'));
  }

  static async frontDeskCheckIn(bookingId: string): Promise<any> {
    return unwrapApiResult(await this.sessionRequest<unknown>('/api/workspaces/attendance', { method: 'POST', body: JSON.stringify({ booking_id: bookingId, attendance_method: 'Front Desk' }) }));
  }

  static async createFrontDeskWalkInLead(payload: {
    full_name: string;
    phone: string;
    email?: string;
    plan?: string;
    notes?: string;
  }): Promise<{ id: string }> {
    return unwrapApiResult<{ id: string }>(await this.sessionRequest<unknown>('/api/workspaces/front-desk/leads', {
      method: 'POST',
      body: JSON.stringify(payload),
    }));
  }

  static async assignWorkspaceMemberTrainer(memberId: string, trainerUserId: string | null): Promise<any> {
    return unwrapApiResult(await this.sessionRequest<unknown>(`/api/workspaces/members/${encodeURIComponent(memberId)}/trainer`, { method: 'PATCH', body: JSON.stringify({ trainer_user_id: trainerUserId }) }));
  }

  static async getWorkspaceGstReceipt(id: string): Promise<Record<string, unknown>> {
    return unwrapApiResult(await this.sessionRequest<unknown>(`/api/workspaces/payments/${encodeURIComponent(id)}/gst-receipt`)) as Record<string, unknown>;
  }

  static async saveTrainerWorkout(payload: Record<string, unknown>): Promise<any> {
    return unwrapApiResult(await this.request<unknown>('/trainer/workouts', { method: 'POST', body: JSON.stringify(payload) }));
  }

  static async getTrainerProgress(): Promise<any[]> {
    const data = unwrapApiResult<unknown>(await this.request<unknown>('/trainer/progress'));
    return Array.isArray(data) ? data : [];
  }

  static async saveTrainerProgress(payload: Record<string, unknown>): Promise<any> {
    return unwrapApiResult(await this.request<unknown>('/trainer/progress', { method: 'POST', body: JSON.stringify(payload) }));
  }

  static async refundPayment(id: string, amount: number, note?: string): Promise<PaymentItem> {
    return unwrapApiResult(await this.request<unknown>(`/payments/${encodeURIComponent(id)}/refund`, { method: 'POST', body: JSON.stringify({ amount, note }) }));
  }

  static async recordLedgerPayment(payload: {
    member_id: string;
    type: string;
    amount: number;
    method: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer';
    status: 'Paid' | 'Pending' | 'Review';
    notes?: string;
  }): Promise<PaymentItem> {
    return unwrapApiResult(await this.request<unknown>('/payments/ledger', { method: 'POST', body: JSON.stringify(payload) }));
  }

  static async getGstReceipt(id: string): Promise<Record<string, unknown>> {
    return unwrapApiResult(await this.request<unknown>(`/payments/${encodeURIComponent(id)}/gst-receipt`)) as Record<string, unknown>;
  }

  static async getAttendanceById(id: string): Promise<any> {
    const result = await this.request<unknown>(`/attendance/${encodeURIComponent(id)}`);
    return unwrapApiResult<unknown>(result);
  }

  // ============================================================================
  // Payment CRUD API
  // ============================================================================

  static async createPayment(payload: {
    ref: string;
    date: string;
    memberId: string;
    type: string;
    method: string;
    status: string;
    amount: number;
    currency: string;
    refundedAmount?: number;
    notes?: string;
  }): Promise<PaymentItem> {
    const result = await this.request<unknown>('/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<PaymentItem>(result);
  }

  static async updatePayment(
    id: string,
    payload: Partial<{
      status: string;
      type: string;
      method: string;
      amount: number;
      refundedAmount: number;
      notes: string;
    }>,
  ): Promise<PaymentItem> {
    const result = await this.request<unknown>(`/payments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<PaymentItem>(result);
  }

  // ============================================================================
  // Staff CRUD API
  // ============================================================================

  static async createStaff(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    role: string;
    status?: string;
    studio?: string;
    shift?: string;
    specialization?: string;
  }): Promise<StaffMember> {
    const result = await this.request<unknown>('/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<StaffMember>(result);
  }

  static async updateStaff(
    id: string,
    payload: Partial<{
      name: string;
      email: string;
      phone: string;
      role: string;
      status?: string;
      shift?: string;
      specialization?: string;
    }>,
  ): Promise<StaffMember> {
    const result = await this.request<unknown>(`/staff/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    return unwrapApiResult<StaffMember>(result);
  }

  static async deleteStaff(id: string): Promise<void> {
    await this.request<unknown>(`/staff/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Feedback CRUD API
  // ============================================================================

  static async getFeedback(): Promise<any[]> {
    const result = await this.request<unknown>('/feedback');
    const data = unwrapApiResult<unknown>(result);
    if (Array.isArray(data)) return data as any[];
    if (data && typeof data === 'object' && 'feedback' in data) {
      return (data as { feedback: any[] }).feedback;
    }
    return [];
  }

  static async updateFeedback(
    id: string,
    payload: {
      category?: string;
      trainerName?: string;
      staffName?: string;
      rating?: number;
      strengths?: string[];
      improvements?: string[];
      comment?: string;
      reviewStatus?: string;
      followUpNote?: string;
    },
  ): Promise<any> {
    const result = await this.request<unknown>(`/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(payload.rating !== undefined ? { rating: payload.rating } : {}),
        ...(payload.comment !== undefined ? { comment: payload.comment } : {}),
        ...(payload.reviewStatus !== undefined ? { review_status: payload.reviewStatus } : {}),
        ...(payload.followUpNote !== undefined ? { follow_up_note: payload.followUpNote } : {}),
      }),
    });
    return unwrapApiResult<unknown>(result);
  }

  static async deleteFeedback(id: string): Promise<void> {
    await this.request<unknown>(`/feedback/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  // ============================================================================
  // Recommendations API (AI-04 / B2C-09)
  // ============================================================================

  static async getRecommendations(params?: {
    goal?: string;
    level?: string;
    days?: number;
    memberId?: string;
  }): Promise<RecommendationItem[]> {
    const query = new URLSearchParams();
    if (params?.goal) query.set('goal', params.goal);
    if (params?.level) query.set('level', params.level);
    if (params?.days) query.set('days', String(params.days));
    if (params?.memberId) query.set('memberId', params.memberId);

    const queryString = query.toString();
    const path = queryString ? `/recommendations?${queryString}` : '/recommendations';

    const result = await this.request<unknown>(path);
    const unwrapped = unwrapApiResult<unknown>(result);

    const rawList: any[] = Array.isArray(unwrapped)
      ? unwrapped
      : unwrapped && typeof unwrapped === 'object' && 'recommendations' in unwrapped
      ? (unwrapped as { recommendations: any[] }).recommendations
      : [];

    return rawList.map((rec) => {
      const sessId = rec.sessionId || rec.session_id || rec.id || '';
      const cName = rec.className || rec.class_name || rec.name || 'Studio Session';
      const cat = rec.category || rec.class_type || 'General';
      const spots = Number(rec.availableSpots ?? rec.available_spots ?? 0);
      const score = Number(rec.matchScore ?? rec.match_score ?? 90);
      const bHref = rec.bookHref || rec.book_href || `/member/book-class?classId=${encodeURIComponent(sessId)}&className=${encodeURIComponent(cName)}&category=${encodeURIComponent(cat)}`;

      return {
        sessionId: sessId,
        session_id: sessId,
        className: cName,
        class_name: cName,
        category: cat,
        trainer: rec.trainer || 'Studio Trainer',
        date: rec.date || rec.session_date || '',
        session_date: rec.session_date || rec.date || '',
        startTime: rec.startTime || rec.start_time || '09:00',
        start_time: rec.start_time || rec.startTime || '09:00',
        endTime: rec.endTime || rec.end_time || '',
        end_time: rec.end_time || rec.endTime || '',
        availableSpots: spots,
        available_spots: spots,
        matchScore: score,
        match_score: score,
        reason: rec.reason || `Recommended practice session based on your goals.`,
        bookHref: bHref,
        book_href: bHref,
      };
    });
  }

  // Feedback Intelligence API
  static async submitMemberFeedback(payload: {
    sessionId?: string;
    session_id?: string;
    trainer_user_id?: string;
    rating: number;
    strengths?: string[];
    improvements?: string[];
    comment?: string;
    category?: string;
  }): Promise<unknown> {
    const body = {
      session_id: payload.session_id || payload.sessionId || undefined,
      trainer_user_id: payload.trainer_user_id || undefined,
      rating: payload.rating,
      strengths: payload.strengths || [],
      improvements: payload.improvements || [],
      comment: payload.comment || undefined,
      category: payload.category || undefined,
    };
    return this.request<unknown>('/feedback/member', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
