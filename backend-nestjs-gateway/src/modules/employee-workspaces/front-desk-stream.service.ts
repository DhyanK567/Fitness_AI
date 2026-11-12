import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import Redis from 'ioredis';
import { PrismaService } from '../../common/prisma.service';
import { RedisClient } from '../../common/redis-client';

const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const FLOOR_ALERT_CHANNEL_PREFIX = 'front-desk:alerts:';
export const FLOOR_ALERT_CHANNEL_PATTERN = 'front-desk:alerts:*';

const VALID_FLOOR_ALERT_TYPES = new Set([
  'SURGE_90',
  'FULL_100',
  'LOW_ATTENDANCE_4H',
]);
const VALID_FLOOR_ALERT_SEVERITIES = new Set(['info', 'warning', 'critical']);

export interface CheckinAlert {
  eventId: string;
  tenantId: string;
  memberId: string;
  memberName: string;
  memberEmail?: string;
  memberPhone?: string;
  membershipTier?: string;
  membershipDaysRemaining?: number;
  checkinTime: string;
  classId?: string;
  className?: string;
  medicalAlert?: string;
  streakDays: number;
  isTrialGuest: boolean;
  vipTag: boolean;
}

export interface FloorCapacityStreamEvent {
  eventId: string;
  eventType: 'floor.capacity.alert';
  tenantId: string;
  alertType: 'SURGE_90' | 'FULL_100' | 'LOW_ATTENDANCE_4H';
  severity: 'info' | 'warning' | 'critical';
  operationalAlertId: string | null;
  outboxEventId: string | null;
  classId: string;
  className: string;
  startTimeIso: string;
  booked: number;
  capacity: number;
  waitlisted: number;
  occupancyPct: number;
  message: string;
  dedupKey: string;
  publishedAt: string;
}

export interface FrontDeskSseEvent {
  id?: string;
  type?: 'floor.capacity.alert';
  data: CheckinAlert | FloorCapacityStreamEvent;
}

type FrontDeskStreamEmission =
  | { kind: 'checkin'; tenantId: string; data: CheckinAlert }
  | { kind: 'floor_alert'; tenantId: string; data: FloorCapacityStreamEvent };

/**
 * Production Front Desk Live Arrival & Floor Capacity Stream service.
 *
 * Maintains an in-process RxJS Subject that broadcasts member check-in events
 * and Redis Pub/Sub floor-capacity alerts to connected front-desk browsers via SSE.
 */
@Injectable()
export class FrontDeskStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FrontDeskStreamService.name);
  private readonly streamSubject = new Subject<FrontDeskStreamEmission>();
  private subscriber: Redis | null = null;
  private isSubscribed = false;
  private subscribeInFlight: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject('REDIS_CLIENT') private readonly redis?: RedisClient,
  ) {}

  async onModuleInit(): Promise<void> {
    this.destroyed = false;
    const baseClient = this.redis?.getClient?.();
    if (!baseClient || typeof baseClient.duplicate !== 'function') {
      this.logger.debug(
        'Redis client not configured; front-desk floor-capacity Pub/Sub subscriber disabled.',
      );
      return;
    }

    if (
      baseClient instanceof Redis &&
      process.env.NODE_ENV === 'test' &&
      !process.env.REDIS_HOST
    ) {
      return;
    }

    const subscriber = baseClient.duplicate({
      lazyConnect: true,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times: number): number => Math.min(times * 250, 5000),
    });

    this.subscriber = subscriber;

    subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      this.handleRedisPatternMessage(channel, message);
    });

    subscriber.on('error', (err: Error) => {
      this.logger.warn(`Front desk Redis subscriber error: ${err.message}`);
    });

    subscriber.on('reconnecting', (delayMs: number) => {
      this.isSubscribed = false;
      this.logger.warn(
        `Front desk Redis subscriber reconnecting in ${delayMs}ms...`,
      );
    });

    subscriber.on('ready', () => {
      if (!this.destroyed && !this.isSubscribed) {
        void this.ensurePatternSubscribed(subscriber);
      }
    });

    try {
      if (
        subscriber.status === 'wait' &&
        typeof subscriber.connect === 'function'
      ) {
        await subscriber.connect();
      }
      await this.ensurePatternSubscribed(subscriber);
    } catch (err: unknown) {
      this.logger.warn(
        `Front desk Redis subscriber initial connection failed; retry strategy will recover: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.isSubscribed = false;
    const activeSubscriber = this.subscriber;
    this.subscriber = null;

    if (activeSubscriber) {
      try {
        if (typeof activeSubscriber.removeAllListeners === 'function') {
          activeSubscriber.removeAllListeners();
        }
        if (typeof activeSubscriber.punsubscribe === 'function') {
          await activeSubscriber
            .punsubscribe(FLOOR_ALERT_CHANNEL_PATTERN)
            .catch(() => undefined);
        }
        if (
          activeSubscriber.status === 'ready' ||
          activeSubscriber.status === 'connect'
        ) {
          await activeSubscriber.quit();
        } else if (typeof activeSubscriber.disconnect === 'function') {
          activeSubscriber.disconnect();
        }
      } catch (err: unknown) {
        this.logger.warn(
          `Error closing front desk Redis subscriber: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          activeSubscriber.disconnect?.();
        } catch {
          // Ignore final disconnect cleanup error
        }
      }
    }

    this.streamSubject.complete();
  }

  /**
   * Returns an observable SSE stream filtered to a specific tenant.
   * Front desk browsers subscribe to this via the SSE controller endpoint.
   */
  getEventStream(tenantId: string): Observable<FrontDeskSseEvent> {
    if (typeof tenantId !== 'string' || !CANONICAL_UUID_REGEX.test(tenantId)) {
      throw new Error(
        'A canonical tenant UUID is required for Front Desk SSE subscriptions.',
      );
    }

    return this.streamSubject.asObservable().pipe(
      filter((item) => item.tenantId === tenantId),
      map((item): FrontDeskSseEvent => {
        if (item.kind === 'floor_alert') {
          return {
            id: item.data.outboxEventId ?? item.data.eventId,
            type: 'floor.capacity.alert',
            data: item.data,
          };
        }
        return { data: item.data };
      }),
    );
  }

  /**
   * Publish a check-in alert to all connected front desk screens for the tenant.
   * Called when a member checks in (attendance recorded).
   */
  publishCheckin(alert: CheckinAlert): void {
    if (
      !alert?.tenantId ||
      typeof alert.tenantId !== 'string' ||
      !CANONICAL_UUID_REGEX.test(alert.tenantId)
    ) {
      this.logger.warn(
        `Rejected check-in broadcast with invalid tenantId '${String(alert?.tenantId ?? '')}'.`,
      );
      return;
    }

    this.logger.log(
      `Broadcasting check-in: ${alert.memberName} (${alert.membershipTier || 'Guest'}) to tenant ${alert.tenantId}`,
    );
    this.streamSubject.next({
      kind: 'checkin',
      tenantId: alert.tenantId,
      data: alert,
    });
  }

  private async ensurePatternSubscribed(subscriber: Redis): Promise<void> {
    if (this.destroyed || this.isSubscribed) {
      return;
    }
    if (this.subscribeInFlight) {
      return this.subscribeInFlight;
    }

    this.subscribeInFlight = (async () => {
      try {
        await subscriber.psubscribe(FLOOR_ALERT_CHANNEL_PATTERN);
        this.isSubscribed = true;
        this.logger.log(
          `Subscribed to Redis Pub/Sub pattern '${FLOOR_ALERT_CHANNEL_PATTERN}'.`,
        );
      } catch (err: unknown) {
        this.logger.warn(
          `Failed subscribing to '${FLOOR_ALERT_CHANNEL_PATTERN}': ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        this.subscribeInFlight = null;
      }
    })();

    return this.subscribeInFlight;
  }

  private handleRedisPatternMessage(channel: string, rawMessage: string): void {
    const channelTenantId = this.extractTenantIdFromChannel(channel);
    if (!channelTenantId) {
      this.logger.warn(
        `Rejected Redis alert on invalid or non-canonical tenant channel '${channel}'.`,
      );
      return;
    }

    const validated = this.validateFloorCapacityMessage(
      rawMessage,
      channelTenantId,
    );
    if (!validated) {
      return;
    }

    this.logger.debug(
      `Forwarding floor capacity alert ${validated.alertType} (${validated.eventId}) to SSE stream for tenant ${validated.tenantId}`,
    );
    this.streamSubject.next({
      kind: 'floor_alert',
      tenantId: validated.tenantId,
      data: validated,
    });
  }

  private extractTenantIdFromChannel(channel: string): string | null {
    if (
      typeof channel !== 'string' ||
      !channel.startsWith(FLOOR_ALERT_CHANNEL_PREFIX)
    ) {
      return null;
    }
    const tenantId = channel.slice(FLOOR_ALERT_CHANNEL_PREFIX.length);
    return CANONICAL_UUID_REGEX.test(tenantId) ? tenantId : null;
  }

  private validateFloorCapacityMessage(
    rawMessage: string,
    channelTenantId: string,
  ): FloorCapacityStreamEvent | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      this.logger.warn(
        `Rejected malformed JSON Redis message on channel '${FLOOR_ALERT_CHANNEL_PREFIX}${channelTenantId}'.`,
      );
      return null;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.logger.warn(
        `Rejected non-object Redis message on channel '${FLOOR_ALERT_CHANNEL_PREFIX}${channelTenantId}'.`,
      );
      return null;
    }

    const record = parsed as Record<string, unknown>;

    if (
      typeof record.tenantId !== 'string' ||
      !CANONICAL_UUID_REGEX.test(record.tenantId)
    ) {
      this.logger.warn(
        `Rejected floor alert with invalid tenantId on channel '${FLOOR_ALERT_CHANNEL_PREFIX}${channelTenantId}'.`,
      );
      return null;
    }

    if (record.tenantId !== channelTenantId) {
      this.logger.warn(
        `Rejected cross-tenant floor alert mismatch: channel=${channelTenantId}, payload=${record.tenantId}.`,
      );
      return null;
    }

    if (record.eventType !== 'floor.capacity.alert') {
      this.logger.warn(
        `Rejected floor alert with unsupported eventType '${String(record.eventType ?? '')}'.`,
      );
      return null;
    }

    if (
      typeof record.eventId !== 'string' ||
      record.eventId.trim().length === 0 ||
      typeof record.alertType !== 'string' ||
      !VALID_FLOOR_ALERT_TYPES.has(record.alertType) ||
      typeof record.severity !== 'string' ||
      !VALID_FLOOR_ALERT_SEVERITIES.has(record.severity) ||
      typeof record.classId !== 'string' ||
      !CANONICAL_UUID_REGEX.test(record.classId) ||
      typeof record.className !== 'string' ||
      record.className.trim().length === 0 ||
      typeof record.startTimeIso !== 'string' ||
      Number.isNaN(new Date(record.startTimeIso).getTime()) ||
      typeof record.booked !== 'number' ||
      !Number.isFinite(record.booked) ||
      record.booked < 0 ||
      typeof record.capacity !== 'number' ||
      !Number.isFinite(record.capacity) ||
      record.capacity <= 0 ||
      typeof record.waitlisted !== 'number' ||
      !Number.isFinite(record.waitlisted) ||
      record.waitlisted < 0 ||
      typeof record.occupancyPct !== 'number' ||
      !Number.isFinite(record.occupancyPct) ||
      record.occupancyPct < 0 ||
      typeof record.message !== 'string' ||
      record.message.trim().length === 0 ||
      typeof record.dedupKey !== 'string' ||
      record.dedupKey.trim().length === 0 ||
      typeof record.publishedAt !== 'string' ||
      Number.isNaN(new Date(record.publishedAt).getTime())
    ) {
      this.logger.warn(
        `Rejected incomplete or invalid floor capacity alert payload for tenant ${channelTenantId}.`,
      );
      return null;
    }

    const operationalAlertId =
      typeof record.operationalAlertId === 'string' &&
      record.operationalAlertId.trim().length > 0
        ? record.operationalAlertId.trim()
        : record.operationalAlertId === null ||
            record.operationalAlertId === undefined
          ? null
          : undefined;
    const outboxEventId =
      typeof record.outboxEventId === 'string' &&
      record.outboxEventId.trim().length > 0
        ? record.outboxEventId.trim()
        : record.outboxEventId === null || record.outboxEventId === undefined
          ? null
          : undefined;

    if (operationalAlertId === undefined || outboxEventId === undefined) {
      this.logger.warn(
        `Rejected floor capacity alert with invalid ID fields for tenant ${channelTenantId}.`,
      );
      return null;
    }

    // Construct a sanitized payload containing only non-PII floor capacity fields
    return {
      eventId: record.eventId.trim(),
      eventType: 'floor.capacity.alert',
      tenantId: record.tenantId,
      alertType: record.alertType as FloorCapacityStreamEvent['alertType'],
      severity: record.severity as FloorCapacityStreamEvent['severity'],
      operationalAlertId,
      outboxEventId,
      classId: record.classId,
      className: record.className.trim(),
      startTimeIso: record.startTimeIso,
      booked: record.booked,
      capacity: record.capacity,
      waitlisted: record.waitlisted,
      occupancyPct: record.occupancyPct,
      message: record.message.trim(),
      dedupKey: record.dedupKey.trim(),
      publishedAt: record.publishedAt,
    };
  }

  /**
   * Build a rich check-in alert from an attendance event by enriching it with
   * member context from the database (membership tier, medical notes, streak).
   */
  async buildCheckinAlert(
    tenantId: string,
    memberId: string,
    classId?: string,
  ): Promise<CheckinAlert> {
    if (typeof tenantId !== 'string' || !CANONICAL_UUID_REGEX.test(tenantId)) {
      throw new Error(
        'A canonical tenant UUID is required to build a check-in alert.',
      );
    }
    return this.prisma.withTenant(tenantId, async (tx) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memberId);

      // Fetch member details if valid UUID
      const member = isUuid
        ? await tx.studioMember.findFirst({
            where: { id: memberId, tenantId },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              plan: true,
              status: true,
              expiry: true,
            },
          }).catch(() => null)
        : null;

      // If not a registered member, check if checking in as a lead/trial guest
      let lead: { id: string; name: string; email: string | null; phone: string | null; notes: string | null; plan: string } | null = null;
      if (isUuid && !member) {
        lead = await tx.studioLead.findFirst({
          where: { id: memberId, tenantId },
          select: { id: true, name: true, email: true, phone: true, notes: true, plan: true },
        }).catch(() => null);
      }

      // Calculate days remaining on membership
      let daysRemaining: number | undefined;
      let tierName = member?.plan || (lead ? 'Trial Guest' : 'Standard');
      if (member?.expiry) {
        const endDate = new Date(member.expiry);
        daysRemaining = Math.max(
          0,
          Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
      }

      // Calculate attendance streak (consecutive days with check-in via bookings)
      const memberBookings = await tx.studioBooking.findMany({
        where: { tenantId, memberId },
        select: { id: true },
      });
      const bookingIds = memberBookings.map((b) => b.id);

      const recentAttendance = bookingIds.length > 0
        ? await tx.studioAttendance.findMany({
            where: {
              tenantId,
              bookingId: { in: bookingIds },
              status: { in: ['Present', 'Attended', 'present', 'attended'] },
            },
            orderBy: { createdAt: 'desc' },
            take: 90,
            select: { createdAt: true },
          })
        : [];

      const streakDays = this.calculateStreak(recentAttendance.map((a) => a.createdAt));

      // Fetch class name if classId provided
      let className: string | undefined;
      if (classId) {
        const isClassUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classId);
        const cls = isClassUuid
          ? await tx.studioClass.findFirst({
              where: { id: classId, tenantId },
              select: { name: true },
            }).catch(() => null)
          : null;
        className = cls?.name || undefined;
      }

      // Fetch latest trainer progress note to detect medical alerts
      const progressNote = member ? await tx.trainerProgressNote.findFirst({
        where: { memberId: member.id, tenantId },
        orderBy: { recordedAt: 'desc' },
        select: { notes: true },
      }).catch(() => null) : null;

      // Detect medical alerts from member notes or lead enquiry notes
      const medicalAlert = this.extractMedicalAlert(progressNote?.notes || lead?.notes);

      // Determine VIP status (annual plans or 30+ day streaks)
      const isVip =
        (tierName.toLowerCase().includes('annual') ||
          tierName.toLowerCase().includes('vip') ||
          tierName.toLowerCase().includes('unlimited') ||
          streakDays >= 30);

      // Determine if trial guest (no active member record or lead record)
      const isTrialGuest = !member || member.status?.toLowerCase() === 'trial';

      return {
        eventId: `chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tenantId,
        memberId: member?.id || lead?.id || memberId,
        memberName: member?.fullName || lead?.name || 'Guest',
        memberEmail: member?.email || lead?.email || undefined,
        memberPhone: member?.phone || lead?.phone || undefined,
        membershipTier: tierName,
        membershipDaysRemaining: daysRemaining,
        checkinTime: new Date().toISOString(),
        classId,
        className,
        medicalAlert,
        streakDays,
        isTrialGuest,
        vipTag: isVip,
      };
    });
  }

  /**
   * Calculate consecutive attendance streak (days in a row with at least 1 check-in).
   */
  private calculateStreak(dates: Date[]): number {
    if (dates.length === 0) return 0;

    const uniqueDays = new Set(
      dates.map((d) => new Date(d).toISOString().split('T')[0]),
    );
    const sortedDays = [...uniqueDays].sort().reverse();

    let streak = 0;
    const today = new Date().toISOString().split('T')[0];
    let expectedDay = today;

    for (const day of sortedDays) {
      if (day === expectedDay || day === this.previousDay(expectedDay)) {
        streak++;
        expectedDay = this.previousDay(day);
      } else {
        break;
      }
    }

    return streak;
  }

  private previousDay(dateStr: string): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  /**
   * Extract medical/health alert keywords from member notes.
   */
  private extractMedicalAlert(notes?: string | null): string | undefined {
    if (!notes) return undefined;

    const alertKeywords = [
      'injury', 'herniation', 'surgery', 'asthma', 'diabetes',
      'hypertension', 'blood pressure', 'cardiac', 'heart',
      'pregnancy', 'pregnant', 'knee', 'back pain', 'shoulder',
      'allergy', 'epilepsy', 'vertigo', 'fracture',
    ];

    const lower = notes.toLowerCase();
    const matchedAlerts = alertKeywords.filter((kw) => lower.includes(kw));

    if (matchedAlerts.length === 0) return undefined;

    // Extract the relevant sentence/phrase containing the alert
    const sentences = notes.split(/[.;\n]/);
    const alertSentences = sentences.filter((s) =>
      alertKeywords.some((kw) => s.toLowerCase().includes(kw)),
    );

    return alertSentences.map((s) => s.trim()).filter(Boolean).join('; ') || undefined;
  }
}

