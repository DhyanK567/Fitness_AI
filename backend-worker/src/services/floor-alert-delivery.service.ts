import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import {
  FLOOR_ALERT_TYPES,
  FloorAlert,
  FloorAlertOutboxPayload,
  FloorAlertSeverity,
  FloorAlertType,
} from '../contracts/floor-alert.types';

const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FLOOR_ALERT_EVENT_TYPE = 'floor.capacity.alert';
export const FLOOR_ALERT_REDIS_CHANNEL_PREFIX = 'front-desk:alerts:';

export function buildFloorAlertRedisChannel(tenantId: string): string {
  return `${FLOOR_ALERT_REDIS_CHANNEL_PREFIX}${tenantId}`;
}

export interface FloorCapacityStreamEvent {
  eventId: string;
  eventType: 'floor.capacity.alert';
  tenantId: string;
  alertType: FloorAlertType;
  severity: FloorAlertSeverity;
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

/**
 * Configurable alert deduplication policies.
 *
 * Default (`ONCE_PER_CLASS_PER_ALERT_TYPE`) enforces at-most-once alert & outbox creation
 * per `(tenantId, classId, alertType)` via `ops.outbox_events` unique index `ix_outbox_idempotency`.
 *
 * Future re-alerting note (after occupancy drops below threshold and rises again):
 * Supporting threshold-crossing re-alerts safely without mutating existing Outbox history
 * would require tracking explicit transition epochs or resolved/reset state in a persistent
 * column/table and appending that monotonic crossing epoch (`:epoch:{n}`) or cooldown bucket
 * to `idempotencyKey`.
 */
export const FLOOR_ALERT_DEDUPLICATION_POLICIES = {
  ONCE_PER_CLASS_PER_ALERT_TYPE: 'ONCE_PER_CLASS_PER_ALERT_TYPE',
} as const;

export type FloorAlertDeduplicationPolicy =
  (typeof FLOOR_ALERT_DEDUPLICATION_POLICIES)[keyof typeof FLOOR_ALERT_DEDUPLICATION_POLICIES];

export const DEFAULT_FLOOR_ALERT_DEDUPLICATION_POLICY: FloorAlertDeduplicationPolicy =
  FLOOR_ALERT_DEDUPLICATION_POLICIES.ONCE_PER_CLASS_PER_ALERT_TYPE;

export interface DeliverFloorAlertOptions {
  /** Optional correlation UUID linking the booking/monitor trigger to the alert. */
  correlationId?: string;
  /** Optional caller tenant check to reject cross-tenant alert routing. */
  expectedTenantId?: string;
  /** Override configured deduplication policy (defaults to ONCE_PER_CLASS_PER_ALERT_TYPE). */
  deduplicationPolicy?: FloorAlertDeduplicationPolicy;
}

export interface FloorAlertDeliveryResult {
  created: boolean;
  deduplicated: boolean;
  operationalAlertId: string | null;
  outboxEventId: string | null;
  idempotencyKey: string;
}

@Injectable()
export class FloorAlertDeliveryService {
  private readonly logger = new Logger(FloorAlertDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisClient,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Persist an `OperationalAlert` and enqueue an `OutboxEvent` atomically inside one
   * tenant-scoped Prisma transaction (`PrismaService.withTenant`).
   *
   * Uses `ops.outbox_events(tenant_id, idempotency_key)` uniqueness (`ix_outbox_idempotency`)
   * to prevent duplicate outbox dispatches and duplicate alert creation safely.
   */
  async deliverAlert(
    alert: FloorAlert,
    options: DeliverFloorAlertOptions = {},
  ): Promise<FloorAlertDeliveryResult> {
    this.validateAlertInput(alert, options.expectedTenantId);

    const policy = this.resolveDeduplicationPolicy(options.deduplicationPolicy);
    const tenantId = alert.tenantId;
    const idempotencyKey = this.buildIdempotencyKey(alert, policy);
    const correlationId =
      options.correlationId && CANONICAL_UUID_REGEX.test(options.correlationId)
        ? options.correlationId
        : randomUUID();
    const severity = alert.severity ?? this.resolveSeverity(alert.type);
    const title = alert.title ?? this.resolveTitle(alert.type, alert.className);
    const startTimeIso = this.parseValidStartTime(
      alert.startTime,
    ).toISOString();
    const waitlisted = alert.waitlisted ?? 0;
    const occupancyPct = this.resolveOccupancyPct(alert);

    let deliveryResult: FloorAlertDeliveryResult;

    try {
      deliveryResult = await this.prisma.withTenant(tenantId, async (tx) => {
        // Fast-path check avoids aborting a transaction when an identical outbox event already exists
        if (typeof tx.outboxEvent?.findFirst === 'function') {
          const existingOutbox = await tx.outboxEvent.findFirst({
            where: { tenantId, idempotencyKey },
            select: { id: true, payload: true },
          });

          if (existingOutbox) {
            const existingAlertId = await this.resolveOperationalAlertId(
              tx,
              tenantId,
              idempotencyKey,
              alert.classId,
              existingOutbox.payload,
            );
            this.logger.debug(
              `Skipped duplicate floor alert (idempotencyKey=${idempotencyKey}, tenantId=${tenantId}, policy=${policy})`,
            );
            return {
              created: false,
              deduplicated: true,
              operationalAlertId: existingAlertId,
              outboxEventId: existingOutbox.id,
              idempotencyKey,
            };
          }
        }

        const operationalAlert = await tx.operationalAlert.create({
          data: {
            tenantId,
            alertType: this.mapOperationalAlertCategory(alert.type),
            severity,
            title,
            message: alert.message,
            sourceEntityId: alert.classId,
            sourceEntityType: 'studio_class',
            metadata: {
              floorAlertType: alert.type,
              classId: alert.classId,
              className: alert.className,
              startTimeIso,
              booked: alert.booked,
              capacity: alert.capacity,
              waitlisted,
              occupancyPct,
              minutesUntilStart: alert.minutesUntilStart ?? null,
              roomName: alert.roomName ?? null,
              trainerName: alert.trainerName ?? null,
              dedupKey: alert.dedupKey,
              idempotencyKey,
              deduplicationPolicy: policy,
            },
          },
          select: { id: true },
        });

        const outboxPayload: FloorAlertOutboxPayload = {
          tenantId,
          alertType: alert.type,
          severity,
          classId: alert.classId,
          className: alert.className,
          startTimeIso,
          booked: alert.booked,
          capacity: alert.capacity,
          waitlisted,
          occupancyPct,
          message: alert.message,
          dedupKey: alert.dedupKey,
          operationalAlertId: operationalAlert.id,
        };

        const outboxEvent = await tx.outboxEvent.create({
          data: {
            tenantId,
            eventType: FLOOR_ALERT_EVENT_TYPE,
            subjectType: 'studio_class',
            subjectRef: alert.classId,
            correlationId,
            idempotencyKey,
            payload: outboxPayload as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });

        this.logger.log(
          `Persisted floor alert ${operationalAlert.id} and outbox event ${outboxEvent.id} (tenant=${tenantId}, class=${alert.classId}, type=${alert.type})`,
        );

        return {
          created: true,
          deduplicated: false,
          operationalAlertId: operationalAlert.id,
          outboxEventId: outboxEvent.id,
          idempotencyKey,
        };
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintViolation(error)) {
        // Concurrent race rolled back the transaction safely; perform a fresh tenant-scoped lookup
        this.logger.warn(
          `Unique idempotency conflict suppressed duplicate floor alert (idempotencyKey=${idempotencyKey}, tenant=${tenantId})`,
        );
        const existing = await this.findExistingDeliveryByKey(
          tenantId,
          idempotencyKey,
          alert.classId,
        );
        return {
          created: false,
          deduplicated: true,
          operationalAlertId: existing?.operationalAlertId ?? null,
          outboxEventId: existing?.outboxEventId ?? null,
          idempotencyKey,
        };
      }

      this.logger.error(
        `Failed persisting floor alert for tenant=${tenantId}, class=${alert.classId}, type=${alert.type}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    if (deliveryResult.created) {
      await this.publishFloorAlertToRedis({
        eventId: deliveryResult.outboxEventId ?? correlationId,
        eventType: FLOOR_ALERT_EVENT_TYPE,
        tenantId,
        alertType: alert.type,
        severity,
        operationalAlertId: deliveryResult.operationalAlertId,
        outboxEventId: deliveryResult.outboxEventId,
        classId: alert.classId,
        className: alert.className,
        startTimeIso,
        booked: alert.booked,
        capacity: alert.capacity,
        waitlisted,
        occupancyPct,
        message: alert.message,
        dedupKey: alert.dedupKey,
        publishedAt: new Date().toISOString(),
      });
    }

    return deliveryResult;
  }

  private async publishFloorAlertToRedis(
    streamEvent: FloorCapacityStreamEvent,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    if (!CANONICAL_UUID_REGEX.test(streamEvent.tenantId)) {
      this.logger.warn(
        `Skipped Redis publish due to non-canonical tenant UUID '${streamEvent.tenantId}'.`,
      );
      return;
    }

    const channel = buildFloorAlertRedisChannel(streamEvent.tenantId);

    try {
      const payloadJson = JSON.stringify(streamEvent);
      if (typeof this.redis.publish === 'function') {
        await this.redis.publish(channel, payloadJson);
      } else if (typeof this.redis.getClient === 'function') {
        await this.redis.getClient().publish(channel, payloadJson);
      }
    } catch (error: unknown) {
      // Redis Pub/Sub is best-effort live fan-out; never roll back or fail committed DB persistence
      this.logger.error(
        `Failed publishing floor alert ${streamEvent.outboxEventId ?? streamEvent.eventId} to Redis channel ${channel}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  resolveDeduplicationPolicy(
    overridePolicy?: FloorAlertDeduplicationPolicy,
  ): FloorAlertDeduplicationPolicy {
    const raw =
      overridePolicy ??
      this.config?.get<string>('FLOOR_ALERT_DEDUP_POLICY') ??
      DEFAULT_FLOOR_ALERT_DEDUPLICATION_POLICY;

    if (
      raw ===
      FLOOR_ALERT_DEDUPLICATION_POLICIES.ONCE_PER_CLASS_PER_ALERT_TYPE
    ) {
      return raw;
    }

    throw new Error(
      `Unsupported floor alert deduplication policy '${String(raw)}'.`,
    );
  }

  buildIdempotencyKey(
    alert: Pick<FloorAlert, 'tenantId' | 'classId' | 'type'>,
    policy: FloorAlertDeduplicationPolicy = this.resolveDeduplicationPolicy(),
  ): string {
    switch (policy) {
      case FLOOR_ALERT_DEDUPLICATION_POLICIES.ONCE_PER_CLASS_PER_ALERT_TYPE:
        return `floor-alert:${alert.tenantId}:${alert.classId}:${alert.type}`;
    }
  }

  private async findExistingDeliveryByKey(
    tenantId: string,
    idempotencyKey: string,
    classId: string,
  ): Promise<{
    outboxEventId: string | null;
    operationalAlertId: string | null;
  } | null> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const existingOutbox = await tx.outboxEvent.findFirst({
        where: {
          tenantId,
          idempotencyKey,
        },
        select: {
          id: true,
          payload: true,
        },
      });

      const operationalAlertId = await this.resolveOperationalAlertId(
        tx,
        tenantId,
        idempotencyKey,
        classId,
        existingOutbox?.payload,
      );

      if (!existingOutbox && !operationalAlertId) {
        return null;
      }

      return {
        outboxEventId: existingOutbox?.id ?? null,
        operationalAlertId,
      };
    });
  }

  private async resolveOperationalAlertId(
    tx: any,
    tenantId: string,
    idempotencyKey: string,
    classId: string,
    payload: unknown,
  ): Promise<string | null> {
    const fromPayload = this.extractOperationalAlertId(payload);
    if (fromPayload) {
      return fromPayload;
    }

    if (typeof tx.operationalAlert?.findFirst === 'function') {
      const existingAlert = await tx.operationalAlert.findFirst({
        where: {
          tenantId,
          sourceEntityId: classId,
          sourceEntityType: 'studio_class',
          metadata: {
            path: ['idempotencyKey'],
            equals: idempotencyKey,
          },
        },
        select: {
          id: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      return existingAlert?.id ?? null;
    }

    return null;
  }

  private validateAlertInput(
    alert: FloorAlert,
    expectedTenantId?: string,
  ): void {
    if (!alert || typeof alert !== 'object') {
      throw new Error('A FloorAlert payload is required.');
    }
    if (!alert.tenantId || !CANONICAL_UUID_REGEX.test(alert.tenantId)) {
      throw new Error(
        'A canonical tenant UUID is required for floor alert persistence.',
      );
    }
    if (expectedTenantId !== undefined && expectedTenantId !== alert.tenantId) {
      throw new Error(
        `Tenant mismatch: expected ${expectedTenantId} but received alert for ${alert.tenantId}.`,
      );
    }
    if (!alert.classId || !CANONICAL_UUID_REGEX.test(alert.classId)) {
      throw new Error(
        'A canonical studio class UUID is required for OperationalAlert persistence.',
      );
    }
    if (typeof alert.dedupKey !== 'string' || alert.dedupKey.trim().length === 0) {
      throw new Error(
        'A non-empty dedupKey is required for floor alert persistence.',
      );
    }
    if (
      !alert.type ||
      !Object.values(FLOOR_ALERT_TYPES).includes(alert.type)
    ) {
      throw new Error(
        `Unsupported floor alert type '${String((alert as { type?: unknown }).type ?? '')}'.`,
      );
    }
    if (typeof alert.className !== 'string' || alert.className.trim().length === 0) {
      throw new Error(
        'A non-empty className is required for floor alert persistence.',
      );
    }
    if (typeof alert.message !== 'string' || alert.message.trim().length === 0) {
      throw new Error(
        'A non-empty message is required for floor alert persistence.',
      );
    }
    this.parseValidStartTime(alert.startTime);
    if (
      typeof alert.capacity !== 'number' ||
      !Number.isFinite(alert.capacity) ||
      alert.capacity <= 0
    ) {
      throw new Error(
        'A finite positive capacity (> 0) is required for floor alert persistence.',
      );
    }
    if (
      typeof alert.booked !== 'number' ||
      !Number.isFinite(alert.booked) ||
      alert.booked < 0
    ) {
      throw new Error(
        'A finite non-negative booked count is required for floor alert persistence.',
      );
    }
    if (
      alert.waitlisted !== undefined &&
      (typeof alert.waitlisted !== 'number' ||
        !Number.isFinite(alert.waitlisted) ||
        alert.waitlisted < 0)
    ) {
      throw new Error(
        'Waitlisted count must be a finite non-negative number.',
      );
    }
    const occupancyPct = this.resolveOccupancyPct(alert);
    if (!Number.isFinite(occupancyPct)) {
      throw new Error(
        'A finite occupancyPct is required for floor alert persistence.',
      );
    }
  }

  private parseValidStartTime(startTime: unknown): Date {
    if (
      startTime === null ||
      startTime === undefined ||
      (typeof startTime !== 'string' && !(startTime instanceof Date)) ||
      (typeof startTime === 'string' && startTime.trim().length === 0)
    ) {
      throw new Error(
        'A valid startTime Date or ISO timestamp is required for floor alert persistence.',
      );
    }
    const parsed = startTime instanceof Date ? startTime : new Date(startTime);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(
        'Invalid startTime provided for floor alert persistence.',
      );
    }
    return parsed;
  }

  private resolveOccupancyPct(alert: FloorAlert): number {
    if (alert.occupancyPct !== undefined) {
      return typeof alert.occupancyPct === 'number'
        ? alert.occupancyPct
        : Number.NaN;
    }
    return Number(((alert.booked / alert.capacity) * 100).toFixed(1));
  }

  /** Aligns with `ai.operational_alerts.alert_type` documented categories ('capacity' | 'attendance'). */
  private mapOperationalAlertCategory(type: FloorAlertType): string {
    return type === FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H
      ? 'attendance'
      : 'capacity';
  }

  private resolveSeverity(type: FloorAlertType): FloorAlertSeverity {
    switch (type) {
      case FLOOR_ALERT_TYPES.FULL_100:
        return 'critical';
      case FLOOR_ALERT_TYPES.SURGE_90:
        return 'warning';
      case FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H:
        return 'info';
    }
  }

  private resolveTitle(type: FloorAlertType, className: string): string {
    switch (type) {
      case FLOOR_ALERT_TYPES.FULL_100:
        return `Class Full: ${className}`;
      case FLOOR_ALERT_TYPES.SURGE_90:
        return `Capacity Surge: ${className}`;
      case FLOOR_ALERT_TYPES.LOW_ATTENDANCE_4H:
        return `Low Attendance Warning: ${className}`;
    }
  }

  private extractOperationalAlertId(payload: unknown): string | null {
    let parsed: unknown = payload;
    if (typeof payload === 'string') {
      try {
        parsed = JSON.parse(payload);
      } catch {
        return null;
      }
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof (parsed as Record<string, unknown>).operationalAlertId === 'string' &&
      ((parsed as Record<string, unknown>).operationalAlertId as string).trim()
        .length > 0
    ) {
      return (
        (parsed as Record<string, unknown>).operationalAlertId as string
      ).trim();
    }
    return null;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const err = error as { code?: string; message?: string };
    if (err.code === 'P2002' || err.code === '23505') {
      return true;
    }
    const msg = (err.message || '').toLowerCase();
    return (
      msg.includes('ix_outbox_idempotency') ||
      msg.includes('unique constraint') ||
      msg.includes('duplicate key')
    );
  }
}
