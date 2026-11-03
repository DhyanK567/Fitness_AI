import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { RequestWithContext } from '../common/request-context.types';
import { PrismaService } from '../common/prisma.service';

const MAX_ATTEMPTS = 10;

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const tenantId = request.tenantId;
    const secret = this.config.get<string>('OTP_HASH_SECRET');
    if (!tenantId || !secret) throw new ServiceUnavailableException('Request throttling is unavailable');

    // HMAC avoids persisting raw IP addresses and keeps the key stable across API replicas.
    const keyHash = createHmac('sha256', secret).update(`${tenantId}:${ip}`).digest('hex');
    try {
      const count = await this.prisma.withTenant(tenantId, async (tx) => {
        // Bound stale-key growth without requiring a background service.
        if (Math.random() < 1 / 64) {
          await tx.$executeRaw`WITH expired AS (
            SELECT ctid FROM iam.login_rate_limit_buckets
            WHERE tenant_id = ${tenantId}::uuid
              AND window_started_at < now() - interval '10 minutes'
            LIMIT 100
          ) DELETE FROM iam.login_rate_limit_buckets
            WHERE ctid IN (SELECT ctid FROM expired)`;
        }
        const rows = await tx.$queryRaw<Array<{ hit_count: number }>>`INSERT INTO iam.login_rate_limit_buckets
          (tenant_id, key_hash, window_started_at, hit_count, updated_at)
          VALUES (${tenantId}::uuid, ${keyHash}, now(), 1, now())
          ON CONFLICT (tenant_id, key_hash) DO UPDATE SET
            window_started_at = CASE
              WHEN iam.login_rate_limit_buckets.window_started_at <= now() - interval '60 seconds' THEN now()
              ELSE iam.login_rate_limit_buckets.window_started_at
            END,
            hit_count = CASE
              WHEN iam.login_rate_limit_buckets.window_started_at <= now() - interval '60 seconds' THEN 1
              ELSE LEAST(iam.login_rate_limit_buckets.hit_count + 1, ${MAX_ATTEMPTS + 1})
            END,
            updated_at = now()
          RETURNING hit_count`;
        return rows[0]?.hit_count;
      });
      if (count === undefined) throw new Error('Rate limit update returned no counter');
      if (count > MAX_ATTEMPTS) throw new HttpException('Too many login attempts. Try again shortly.', HttpStatus.TOO_MANY_REQUESTS);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Request throttling is unavailable');
    }
    return true;
  }
}
