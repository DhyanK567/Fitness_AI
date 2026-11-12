import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { RedisClient } from '../../common/redis-client';
import { TrainerRosterService } from '../../trainer-roster/trainer-roster.service';
import { getCurrentIstDateString } from '../../common/date-utils';

export const ROSTER_CRON_EXPRESSION = '30 6 * * *';
export const ROSTER_TIMEZONE = 'Asia/Kolkata';
export const ROSTER_CRON_NAME = 'trainer-morning-roster';
export const ROSTER_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface RosterSchedulerResult {
  date: string;
  processedTenants: number;
  failedTenants: number;
  totalRosters: number;
  durationMs: number;
  skipped: boolean;
  skipReason?: string;
}

@Injectable()
export class TrainerRosterScheduler {
  private readonly logger = new Logger(TrainerRosterScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisClient,
    private readonly trainerRosterService: TrainerRosterService,
  ) {}

  /**
   * Daily cron trigger scheduled at 06:30 AM Indian Standard Time (Asia/Kolkata).
   *
   * Executes atomic distributed lock, queries active tenants, builds rosters per tenant,
   * isolates tenant errors, and releases the lock safely.
   *
   * @param overrideDate - Optional explicit YYYY-MM-DD IST date string for deterministic testing (BUG-A-005)
   */
  @Cron('30 6 * * *', {
    name: 'trainer-morning-roster',
    timeZone: 'Asia/Kolkata',
  })
  async handleMorningRoster(overrideDate?: string): Promise<RosterSchedulerResult> {
    const startTime = Date.now();
    const dateString = overrideDate ?? getCurrentIstDateString();
    const lockKey = `lock:trainer-roster:scheduler:${dateString}`;

    this.logger.log(
      `[CRON TRIGGER] Starting daily trainer morning roster scheduler for IST date: ${dateString}`,
    );

    let token: string | null = null;
    try {
      token = await this.acquireLock(lockKey, ROSTER_LOCK_TTL_MS);
    } catch (lockErr) {
      this.logger.error(
        `Redis failure while attempting lock acquisition on ${lockKey}: ${(lockErr as Error)?.message}`,
        (lockErr as Error)?.stack,
      );
      return {
        date: dateString,
        processedTenants: 0,
        failedTenants: 0,
        totalRosters: 0,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: 'REDIS_LOCK_ERROR',
      };
    }

    if (!token) {
      this.logger.log(
        `Skipping morning roster execution for date ${dateString}; distributed lock already held by another worker instance.`,
      );
      return {
        date: dateString,
        processedTenants: 0,
        failedTenants: 0,
        totalRosters: 0,
        durationMs: Date.now() - startTime,
        skipped: true,
        skipReason: 'LOCK_HELD_BY_ANOTHER_WORKER',
      };
    }

    let processedTenants = 0;
    let failedTenants = 0;
    let totalRosters = 0;

    try {
      const activeTenants = await this.getActiveTenants();
      this.logger.log(`Discovered ${activeTenants.length} active tenants for daily roster processing`);

      for (const tenantId of activeTenants) {
        try {
          const rosters = await this.trainerRosterService.buildRosters(tenantId, dateString);
          totalRosters += rosters.length;
          processedTenants++;
          this.logger.log(
            `Successfully generated ${rosters.length} rosters for tenant ${tenantId} on ${dateString}`,
          );
        } catch (tenantErr) {
          failedTenants++;
          this.logger.error(
            `Failed to generate trainer rosters for tenant ${tenantId} on ${dateString}: ${(tenantErr as Error)?.message}`,
            (tenantErr as Error)?.stack,
          );
        }
      }

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `[CRON COMPLETE] Trainer morning roster finished for ${dateString} in ${durationMs}ms. Processed: ${processedTenants}, Failed: ${failedTenants}, Total Rosters: ${totalRosters}`,
      );

      return {
        date: dateString,
        processedTenants,
        failedTenants,
        totalRosters,
        durationMs,
        skipped: false,
      };
    } finally {
      if (token) {
        try {
          await this.releaseLock(lockKey, token);
        } catch (releaseErr) {
          this.logger.error(
            `Failed to safely release distributed lock ${lockKey}: ${(releaseErr as Error)?.message}`,
          );
        }
      }
    }
  }

  /**
   * Discovers all active tenant IDs dynamically from the database.
   * Never hardcodes tenant IDs.
   */
  async getActiveTenants(): Promise<string[]> {
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      return tenants.map((t) => t.id);
    } catch {
      const raw = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM platform.tenants WHERE status = 'active'
      `;
      return raw.map((r) => r.id);
    }
  }

  /**
   * Acquires an atomic distributed lock via Redis using NX and PX.
   */
  private async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const candidateToken = randomUUID();
    const result = await this.redis.getClient().set(key, candidateToken, 'PX', ttlMs, 'NX');
    return result === 'OK' ? candidateToken : null;
  }

  /**
   * Releases the distributed lock atomically if and only if the stored token matches our token.
   */
  private async releaseLock(key: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.redis.getClient().eval(script, 1, key, token);
    return result === 1;
  }
}
