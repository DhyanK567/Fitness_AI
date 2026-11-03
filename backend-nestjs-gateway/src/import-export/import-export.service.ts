import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { createHash } from 'node:crypto';
import { ErpnextService } from '../erpnext/erpnext.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../common/prisma.service';
import { ImportMemberDto } from './dto/import-member.dto';
import { ImportLeadDto } from './dto/import-lead.dto';
import { ImportClassDto } from './dto/import-class.dto';
import { ImportMembershipDto } from './dto/import-membership.dto';
import { ImportBookingDto } from './dto/import-booking.dto';
import { ImportAttendanceDto } from './dto/import-attendance.dto';
import { ImportPaymentDto } from './dto/import-payment.dto';
import { ImportEventDto } from './dto/import-event.dto';
import { ExportQueryDto, ExportDataset } from './dto/export-query.dto';
import { ErrorCode } from '@fitness-ai/error-codes';
import { sanitizeCsvCell } from './csv-parser';

type Context = { tenantId: string; tenantCode: string; correlationId: string };

type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

const MAX_ROWS = 5000;

function normalizePhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length > 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Source CSV identifiers are only meaningful inside their source system. A UUID
 * copied from another studio must never be inserted verbatim because primary
 * keys are global, not tenant-scoped. UUID v5 gives imports a stable, tenant
 * scoped replacement so dependent files can deterministically remap the same
 * source member/class/booking identifiers on later requests.
 */
export function tenantScopedImportId(tenantId: string, resource: string, sourceId: string): string {
  const namespace = Buffer.from(tenantId.replace(/-/g, ''), 'hex');
  if (namespace.length !== 16) throw new BadRequestException('Tenant identifier is invalid for CSV import.');
  const bytes = createHash('sha1')
    .update(namespace)
    .update(`${resource}:${sourceId.trim().toLowerCase()}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeEmail(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase();
}

function parseDate(value: string | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const isoDate = trimmed.match(/^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/);
  if (isoDate) {
    const date = new Date(`${isoDate[1]}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate[1]) return isoDate[1];
    return '';
  }
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function normalizeClassDate(value: string | Date | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function hasChanged(existing: Record<string, unknown>, updates: Record<string, unknown>): boolean {
  return Object.entries(updates).some(([key, value]) => {
    const current = existing[key];
    if (value instanceof Date) {
      const currentDate = current instanceof Date ? current : new Date(String(current ?? ''));
      return Number.isNaN(currentDate.getTime()) || currentDate.getTime() !== value.getTime();
    }
    return (current ?? null) !== (value ?? null);
  });
}

function hashIdempotencyKey(tenantId: string, key: string): string {
  return createHash('sha256').update(`${tenantId}:${key}`).digest('hex');
}

function isPostgresStore(): boolean {
  return !['erp', 'erpnext'].includes((process.env.IMPORT_STORE || 'postgres').toLowerCase());
}

@Injectable()
export class ImportExportService {
  constructor(
    private readonly erp: ErpnextService,
    private readonly auditOutbox: AuditOutboxService,
    private readonly prisma: PrismaService,
  ) {}

  // ============================================================================
  // IMPORT
  // ============================================================================

  async importMembers(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'member',
      (row: any) => plainToInstance(ImportMemberDto, row),
      (row: any, dto: ImportMemberDto) => this.validateImportMember(row, dto),
      (row: any, dto: ImportMemberDto) => this.buildMemberPayload(row, dto),
      (member: any) => ({
        email: normalizeEmail(member.email),
        phone: normalizePhone(member.phone),
      }),
      async (payload: any) => this.erpCallMemberCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioMember.create({
            data: {
              ...(payload.id ? { id: payload.id } : {}),
              tenantId: context.tenantId,
              fullName: payload.name,
              email: payload.email,
              phone: payload.phone,
              plan: payload.plan,
              status: payload.status,
              joined: payload.joined ? new Date(payload.joined) : new Date(),
              expiry: payload.expiry ? new Date(payload.expiry) : null,
              coach: payload.coach || null,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          fullName: payload.name,
          email: payload.email,
          phone: payload.phone || null,
          plan: payload.plan,
          status: payload.status,
          joined: new Date(payload.joined),
          expiry: payload.expiry ? new Date(payload.expiry) : null,
          coach: payload.coach || null,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioMember.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importLeads(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'lead',
      (row: any) => plainToInstance(ImportLeadDto, row),
      (row: any, dto: ImportLeadDto) => this.validateImportLead(row, dto),
      (row: any, dto: ImportLeadDto) => this.buildLeadPayload(row, dto),
      (lead: any) => ({
        email: normalizeEmail(lead.email),
        phone: normalizePhone(lead.phone),
      }),
      async (payload: any) => this.erpCallLeadCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioLead.create({
            data: {
              tenantId: context.tenantId,
              name: payload.name,
              email: payload.email || null,
              phone: payload.phone || null,
              source: payload.source,
              stage: payload.stage,
              followUpDate: payload.followUpDate ? new Date(payload.followUpDate) : null,
              assigned: payload.assigned || null,
              plan: payload.plan,
              notes: payload.notes || null,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          name: payload.name,
          email: payload.email || null,
          phone: payload.phone || null,
          source: payload.source,
          stage: payload.stage,
          followUpDate: payload.followUpDate ? new Date(payload.followUpDate) : null,
          assigned: payload.assigned || null,
          plan: payload.plan,
          notes: payload.notes || null,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioLead.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importClasses(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'class',
      (row: any) => plainToInstance(ImportClassDto, row),
      (row: any, dto: ImportClassDto) => this.validateImportClass(row, dto),
      (row: any, dto: ImportClassDto) => this.buildClassPayload(row, dto),
      (cls: any) => ({ name: cls.name, date: cls.date, startTime: cls.startTime }),
      async (payload: any) => this.erpCallClassCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioClass.create({
            data: {
              ...(payload.id ? { id: payload.id } : {}),
              tenantId: context.tenantId,
              name: payload.name,
              category: payload.category,
              date: new Date(payload.date),
              startTime: payload.startTime,
              endTime: payload.endTime || null,
              trainer: payload.trainer,
              room: payload.room || null,
              capacity: payload.capacity,
              status: payload.status,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          name: payload.name,
          category: payload.category,
          date: new Date(payload.date),
          startTime: payload.startTime,
          endTime: payload.endTime || null,
          trainer: payload.trainer,
          room: payload.room || null,
          capacity: payload.capacity,
          status: payload.status,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioClass.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importMemberships(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'membership',
      (row: any) => plainToInstance(ImportMembershipDto, row),
      (row: any, dto: ImportMembershipDto) => this.validateImportMembership(row, dto),
      (row: any, dto: ImportMembershipDto) => this.buildMembershipPayload(row, dto),
      (m: any) => ({ name: m.name || '', planType: m.planType || '' }),
      async (payload: any) => this.erpCallMembershipCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioMembership.create({
            data: {
              tenantId: context.tenantId,
              name: payload.name,
              planType: payload.planType,
              priceINR: payload.priceINR,
              sessionLimit: payload.sessionLimit,
              active: payload.active,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          name: payload.name,
          planType: payload.planType,
          priceINR: payload.priceINR,
          sessionLimit: payload.sessionLimit,
          active: payload.active,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioMembership.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importBookings(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'booking',
      (row: any) => plainToInstance(ImportBookingDto, row),
      (row: any, dto: ImportBookingDto) => this.validateImportBooking(row, dto),
      (row: any, dto: ImportBookingDto) => this.buildBookingPayload(row, dto),
      (b: any) => ({ classId: b.classId || '', memberId: b.memberId || '' }),
      async (payload: any) => this.erpCallBookingCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioBooking.create({
            data: {
              ...(payload.id ? { id: payload.id } : {}),
              tenantId: context.tenantId,
              classId: payload.classId,
              memberId: payload.memberId,
              status: payload.status,
              bookedAt: payload.bookedAt ? new Date(payload.bookedAt) : new Date(),
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = { status: payload.status, bookedAt: new Date(payload.bookedAt) };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioBooking.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importAttendance(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'attendance',
      (row: any) => plainToInstance(ImportAttendanceDto, row),
      (row: any, dto: ImportAttendanceDto) => this.validateImportAttendance(row, dto),
      (row: any, dto: ImportAttendanceDto) => this.buildAttendancePayload(row, dto),
      (a: any) => ({ bookingId: a.bookingId || '' }),
      async (payload: any) => this.erpCallAttendanceCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioAttendance.create({
            data: {
              tenantId: context.tenantId,
              bookingId: payload.bookingId,
              status: payload.status,
              checkedInAt: payload.checkedInAt ? new Date(payload.checkedInAt) : null,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          status: payload.status,
          checkedInAt: payload.checkedInAt ? new Date(payload.checkedInAt) : null,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioAttendance.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importPayments(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'payment',
      (row: any) => plainToInstance(ImportPaymentDto, row),
      (row: any, dto: ImportPaymentDto) => this.validateImportPayment(row, dto),
      (row: any, dto: ImportPaymentDto) => this.buildPaymentPayload(row, dto),
      (p: any) => ({ ref: p.ref || '' }),
      async (payload: any) => this.erpCallPaymentCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioPayment.create({
            data: {
              tenantId: context.tenantId,
              ref: payload.ref,
              date: payload.date ? new Date(payload.date) : new Date(),
              memberId: payload.memberId,
              type: payload.type,
              method: payload.method,
              status: payload.status,
              amount: payload.amount,
              refundedAmount: payload.refundedAmount,
              notes: payload.notes || null,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          date: new Date(payload.date), memberId: payload.memberId, type: payload.type,
          method: payload.method, status: payload.status, amount: payload.amount,
          refundedAmount: payload.refundedAmount, notes: payload.notes || null,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioPayment.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  async importEvents(
    context: Context,
    rows: any[],
    actorId: string,
    dryRun: boolean,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
  ): Promise<ImportResult> {
    return this.importRecords(
      context,
      rows,
      'event',
      (row: any) => plainToInstance(ImportEventDto, row),
      (row: any, dto: ImportEventDto) => this.validateImportEvent(row, dto),
      (row: any, dto: ImportEventDto) => this.buildEventPayload(row, dto),
      (e: any) => ({ title: e.title || '', startAt: e.startAt || '' }),
      async (payload: any) => this.erpCallEventCreate(context, payload),
      async (payload: any) => {
        await this.prisma.withTenant(context.tenantId, async (tx) => {
          await tx.studioEvent.create({
            data: {
              tenantId: context.tenantId,
              title: payload.title,
              category: payload.category,
              startAt: payload.startAt ? new Date(payload.startAt) : new Date(),
              endAt: payload.endAt ? new Date(payload.endAt) : new Date(),
              venue: payload.venue,
              organizer: payload.organizer,
              capacity: payload.capacity || null,
            },
          });
        });
      },
      dryRun,
      actorId,
      idempotencyKey,
      duplicatePolicy,
      async (payload: any, existing: any, dryRun: boolean) => {
        const data = {
          title: payload.title, category: payload.category, startAt: new Date(payload.startAt),
          endAt: new Date(payload.endAt), venue: payload.venue,
          organizer: payload.organizer, capacity: payload.capacity || null,
        };
        if (!hasChanged(existing, data)) return false;
        if (dryRun) return true;
        await this.prisma.withTenant(context.tenantId, (tx) =>
          tx.studioEvent.update({ where: { id: existing.id, tenantId: context.tenantId }, data }),
        );
        return true;
      },
    );
  }

  private async erpCallMemberCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.member.create_member',
      body: {
        tenant: context.tenantCode,
        full_name: payload.name,
        email: payload.email,
        phone: payload.phone,
        join_date: payload.joined,
        status: payload.status,
        emergency_contact: '',
      },
    });
  }

  private async erpCallLeadCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.lead.create_lead',
      body: {
        ...payload,
        tenant: context.tenantCode,
      },
    });
  }

  private async erpCallClassCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.classes.create_class',
      body: {
        ...payload,
        tenant: context.tenantCode,
      },
    });
  }

  private async erpCallMembershipCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.membership.create_membership',
      body: { ...payload, tenant: context.tenantCode },
    });
  }

  private async erpCallBookingCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.booking.create_booking',
      body: { ...payload, tenant: context.tenantCode },
    });
  }

  private async erpCallAttendanceCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.attendance.record_attendance',
      body: { ...payload, tenant: context.tenantCode },
    });
  }

  private async erpCallPaymentCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.payment.create_payment',
      body: { ...payload, tenant: context.tenantCode },
    });
  }

  private async erpCallEventCreate(context: Context, payload: any) {
    return this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method: 'wellness_studio.api.event.create_event',
      body: { ...payload, tenant: context.tenantCode },
    });
  }

  private async importRecords(
    context: Context,
    rows: any[],
    resourceType: string,
    toDto: (row: any) => any,
    validate: (row: any, dto: any) => string[],
    toPayload: (row: any, dto: any) => any,
    dedupeKeys: (row: any) => Record<string, string>,
    createErp: (payload: any) => Promise<unknown>,
    createPostgres: (payload: any) => Promise<unknown>,
    dryRun: boolean,
    actorId: string,
    idempotencyKey?: string,
    duplicatePolicy: 'skip' | 'update' = 'skip',
    updatePostgres?: (payload: any, existing: any, dryRun: boolean) => Promise<boolean>,
  ): Promise<ImportResult> {
    if (!rows || rows.length === 0) {
      throw new BadRequestException('No rows provided for import');
    }
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `Import exceeds maximum of ${MAX_ROWS} rows per file`,
      );
    }
    if (duplicatePolicy === 'update' && !isPostgresStore()) {
      throw new BadRequestException('Updating existing imports is supported only when IMPORT_STORE=postgres.');
    }

    // Idempotency check
    if (idempotencyKey) {
      const existing = await this.prisma.withTenant(
        context.tenantId,
        (tx: any) =>
          tx.idempotencyKey.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: context.tenantId,
                idempotencyKey,
              },
            },
          }),
      );
      if (existing) {
        throw new BadRequestException(
          `Import with this Idempotency-Key has already been processed`,
        );
      }
    }

    // Audit: record start BEFORE any external execution
    await this.prisma.withTenant(context.tenantId, async (tx: any) => {
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          actorType: 'human',
          actorId,
          action: dryRun ? 'import.dry_run' : 'import.started',
          resourceType,
          resourceRef: 'import-batch',
          beforeData: null,
          afterData: {
            dataset: resourceType,
            rowCount: rows.length,
            dryRun,
            status: dryRun ? 'preview' : 'started',
          },
          requestContext: { correlationId: context.correlationId },
        },
      });
    });

    const errors: Array<{ row: number; field: string; message: string }> = [];
    const seenKeys = new Map<string, number>();

    // Fetch existing records for cross-database dedupe
    let existingEmails = new Set<string>();
    let existingPhones = new Set<string>();
    let existingNames = new Set<string>();
    const existingRecords: any[] = [];
    const validMemberIds = new Set<string>();
    const validClassIds = new Set<string>();
    const validBookingIds = new Set<string>();
    const memberCrosswalk: Array<{ id: string; email?: string | null }> = [];
    const classCrosswalk: Array<{ id: string; name?: string; date?: Date }> = [];
    const bookingCrosswalk: Array<{ id: string; memberId?: string; classId?: string }> = [];

    try {
      if (isPostgresStore()) {
        await this.prisma.withTenant(context.tenantId, async (tx: any) => {
          if (resourceType === 'member') {
            const existing = await tx.studioMember.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const m of existing) {
              const em = normalizeEmail(m.email);
              const ph = normalizePhone(m.phone);
              if (em) existingEmails.add(em);
              if (ph) existingPhones.add(ph);
            }
          } else if (resourceType === 'lead') {
            const existing = await tx.studioLead.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const l of existing) {
              const em = normalizeEmail(l.email);
              const ph = normalizePhone(l.phone);
              if (em) existingEmails.add(em);
              if (ph) existingPhones.add(ph);
            }
          } else if (resourceType === 'class') {
            const existing = await tx.studioClass.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const c of existing) {
              existingNames.add(
                `${String(c.name).toLowerCase()}|${normalizeClassDate(c.date)}|${String(c.startTime)}`,
              );
            }
          } else if (resourceType === 'membership') {
            const existing = await tx.studioMembership.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const m of existing) {
              existingNames.add(`${String(m.name).toLowerCase()}|${String(m.planType || '')}`);
            }
          } else if (resourceType === 'booking') {
            const existing = await tx.studioBooking.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const b of existing) {
              existingNames.add(`${String(b.classId)}|${String(b.memberId)}|${String(b.bookedAt || '')}`);
            }
            const [members, classes] = await Promise.all([
              tx.studioMember.findMany({
                where: { tenantId: context.tenantId },
                select: { id: true, email: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              }),
              tx.studioClass.findMany({
                where: { tenantId: context.tenantId },
                select: { id: true, name: true, date: true },
                orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              }),
            ]);
            members.forEach((item: { id: string }) => validMemberIds.add(item.id));
            classes.forEach((item: { id: string }) => validClassIds.add(item.id));
            memberCrosswalk.push(...members);
            classCrosswalk.push(...classes);
          } else if (resourceType === 'attendance') {
            const existing = await tx.studioAttendance.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const a of existing) {
              existingNames.add(String(a.bookingId));
            }
            const bookings = await tx.studioBooking.findMany({
              where: { tenantId: context.tenantId },
              select: { id: true, memberId: true, classId: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            bookings.forEach((item: { id: string }) => validBookingIds.add(item.id));
            bookingCrosswalk.push(...bookings);
          } else if (resourceType === 'payment') {
            const existing = await tx.studioPayment.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const p of existing) {
              existingNames.add(String(p.ref));
            }
            const members = await tx.studioMember.findMany({
              where: { tenantId: context.tenantId },
              select: { id: true, email: true },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            });
            members.forEach((item: { id: string }) => validMemberIds.add(item.id));
            memberCrosswalk.push(...members);
          } else if (resourceType === 'event') {
            const existing = await tx.studioEvent.findMany({
              where: { tenantId: context.tenantId },
            });
            existingRecords.push(...existing);
            for (const e of existing) {
              existingNames.add(`${String(e.title).toLowerCase()}|${String(e.startAt || '')}`);
            }
          }
        });
      } else {
        if (resourceType === 'member') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.member.list_members',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode, limit: 10000, start: 0 },
        }) as any;
        const members = existing?.members || existing || [];
        existingRecords.push(...members);
        for (const m of members) {
          const em = normalizeEmail(m.email);
          const ph = normalizePhone(m.phone);
          if (em) existingEmails.add(em);
          if (ph) existingPhones.add(ph);
        }
      } else if (resourceType === 'lead') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.lead.list_leads',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const leads = existing?.leads || existing || [];
        existingRecords.push(...leads);
        for (const l of leads) {
          const em = normalizeEmail(l.email);
          const ph = normalizePhone(l.phone);
          if (em) existingEmails.add(em);
          if (ph) existingPhones.add(ph);
        }
      } else if (resourceType === 'class') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.classes.list_classes',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const classList = existing?.classes || existing || [];
        existingRecords.push(...classList);
        for (const c of classList) {
          existingNames.add(`${String(c.name).toLowerCase()}|${String(c.date)}|${String(c.startTime)}`);
        }
      } else if (resourceType === 'membership') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.membership.list_memberships',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const list = existing?.memberships || existing || [];
        for (const m of list) {
          existingNames.add(`${String(m.name).toLowerCase()}|${String(m.planType || '')}`);
        }
      } else if (resourceType === 'booking') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.booking.list_bookings',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const list = existing?.bookings || existing || [];
        for (const b of list) {
          existingNames.add(`${String(b.classId)}|${String(b.memberId)}|${String(b.bookedAt || '')}`);
        }
      } else if (resourceType === 'attendance') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.attendance.list_attendance',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const list = existing?.attendance || existing || [];
        for (const a of list) {
          existingNames.add(String(a.bookingId));
        }
      } else if (resourceType === 'payment') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.payment.list_payments',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const list = existing?.payments || existing || [];
        for (const p of list) {
          existingNames.add(String(p.ref));
        }
      } else if (resourceType === 'event') {
        const existing = await this.erp.call({
          tenantId: context.tenantCode,
          correlationId: context.correlationId,
          method: 'wellness_studio.api.event.list_events',
          httpMethod: 'GET',
          body: { tenant: context.tenantCode },
        }) as any;
        const list = existing?.events || existing || [];
        for (const e of list) {
          existingNames.add(`${String(e.title).toLowerCase()}|${String(e.startAt || '')}`);
        }
      }
    }
    } catch (error) {
      if (isPostgresStore()) throw error;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    // Legacy exports did not preserve source IDs on parent records. Positional
    // fallback is enabled only for a complete one-to-one dataset: every source
    // reference must be unique, none may already resolve, and candidate counts
    // must match exactly. This prevents a partial or unrelated tenant dataset
    // from being silently cross-wired.
    const canUseIndexCrosswalk = (field: string, validIds: Set<string>, candidateCount: number) => {
      const sourceIds = rows.map((row) => String(row?.[field] ?? '').trim()).filter(Boolean);
      return sourceIds.length === rows.length &&
        new Set(sourceIds).size === rows.length &&
        sourceIds.every((id) => !validIds.has(id)) &&
        candidateCount === rows.length;
    };
    const useMemberIndexCrosswalk =
      (resourceType === 'booking' || resourceType === 'payment') &&
      canUseIndexCrosswalk('memberId', validMemberIds, memberCrosswalk.length);
    const useClassIndexCrosswalk = resourceType === 'booking' &&
      canUseIndexCrosswalk('classId', validClassIds, classCrosswalk.length);
    const useBookingIndexCrosswalk = resourceType === 'attendance' &&
      canUseIndexCrosswalk('bookingId', validBookingIds, bookingCrosswalk.length);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;
      const dto = toDto(row);
      const validationErrors = validate(row, dto);

      if (validationErrors.length > 0) {
        for (const field of validationErrors) {
          errors.push({ row: rowNum, field, message: `Invalid ${field}` });
        }
        failed++;
        continue;
      }

      const payload = toPayload(row, dto);

      // Convert source-system primary keys into stable IDs owned by this tenant.
      // Keep IDs already present in this tenant so re-imports and exported CSVs
      // remain idempotent. IDs owned by a different tenant are never reused.
      if (isPostgresStore() && ['member', 'class', 'booking'].includes(resourceType) && payload.id) {
        const sourceId = String(payload.id);
        const existsInTenant = existingRecords.some((record) => String(record.id) === sourceId);
        payload.id = existsInTenant ? sourceId : tenantScopedImportId(context.tenantId, resourceType, sourceId);
      }

      if (isPostgresStore() && (resourceType === 'booking' || resourceType === 'payment')) {
        const sourceMemberId = String(payload.memberId ?? '').trim();
        if (sourceMemberId && !validMemberIds.has(sourceMemberId)) {
          payload.memberId = tenantScopedImportId(context.tenantId, 'member', sourceMemberId);
        }
        if (!validMemberIds.has(String(payload.memberId))) {
          const email = normalizeEmail(row.memberEmail ?? row.email);
          const naturalMatches = email
            ? memberCrosswalk.filter((member) => normalizeEmail(member.email) === email)
            : [];
          if (naturalMatches.length === 1) payload.memberId = naturalMatches[0].id;
          else if (useMemberIndexCrosswalk) payload.memberId = memberCrosswalk[i].id;
        }
      }
      if (isPostgresStore() && resourceType === 'booking' && !validClassIds.has(String(payload.classId))) {
        const sourceClassId = String(payload.classId ?? '').trim();
        if (sourceClassId) payload.classId = tenantScopedImportId(context.tenantId, 'class', sourceClassId);
      }
      if (isPostgresStore() && resourceType === 'booking' && !validClassIds.has(String(payload.classId))) {
        const className = String(row.className ?? '').trim().toLowerCase();
        const classDate = row.classDate ?? row.date;
        const naturalMatches = className && classDate
          ? classCrosswalk.filter((studioClass) =>
            String(studioClass.name ?? '').trim().toLowerCase() === className &&
            normalizeClassDate(studioClass.date) === normalizeClassDate(classDate),
          )
          : [];
        if (naturalMatches.length === 1) payload.classId = naturalMatches[0].id;
        else if (useClassIndexCrosswalk) payload.classId = classCrosswalk[i].id;
      }
      if (isPostgresStore() && resourceType === 'attendance' && !validBookingIds.has(String(payload.bookingId))) {
        const sourceBookingId = String(payload.bookingId ?? '').trim();
        if (sourceBookingId) payload.bookingId = tenantScopedImportId(context.tenantId, 'booking', sourceBookingId);
      }
      if (isPostgresStore() && resourceType === 'attendance' && !validBookingIds.has(String(payload.bookingId))) {
        const memberId = String(row.memberId ?? '').trim();
        const classId = String(row.classId ?? '').trim();
        const naturalMatches = memberId && classId
          ? bookingCrosswalk.filter((booking) => booking.memberId === memberId && booking.classId === classId)
          : [];
        if (naturalMatches.length === 1) payload.bookingId = naturalMatches[0].id;
        else if (useBookingIndexCrosswalk) payload.bookingId = bookingCrosswalk[i].id;
      }
      const keys = dedupeKeys(payload);
      const keyString = Object.values(keys).filter(Boolean).join('|');
      const matchingRecords = existingRecords.filter((record) => {
        if (resourceType === 'member' || resourceType === 'lead') {
          const emailMatches = normalizeEmail(payload.email) &&
            normalizeEmail(record.email) === normalizeEmail(payload.email);
          const phoneMatches = normalizePhone(payload.phone) &&
            normalizePhone(record.phone) === normalizePhone(payload.phone);
          return Boolean(emailMatches || phoneMatches);
        }
        if (resourceType === 'class') {
          return String(record.name).toLowerCase() === String(payload.name).toLowerCase() &&
            normalizeClassDate(record.date) === normalizeClassDate(payload.date) &&
            String(record.startTime) === String(payload.startTime);
        }
        if (resourceType === 'membership') {
          return String(record.name).toLowerCase() === String(payload.name).toLowerCase() &&
            String(record.planType) === String(payload.planType);
        }
        if (resourceType === 'booking') {
          return String(record.classId) === String(payload.classId) &&
            String(record.memberId) === String(payload.memberId) &&
            new Date(record.bookedAt).toISOString() === new Date(payload.bookedAt).toISOString();
        }
        if (resourceType === 'attendance') return String(record.bookingId) === String(payload.bookingId);
        if (resourceType === 'payment') return String(record.ref) === String(payload.ref);
        if (resourceType === 'event') {
          return String(record.title).toLowerCase() === String(payload.title).toLowerCase() &&
            new Date(record.startAt).toISOString() === new Date(payload.startAt).toISOString();
        }
        return false;
      });

      if (isPostgresStore() && resourceType === 'booking') {
        if (!validMemberIds.has(String(payload.memberId))) {
          errors.push({ row: rowNum, field: 'memberId', message: 'Member does not exist in this tenant.' });
          failed++;
          continue;
        }
        if (!validClassIds.has(String(payload.classId))) {
          errors.push({ row: rowNum, field: 'classId', message: 'Class does not exist in this tenant.' });
          failed++;
          continue;
        }
      }
      if (isPostgresStore() && resourceType === 'attendance' && !validBookingIds.has(String(payload.bookingId))) {
        errors.push({ row: rowNum, field: 'bookingId', message: 'Booking does not exist in this tenant.' });
        failed++;
        continue;
      }
      if (isPostgresStore() && resourceType === 'payment' && !validMemberIds.has(String(payload.memberId))) {
        errors.push({ row: rowNum, field: 'memberId', message: 'Member does not exist in this tenant.' });
        failed++;
        continue;
      }

      if (matchingRecords.length > 1) {
        errors.push({
          row: rowNum,
          field: 'duplicate_match',
          message: 'The import row matches more than one existing record and cannot be safely updated.',
        });
        failed++;
        continue;
      }

      // Check within-file duplicate
      if (keyString && seenKeys.has(keyString)) {
        skipped++;
        continue;
      }

      if (matchingRecords.length === 1) {
        const existing = matchingRecords[0];
        try {
          if (duplicatePolicy === 'update' && updatePostgres) {
            if (await updatePostgres(payload, existing, dryRun)) updated++;
            else skipped++;
          } else {
            skipped++;
          }
          if (keyString) seenKeys.set(keyString, rowNum);
        } catch (error) {
          errors.push({
            row: rowNum,
            field: '*',
            message: error instanceof Error ? error.message : 'Failed to update existing record.',
          });
          failed++;
        }
        continue;
      }

      // Check against existing database records
      if (resourceType === 'member') {
        const em = normalizeEmail(payload.email);
        const ph = normalizePhone(payload.phone);
        if ((em && existingEmails.has(em)) || (ph && existingPhones.has(ph))) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'lead') {
        const em = normalizeEmail(payload.email);
        const ph = normalizePhone(payload.phone);
        if ((em && existingEmails.has(em)) || (ph && existingPhones.has(ph))) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'class') {
        const clsKey = `${String(payload.name).toLowerCase()}|${normalizeClassDate(payload.date)}|${String(payload.startTime)}`;
        if (existingNames.has(clsKey)) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'membership') {
        const memKey = `${String(payload.name).toLowerCase()}|${String(payload.planType || '')}`;
        if (existingNames.has(memKey)) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'booking') {
        const bkgKey = `${String(payload.classId)}|${String(payload.memberId)}|${String(payload.bookedAt || '')}`;
        if (existingNames.has(bkgKey)) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'attendance') {
        const attKey = String(payload.bookingId);
        if (existingNames.has(attKey)) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'payment') {
        const payKey = String(payload.ref);
        if (existingNames.has(payKey)) {
          skipped++;
          continue;
        }
      } else if (resourceType === 'event') {
        const evtKey = `${String(payload.title).toLowerCase()}|${String(payload.startAt || '')}`;
        if (existingNames.has(evtKey)) {
          skipped++;
          continue;
        }
      }

      if (keyString) seenKeys.set(keyString, rowNum);

      if (dryRun) {
        created++;
        continue;
      }

      try {
        if (isPostgresStore()) {
          await createPostgres(payload);
          created++;
          if (payload.email) existingEmails.add(normalizeEmail(payload.email));
          if (payload.phone) existingPhones.add(normalizePhone(payload.phone));
        } else {
          const result = await createErp(payload);
          const erpResult = result as any;
          const isDuplicate = Boolean(erpResult.duplicate);
          if (isDuplicate) {
            updated++;
          } else {
            created++;
            if (payload.email) existingEmails.add(normalizeEmail(payload.email));
            if (payload.phone) existingPhones.add(normalizePhone(payload.phone));
          }
        }
      } catch (err: any) {
        failed++;
        errors.push({ row: rowNum, field: '*', message: err.message || 'Import failed' });
      }
    }

    // Audit: record completion AFTER execution
    await this.prisma.withTenant(context.tenantId, async (tx: any) => {
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          actorType: 'human',
          actorId,
          action: dryRun ? 'import.dry_run.completed' : 'import.completed',
          resourceType,
          resourceRef: 'import-batch',
          beforeData: null,
          afterData: {
            dataset: resourceType,
            rowCount: rows.length,
            dryRun,
            status: dryRun ? 'preview_complete' : 'completed',
            created, updated, skipped, failed,
            errorCount: errors.length,
          },
          requestContext: { correlationId: context.correlationId },
        },
      });
      // Record idempotency key
      if (idempotencyKey && !dryRun) {
        await tx.idempotencyKey.create({
          data: {
            tenantId: context.tenantId,
            idempotencyKey,
            requestHash: hashIdempotencyKey(context.tenantId, idempotencyKey),
            responseStatus: 200,
            responseBody: { created, updated, skipped, failed, errorCount: errors.length },
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }
    });

    return { created, updated, skipped, failed, errors };
  }

  // ============================================================================
  // Member helpers
  // ============================================================================

  private validateImportMember(row: any, dto: ImportMemberDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    // Phone must be 10 digits after normalization
    if (dto.phone && normalizePhone(dto.phone).length !== 10) fieldErrors.push('phone');
    // Date format validation (accepts M/D/YYYY or YYYY-MM-DD)
    if (dto.joined && !parseDate(dto.joined)) fieldErrors.push('joined');
    if (dto.expiry && !parseDate(dto.expiry)) fieldErrors.push('expiry');
    return [...new Set(fieldErrors)];
  }

  private buildMemberPayload(row: any, dto: ImportMemberDto) {
    return {
      id: dto.id,
      name: dto.name,
      email: normalizeEmail(dto.email),
      phone: normalizePhone(dto.phone),
      plan: dto.plan || 'Premium',
      status: dto.status || 'Active',
      joined: parseDate(dto.joined) || new Date().toISOString().slice(0, 10),
      expiry: parseDate(dto.expiry) || '',
      coach: ((dto.coach as string) || undefined),
    };
  }

  // ============================================================================
  // Lead helpers
  // ============================================================================

  private validateImportLead(row: any, dto: ImportLeadDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.name) fieldErrors.push('name');
    if (!dto.email && !dto.phone) fieldErrors.push('email_or_phone');
    if (dto.phone && normalizePhone(dto.phone).length !== 10) fieldErrors.push('phone');
    if (dto.followUpDate && !parseDate(dto.followUpDate)) fieldErrors.push('followUpDate');
    return [...new Set(fieldErrors)];
  }

  private buildLeadPayload(row: any, dto: ImportLeadDto) {
    return {
      name: dto.name,
      email: normalizeEmail(dto.email),
      phone: normalizePhone(dto.phone),
      source: dto.source || 'Spreadsheet Import',
      stage: dto.stage || 'New enquiry',
      followUpDate: parseDate(dto.followUpDate) || new Date().toISOString().slice(0, 10),
      assigned: ((dto.assigned as string) || undefined),
      plan: dto.plan || 'Premium',
      notes: dto.notes || null,
    };
  }

  // ============================================================================
  // Class helpers
  // ============================================================================

  private validateImportClass(row: any, dto: ImportClassDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!parseDate(dto.date)) fieldErrors.push('date');
    return [...new Set(fieldErrors)];
  }

  private buildClassPayload(row: any, dto: ImportClassDto) {
    return {
      id: dto.id,
      name: dto.name,
      category: dto.category || 'Strength',
      date: parseDate(dto.date) || new Date().toISOString().slice(0, 10),
      startTime: dto.startTime,
      endTime: ((dto.endTime as string) || undefined),
      trainer: dto.trainer,
      room: ((dto.room as string) || undefined),
      capacity: dto.capacity || 12,
      status: dto.status || 'Scheduled',
    };
  }

  // ============================================================================
  // Membership helpers
  // ============================================================================

  private validateImportMembership(row: any, dto: ImportMembershipDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.name) fieldErrors.push('name');
    if (!dto.planType) fieldErrors.push('planType');
    if (dto.priceINR !== undefined && dto.priceINR <= 0) fieldErrors.push('priceINR');
    return [...new Set(fieldErrors)];
  }

  private buildMembershipPayload(row: any, dto: ImportMembershipDto) {
    return {
      name: dto.name || 'Unnamed Plan',
      planType: dto.planType || 'Monthly',
      priceINR: dto.priceINR || 0,
      sessionLimit: dto.sessionLimit || 0,
      active: dto.active !== undefined ? dto.active : true,
    };
  }

  // ============================================================================
  // Booking helpers
  // ============================================================================

  private validateImportBooking(row: any, dto: ImportBookingDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.classId) fieldErrors.push('classId');
    if (!dto.memberId) fieldErrors.push('memberId');
    return [...new Set(fieldErrors)];
  }

  private buildBookingPayload(row: any, dto: ImportBookingDto) {
    return {
      id: dto.id,
      classId: dto.classId,
      memberId: dto.memberId,
      status: dto.status || 'Confirmed',
      bookedAt: dto.bookedAt || new Date().toISOString(),
    };
  }

  // ============================================================================
  // Attendance helpers
  // ============================================================================

  private validateImportAttendance(row: any, dto: ImportAttendanceDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.bookingId) fieldErrors.push('bookingId');
    return [...new Set(fieldErrors)];
  }

  private buildAttendancePayload(row: any, dto: ImportAttendanceDto) {
    return {
      bookingId: dto.bookingId,
      status: dto.status || 'Present',
      checkedInAt: dto.checkedInAt ?? null,
    };
  }

  // ============================================================================
  // Payment helpers
  // ============================================================================

  private validateImportPayment(row: any, dto: ImportPaymentDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.ref) fieldErrors.push('ref');
    if (!dto.memberId) fieldErrors.push('memberId');
    if (dto.amount !== undefined && dto.amount <= 0) fieldErrors.push('amount');
    return [...new Set(fieldErrors)];
  }

  private buildPaymentPayload(row: any, dto: ImportPaymentDto) {
    return {
      ref: dto.ref,
      date: dto.date || new Date().toISOString(),
      memberId: dto.memberId,
      type: dto.type || 'Membership',
      method: dto.method || 'UPI',
      status: dto.status || 'Pending',
      amount: dto.amount || 0,
      refundedAmount: dto.refundedAmount || 0,
      notes: dto.notes || null,
    };
  }

  // ============================================================================
  // Event helpers
  // ============================================================================

  private validateImportEvent(row: any, dto: ImportEventDto): string[] {
    const errors = validateSync(dto, { skipMissingProperties: true });
    const fieldErrors = errors.flatMap((e) => Object.keys(e.constraints || {}));
    if (!dto.title) fieldErrors.push('title');
    if (!dto.startAt) fieldErrors.push('startAt');
    return [...new Set(fieldErrors)];
  }

  private buildEventPayload(row: any, dto: ImportEventDto) {
    return {
      title: dto.title,
      category: dto.category || 'General',
      startAt: dto.startAt,
      endAt: dto.endAt || dto.startAt,
      venue: dto.venue || '',
      organizer: dto.organizer || '',
      capacity: dto.capacity || 0,
    };
  }

  // ============================================================================
  // EXPORT
  // ============================================================================

  async exportDataset(
    context: Context,
    dto: ExportQueryDto,
    actorId: string,
  ): Promise<{ data: any[]; count: number; format: string }> {
    const dataset = dto.dataset || 'members';
    const page = dto.page || 1;
    const limit = Math.min(dto.limit || 100, 5000);
    const offset = (page - 1) * limit;

    // Audit: record export start
    await this.prisma.withTenant(context.tenantId, async (tx: any) => {
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          actorType: 'human',
          actorId,
          action: 'export.started',
          resourceType: dataset,
          resourceRef: `export-${dataset}`,
          beforeData: null,
          afterData: {
            dataset,
            page,
            limit,
            filters: { from: dto.from, to: dto.to, status: dto.status },
            format: dto.format || 'json',
          },
          requestContext: { correlationId: context.correlationId },
        },
      });
    });

    let data: any[] = [];
    let count = 0;

    try {
      const result = await this.fetchDataset(dataset, context, {
        page,
        limit,
        offset,
        from: dto.from,
        to: dto.to,
        status: dto.status,
      });
      data = result.data;
      count = result.count;
    } catch (err: any) {
      await this.prisma.withTenant(context.tenantId, async (tx: any) => {
        await tx.auditLog.create({
          data: {
            tenantId: context.tenantId,
            correlationId: context.correlationId,
            actorType: 'human',
            actorId,
            action: 'export.failed',
            resourceType: dataset,
            resourceRef: `export-${dataset}`,
            beforeData: null,
            afterData: {
              dataset,
              status: 'failed',
              error: err.message,
            },
            requestContext: { correlationId: context.correlationId },
          },
        });
      });
      throw err;
    }

    // Audit: record export completion
    await this.prisma.withTenant(context.tenantId, async (tx: any) => {
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          correlationId: context.correlationId,
          actorType: 'human',
          actorId,
          action: 'export.completed',
          resourceType: dataset,
          resourceRef: `export-${dataset}`,
          beforeData: null,
          afterData: {
            dataset,
            page,
            limit,
            recordCount: data.length,
            totalCount: count,
            status: 'completed',
            format: dto.format || 'json',
          },
          requestContext: { correlationId: context.correlationId },
        },
      });
    });

    if (dto.format === 'csv') {
      const sanitizedData = data.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        const sanitized: Record<string, any> = {};
        for (const [k, v] of Object.entries(item)) {
          sanitized[k] = typeof v === 'string' ? sanitizeCsvCell(v) : v;
        }
        return sanitized;
      });
      return { data: sanitizedData, count, format: 'csv' };
    }

    return { data, count, format: dto.format || 'json' };
  }

  private async fetchDataset(
    dataset: ExportDataset,
    context: Context,
    opts: { page: number; limit: number; offset: number; from?: string; to?: string; status?: string },
  ): Promise<{ data: any[]; count: number }> {
    if (isPostgresStore()) {
      return this.fetchDatasetPostgres(dataset, context, opts);
    }
    const methodMap: Record<ExportDataset, string> = {
      members: 'wellness_studio.api.member.list_members',
      leads: 'wellness_studio.api.lead.list_leads',
      classes: 'wellness_studio.api.classes.list_classes',
      memberships: 'wellness_studio.api.membership.list_memberships',
      bookings: 'wellness_studio.api.booking.list_bookings',
      attendance: 'wellness_studio.api.attendance.list_attendance',
      payments: 'wellness_studio.api.payment.list_payments',
      events: 'wellness_studio.api.event.list_events',
    };

    const method = methodMap[dataset];
    if (!method) {
      throw new NotFoundException(`Export not supported for dataset: ${dataset}`);
    }

    const result = await this.erp.call({
      tenantId: context.tenantCode,
      correlationId: context.correlationId,
      method,
      httpMethod: 'GET',
      body: {
        tenant: context.tenantCode,
        limit: opts.limit,
        start: opts.offset,
        ...(opts.from ? { from: opts.from } : {}),
        ...(opts.to ? { to: opts.to } : {}),
        ...(opts.status ? { status: opts.status } : {}),
      },
    }) as any;

    const dataKey = `${dataset}s`;
    const data = result?.[dataKey] || result?.data || result || [];
    const count = result?.count || result?.total || data.length;

    return { data: Array.isArray(data) ? data : [data], count: Number(count) || data.length };
  }

  private async fetchDatasetPostgres(
    dataset: ExportDataset,
    context: Context,
    opts: { page: number; limit: number; offset: number; from?: string; to?: string; status?: string },
  ): Promise<{ data: any[]; count: number }> {
    return this.prisma.withTenant(context.tenantId, async (tx: any) => {
      const where: any = { tenantId: context.tenantId };
      if (opts.from) where.createdAt = { ...where.createdAt, gte: new Date(opts.from) };
      if (opts.to) where.createdAt = { ...where.createdAt, lte: new Date(opts.to) };
      if (opts.status) where.status = opts.status;

      const modelMap: Record<ExportDataset, string> = {
        members: 'studioMember',
        leads: 'studioLead',
        classes: 'studioClass',
        memberships: 'studioMembership',
        bookings: 'studioBooking',
        attendance: 'studioAttendance',
        payments: 'studioPayment',
        events: 'studioEvent',
      };

      const model = modelMap[dataset];
      if (!model) {
        throw new NotFoundException(`Export not supported for dataset: ${dataset}`);
      }

      const [data, count] = await Promise.all([
        (tx as any)[model].findMany({
          where,
          skip: opts.offset,
          take: opts.limit,
          orderBy: { createdAt: 'desc' },
        }),
        (tx as any)[model].count({ where }),
      ]);

      return { data, count };
    });
  }
}
