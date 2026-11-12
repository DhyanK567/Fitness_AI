import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisClient,
  ) {}

  /**
   * Pending action expiry - runs every 5 minutes
   * Expires pending actions that have passed their TTL
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingActions(): Promise<void> {
    const lock = await this.acquireLock('scheduler:expire-pending-actions', 300000); // 5 min TTL
    if (!lock) {
      this.logger.debug('Could not acquire lock for expirePendingActions, skipping');
      return;
    }

    try {
      const tenants = await this.getActiveTenants();
      let totalExpired = 0;

      for (const tenantId of tenants) {
        try {
          const expired = await this.prisma.withTenant(tenantId, async (tx) => {
            const result = await tx.$executeRaw`
              UPDATE ai.pending_actions
              SET status = 'expired', updated_at = NOW()
              WHERE status IN ('proposed', 'executing')
                AND expires_at < NOW()
                AND tenant_id = ${tenantId}
            `;
            return result;
          });
          totalExpired += expired;
        } catch (tenantErr) {
          this.logger.error(
            `Failed processing pending action expiry for tenant ${tenantId}: ${(tenantErr as Error)?.message}`,
          );
        }
      }

      if (totalExpired > 0) {
        this.logger.log(`Expired ${totalExpired} pending actions across tenants`);
      }
    } finally {
      await this.releaseLock('scheduler:expire-pending-actions', lock);
    }
  }

  /**
   * Membership expiry - runs daily at 2 AM
   * Processes expiring memberships and creates outbox events
   */
  @Cron('0 2 * * *')
  async processMembershipExpiry(): Promise<void> {
    const lock = await this.acquireLock('scheduler:membership-expiry', 3600000); // 1 hour TTL
    if (!lock) return;

    try {
      const tenants = await this.getActiveTenants();

      for (const tenantId of tenants) {
        await this.prisma.withTenant(tenantId, async (tx) => {
          // Expire memberships that have passed their end date
          const expired = await tx.$executeRaw`
            UPDATE ai.ws_membership
            SET status = 'expired', updated_at = NOW()
            WHERE status = 'active'
              AND end_date < NOW()
              AND tenant_id = ${tenantId}
          `;

          // Create outbox events for newly expired memberships
          const expiredMembers = await tx.$queryRaw<{ member_id: string; membership_id: string }[]>`
            SELECT member_id, id as membership_id
            FROM ai.ws_membership
            WHERE status = 'expired'
              AND updated_at > NOW() - INTERVAL '1 day'
              AND tenant_id = ${tenantId}
          `;

          for (const m of expiredMembers) {
            const idempotencyKey = `membership.expired:${m.membership_id}:(NOW() AT TIME ZONE 'UTC')::date`;
            await tx.$executeRaw`
              INSERT INTO ops.outbox_events (
                id, tenant_id, event_type, subject_type, subject_ref,
                payload, correlation_id, status, attempts, created_at, updated_at, idempotency_key
              ) VALUES (
                gen_random_uuid(), ${tenantId}, 'membership.expired',
                'membership', ${m.membership_id},
                ${JSON.stringify({ member_id: m.member_id, membership_id: m.membership_id })}::jsonb,
                gen_random_uuid(), 'pending', 0, NOW(), NOW(), ${idempotencyKey}
              )
              ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
            `;
          }

          if (expiredMembers.length > 0) {
            this.logger.log(`Created ${expiredMembers.length} membership.expired events for tenant ${tenantId}`);
          }
        });
      }
    } catch (error) {
      this.logger.error('Membership expiry processing failed', error);
    }
  }

  /**
   * Renewal reminders - runs daily at 10 AM
   * Sends reminders at 7, 3, and 1 days before expiry
   */
  @Cron('0 10 * * *')
  async sendRenewalReminders(): Promise<void> {
    const lock = await this.acquireLock('scheduler:renewal-reminders', 3600000);
    if (!lock) return;

    try {
      const tenants = await this.getActiveTenants();

      for (const tenantId of tenants) {
        await this.prisma.withTenant(tenantId, async (tx) => {
          const now = new Date();
          const reminders = [
            { days: 7, label: '7 days' },
            { days: 3, label: '3 days' },
            { days: 1, label: '1 day' },
          ];

          for (const { days, label } of reminders) {
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + days);

            const expiring = await tx.$queryRaw<{ member_id: string; membership_id: string; plan_name: string; end_date: Date }[]>`
              SELECT m.id as member_id, ms.id as membership_id, mp.name as plan_name, ms.end_date
              FROM ai.ws_membership ms
              JOIN ai.ws_member m ON m.id = ms.member_id
              JOIN ai.ws_member_plan mp ON mp.id = ms.plan_id
              WHERE ms.status = 'active'
                AND ms.end_date = ${targetDate.toISOString().split('T')[0]}::date
                AND ms.tenant_id = ${tenantId}
            `;

            for (const exp of expiring) {
              // Insert outbox event for renewal reminder
              const idempotencyKey = `membership.renewal_reminder:${exp.membership_id}:${label}:${targetDate.toISOString().split('T')[0]}`;
              await tx.$executeRaw`
                INSERT INTO ops.outbox_events (
                  id, tenant_id, event_type, subject_type, subject_ref,
                  payload, correlation_id, status, attempts, created_at, updated_at, idempotency_key
                ) VALUES (
                  gen_random_uuid(), ${tenantId}, 'membership.renewal_reminder',
                  'membership', ${exp.membership_id},
                  ${JSON.stringify({
                    member_id: exp.member_id,
                    membership_id: exp.membership_id,
                    plan_name: exp.plan_name,
                    days_until_expiry: days,
                    reminder_type: label,
                  })}::jsonb,
                  gen_random_uuid(), 'pending', 0, NOW(), NOW(), ${idempotencyKey}
                )
                ON CONFLICT (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
              `;
            }

            if (expiring.length > 0) {
              this.logger.log(`Created ${expiring.length} renewal reminders (${label}) for tenant ${tenantId}`);
            }
          }
        });
      }
    } catch (error) {
      this.logger.error('Renewal reminder processing failed', error);
    }
  }

  /**
   * Retention job - creates churn risk assessments and engagement scores
   * Runs weekly on Sunday at 3 AM
   */
  @Cron('0 3 * * 0')
  async runRetentionJobs(): Promise<void> {
    const lock = await this.acquireLock('scheduler:retention-jobs', 7200000); // 2 hour TTL
    if (!lock) return;

    try {
      const tenants = await this.getActiveTenants();

      for (const tenantId of tenants) {
        await this.prisma.withTenant(tenantId, async (tx) => {
          // TODO: Implement churn risk calculation and engagement scoring
          // For now, just log that the job ran
          this.logger.log(`Retention job executed for tenant ${tenantId}`);
        });
      }
    } catch (error) {
      this.logger.error('Retention job processing failed', error);
    }
  }

  /**
   * Feedback classification job - processes unclassified feedback
   * Runs every 15 minutes
   */
  @Cron('*/15 * * * *')
  async processFeedbackClassification(): Promise<void> {
    const lock = await this.acquireLock('scheduler:feedback-classification', 900000); // 15 min TTL
    if (!lock) return;

    try {
      const tenants = await this.getActiveTenants();

      for (const tenantId of tenants) {
        await this.prisma.withTenant(tenantId, async (tx) => {
          // Find unclassified feedback
          const unclassified = await tx.$queryRaw<{ feedback_id: string; content: string }[]>`
            SELECT f.id as feedback_id, f.content
            FROM ai.ws_feedback f
            WHERE f.tenant_id = ${tenantId}
              AND f.type = 'text'
              AND NOT EXISTS (
                SELECT 1 FROM ai.feedback_classification fc
                WHERE fc.feedback_id = f.id
              )
            LIMIT 50
          `;

          for (const fb of unclassified) {
            // Classification will be done by the FeedbackClassificationJob
            // Here we just queue the work by creating a classification record
            await tx.$executeRaw`
              INSERT INTO ai.feedback_classification (
                id, tenant_id, feedback_id, sentiment, topics, theme, low_confidence, created_at
              ) VALUES (
                gen_random_uuid(), ${tenantId}, ${fb.feedback_id},
                'neutral', '[]'::jsonb, 'pending_classification', false, NOW()
              )
              ON CONFLICT (feedback_id) DO NOTHING
            `;
          }
        });
      }
    } catch (error) {
      this.logger.error('Feedback classification scheduling failed', error);
    }
  }

  // ==================== Helpers ====================

  private async acquireLock(lockName: string, ttlMs: number): Promise<string | null> {
    const key = `lock:${lockName}`;
    const token = randomUUID();
    // Use the underlying client directly for NX/PX options
    const result = await this.redis.getClient().set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  private async releaseLock(lockName: string, token: string): Promise<void> {
    const key = `lock:${lockName}`;
    // Atomic check-and-delete: only release if we own the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.getClient().eval(script, 1, key, token);
  }

  private getStaleThresholdMs(): number {
    const raw = this.config.get('STALE_ACTION_THRESHOLD_MS');
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (isNaN(parsed) || parsed < 60000) {
      this.logger.warn(`Invalid STALE_ACTION_THRESHOLD_MS="${raw}", using default 600000ms (10 min)`);
      return 600000; // 10 min default
    }
    return parsed;
  }

  /**
   * Recovers stale executing pending actions using the same logic as
   * PendingActionService.recoverStaleExecutingActions but executed locally
   * to avoid cross-package dependency.
   */
  private async recoverStaleExecutingActionsInternal(staleTimeoutMs: number): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleTimeoutMs);
    let totalRecovered = 0;

    const tenants = await this.getActiveTenants();

    for (const tenantId of tenants) {
      try {
        const recovered = await this.prisma.withTenant(tenantId, async (tx) => {
          const staleActions = await tx.pendingAction.findMany({
            where: {
              tenantId,
              status: 'executing',
              updatedAt: { lt: staleThreshold },
            },
          });

          if (staleActions.length === 0) {
            return 0;
          }

          let recoveredCount = 0;

          for (const action of staleActions) {
            // No reconciler available in worker - mark as OUTCOME_UNCERTAIN
            const update = await tx.pendingAction.updateMany({
              where: {
                id: action.id,
                tenantId,
                status: 'executing',
              },
              data: {
                status: 'failed',
                error: 'OUTCOME_UNCERTAIN: Action was executing when worker timed out or disconnected. Status must be reconciled before re-executing.',
                result: {
                  outcome: 'uncertain',
                  unresolved: true,
                  staleTimeout: true,
                  reason: 'EXTERNAL_OUTCOME_UNKNOWN',
                  reconciledAt: new Date().toISOString(),
                },
              },
            });
            recoveredCount += update.count;
          }

          return recoveredCount;
        });

        totalRecovered += recovered;
      } catch (tenantErr) {
        this.logger.error(
          `Failed stale action recovery for tenant ${tenantId}: ${(tenantErr as Error)?.message}`,
        );
      }
    }

    return totalRecovered;
  }

  /**
   * Scheduled job to recover stale executing pending actions.
   * Runs every 10 minutes with a 10-minute TTL lock.
   */
  @Cron('*/10 * * * *')
  async recoverStaleActions(): Promise<void> {
    const staleThresholdMs = this.getStaleThresholdMs();
    const lockTtlMs = Math.max(staleThresholdMs, 600000); // at least 10 min TTL

    const token = await this.acquireLock('scheduler:recover-stale-actions', lockTtlMs);
    if (!token) {
      this.logger.debug('Could not acquire lock for recoverStaleActions, skipping');
      return;
    }

    try {
      const recovered = await this.recoverStaleExecutingActionsInternal(staleThresholdMs);
      if (recovered > 0) {
        this.logger.log(`Recovered ${recovered} stale executing pending actions across tenants`);
      }
    } catch (error) {
      this.logger.error('Stale action recovery failed', error);
    } finally {
      await this.releaseLock('scheduler:recover-stale-actions', token);
    }
  }

  private async getActiveTenants(): Promise<string[]> {
    const result = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM platform.tenants WHERE status = 'active'
    `;
    return result.map((r) => r.id);
  }
}