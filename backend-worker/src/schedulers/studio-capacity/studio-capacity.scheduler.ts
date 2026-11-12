import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisClient } from '../../common/redis-client';
import { FloorAlert } from '../../contracts/floor-alert.types';
import { FloorAlertDeliveryService } from '../../services/floor-alert-delivery.service';
import { FloorAlertService } from '../../services/floor-alert.service';

const DEFAULT_TIMEZONE = 'Asia/Kolkata';
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const DEFAULT_LOCK_TTL_MS = 4 * 60 * 1000; // 4 minutes (< 5-minute default cron interval)
const LOCK_KEY = 'lock:scheduler:studio-capacity-monitor';
const CANONICAL_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RELEASE_LOCK_LUA = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

export interface StudioCapacityMonitorSummary {
  lockAcquired: boolean;
  tenantsProcessed: number;
  classesEvaluated: number;
  alertsTriggered: number;
  failures: number;
}

interface CandidateStudioClass {
  id: string;
  date: Date;
  startTime: string;
  status: string | null;
}

@Injectable()
export class StudioCapacityScheduler {
  private readonly logger = new Logger(StudioCapacityScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisClient,
    private readonly floorAlertService: FloorAlertService,
    @Optional()
    private readonly floorAlertDeliveryService?: FloorAlertDeliveryService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  /**
   * Periodic cron trigger (default: every 5 minutes, configurable via `STUDIO_CAPACITY_CRON`).
   */
  @Cron(process.env.STUDIO_CAPACITY_CRON || CronExpression.EVERY_5_MINUTES, {
    name: 'studio-capacity-monitor',
  })
  async handleCron(): Promise<void> {
    await this.monitorUpcomingClasses();
  }

  /**
   * Execute one distributed-lock-protected 4-hour capacity monitoring cycle across active tenants.
   */
  async monitorUpcomingClasses(
    now: Date = new Date(),
  ): Promise<StudioCapacityMonitorSummary> {
    const lockToken = randomUUID();
    const lockTtlMs = this.resolveLockTtlMs();

    const acquired = await this.redis
      .getClient()
      .set(LOCK_KEY, lockToken, 'PX', lockTtlMs, 'NX')
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to acquire Redis lock (${LOCK_KEY}): ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });

    if (acquired !== 'OK') {
      this.logger.debug(
        'Studio capacity monitor lock not acquired — another worker is handling it.',
      );
      return {
        lockAcquired: false,
        tenantsProcessed: 0,
        classesEvaluated: 0,
        alertsTriggered: 0,
        failures: 0,
      };
    }

    let tenantsProcessed = 0;
    let classesEvaluated = 0;
    let alertsTriggered = 0;
    let failures = 0;

    try {
      const tenantIds = await this.getActiveTenants();

      for (const tenantId of tenantIds) {
        if (!CANONICAL_UUID_REGEX.test(tenantId)) {
          failures += 1;
          this.logger.warn(
            `Skipped non-canonical tenant ID in studio capacity monitor: '${String(tenantId)}'`,
          );
          continue;
        }
        let upcomingClassIds: string[] = [];

        try {
          upcomingClassIds = await this.findUpcomingClassIdsForTenant(
            tenantId,
            now,
          );
          tenantsProcessed += 1;
        } catch (err: unknown) {
          failures += 1;
          this.logger.error(
            `Failed querying upcoming classes for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        for (const classId of upcomingClassIds) {
          try {
            const evaluation = await this.floorAlertService.evaluateClass(
              tenantId,
              classId,
              {
                now,
                requireFourHourWindow: true,
              },
            );

            if (evaluation.evaluated) {
              classesEvaluated += 1;
              alertsTriggered += evaluation.triggeredAlerts.length;

              if (
                this.floorAlertDeliveryService &&
                evaluation.triggeredAlerts.length > 0
              ) {
                for (const alert of evaluation.triggeredAlerts) {
                  const alertToDeliver: FloorAlert = {
                    ...alert,
                    tenantId,
                    classId,
                  };
                  await this.floorAlertDeliveryService.deliverAlert(
                    alertToDeliver,
                    {
                      expectedTenantId: tenantId,
                    },
                  );
                }
              }
            }
          } catch (err: unknown) {
            failures += 1;
            this.logger.error(
              `Floor alert processing failed for tenant ${tenantId}, class ${classId}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }
      }

      this.logger.log(
        `Studio capacity monitor cycle complete: tenantsProcessed=${tenantsProcessed}, classesEvaluated=${classesEvaluated}, alertsTriggered=${alertsTriggered}, failures=${failures}`,
      );

      return {
        lockAcquired: true,
        tenantsProcessed,
        classesEvaluated,
        alertsTriggered,
        failures,
      };
    } finally {
      await this.redis
        .getClient()
        .eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, lockToken)
        .catch((err: unknown) => {
          this.logger.error(
            `Failed releasing Redis lock (${LOCK_KEY}): ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
  }

  private async getActiveTenants(): Promise<string[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true },
    });
    return tenants.map((t: { id: string }) => t.id);
  }

  /**
   * Fetch non-cancelled classes for one tenant within [now, now + 4h] in Asia/Kolkata.
   * Uses a wide UTC/IST date bracket on `StudioClass.date` and filters exact `date + startTime`
   * timestamps in studio local time so midnight UTC and midnight IST storage are both matched.
   */
  private async findUpcomingClassIdsForTenant(
    tenantId: string,
    now: Date,
  ): Promise<string[]> {
    const windowEnd = new Date(now.getTime() + FOUR_HOURS_MS);
    const startDateIst = this.formatDateInTimezone(now, DEFAULT_TIMEZONE);
    const endDateIst = this.formatDateInTimezone(windowEnd, DEFAULT_TIMEZONE);

    // Covers both IST-midnight (T18:30:00Z prev day) and UTC-midnight (T00:00:00Z) storage
    const rangeStart = new Date(`${startDateIst}T00:00:00+05:30`);
    const rangeEnd = new Date(`${endDateIst}T23:59:59.999Z`);

    const candidateClasses = await this.prisma.withTenant(tenantId, async (tx) => {
      return tx.studioClass.findMany({
        where: {
          tenantId,
          status: { notIn: ['Cancelled', 'cancelled', 'CANCELLED'] },
          date: { gte: rangeStart, lte: rangeEnd },
        },
        select: {
          id: true,
          date: true,
          startTime: true,
          status: true,
        },
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      });
    });

    const nowMs = now.getTime();
    const windowEndMs = windowEnd.getTime();
    const upcomingClassIds: string[] = [];

    for (const cls of candidateClasses as CandidateStudioClass[]) {
      if ((cls.status || '').trim().toLowerCase() === 'cancelled') {
        continue;
      }

      const startDateTime = this.resolveClassStartDateTime(
        cls.date,
        cls.startTime,
      );
      if (!startDateTime) {
        continue;
      }

      const startMs = startDateTime.getTime();
      if (startMs >= nowMs && startMs <= windowEndMs) {
        upcomingClassIds.push(cls.id);
      }
    }

    return upcomingClassIds;
  }

  private resolveClassStartDateTime(
    classDate: Date,
    startTime: string,
  ): Date | null {
    const validDate =
      classDate instanceof Date ? classDate : new Date(classDate);
    if (Number.isNaN(validDate.getTime())) {
      return null;
    }

    const match =
      typeof startTime === 'string'
        ? startTime.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
        : null;
    if (!match) {
      return null;
    }

    const hoursNum = Number.parseInt(match[1], 10);
    const minutesNum = Number.parseInt(match[2], 10);
    const secondsNum = match[3] ? Number.parseInt(match[3], 10) : 0;

    if (
      hoursNum < 0 ||
      hoursNum > 23 ||
      minutesNum < 0 ||
      minutesNum > 59 ||
      secondsNum < 0 ||
      secondsNum > 59
    ) {
      return null;
    }

    const datePart = this.formatDateInTimezone(validDate, DEFAULT_TIMEZONE);
    const hours = String(hoursNum).padStart(2, '0');
    const minutes = String(minutesNum).padStart(2, '0');
    const seconds = String(secondsNum).padStart(2, '0');
    const parsed = new Date(`${datePart}T${hours}:${minutes}:${seconds}+05:30`);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDateInTimezone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private resolveLockTtlMs(): number {
    const configured = this.config?.get<string | number>(
      'STUDIO_CAPACITY_LOCK_TTL_MS',
    );
    const parsed = Number(configured);
    return Number.isFinite(parsed) && parsed >= 30000
      ? parsed
      : DEFAULT_LOCK_TTL_MS;
  }
}
