import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';

const IP_MAX_ATTEMPTS_PER_HOUR = 5;
const EMAIL_MAX_ATTEMPTS_PER_HOUR = 3;
const REGISTER_STUDIO_SCOPE = 'register_studio';

@Injectable()
export class PlatformRateLimitGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = this.getClientIp(request);
    const body = request.body as { owner_email?: string } | undefined;
    const email = body?.owner_email?.toLowerCase().trim();

    const secret = this.config.get<string>('OTP_HASH_SECRET');
    if (!secret) throw new ServiceUnavailableException('Request throttling is unavailable');

    const isDev = this.config.get<string>('NODE_ENV') === 'development';
    const ipMax = isDev ? 100 : IP_MAX_ATTEMPTS_PER_HOUR;
    const emailMax = isDev ? 50 : EMAIL_MAX_ATTEMPTS_PER_HOUR;

    try {
      await this.checkRateLimit(REGISTER_STUDIO_SCOPE, `ip:${ip}`, ipMax, 60 * 60 * 1000, secret);
      if (email) {
        await this.checkRateLimit(REGISTER_STUDIO_SCOPE, `email:${email}`, emailMax, 60 * 60 * 1000, secret);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Request throttling is unavailable');
    }
    return true;
  }

  private getClientIp(request: { headers: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): string {
    // Trust x-forwarded-for only if TRUST_PROXY_HOPS is configured (trusted proxy)
    const trustProxy = this.config.get<string>('TRUST_PROXY_HOPS');
    if (trustProxy) {
      const forwarded = request.headers['x-forwarded-for'];
      if (forwarded) {
        const ips = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',').map(s => s.trim());
        return ips[0] ?? request.ip ?? request.socket?.remoteAddress ?? 'unknown';
      }
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private async checkRateLimit(
    scope: string,
    key: string,
    maxAttempts: number,
    windowMs: number,
    secret: string
  ): Promise<void> {
    const keyHash = createHmac('sha256', secret).update(`${scope}:${key}`).digest('hex');
    const windowSeconds = Math.ceil(windowMs / 1000);

    await this.prisma.$transaction(async (tx) => {
      // Opportunistic cleanup: remove buckets older than 1 day for this scope (1/64 chance)
      if (Math.random() < 1 / 64) {
        await tx.$executeRaw`SELECT platform.cleanup_rate_limit_buckets(${scope}, 1)`;
      }

      const windowSec = windowSeconds;
      const maxAtt = maxAttempts;

      // Use parameterized query with make_interval for the window
      const rows = await tx.$queryRaw<Array<{ hit_count: number }>>`
        INSERT INTO platform.rate_limit_buckets
          (scope, key_hash, window_started_at, hit_count, updated_at)
        VALUES (${scope}, ${keyHash}, now(), 1, now())
        ON CONFLICT (scope, key_hash) DO UPDATE SET
          window_started_at = CASE
            WHEN platform.rate_limit_buckets.window_started_at <= now() - make_interval(secs => ${windowSec}::int) THEN now()
            ELSE platform.rate_limit_buckets.window_started_at
          END,
          hit_count = CASE
            WHEN platform.rate_limit_buckets.window_started_at <= now() - make_interval(secs => ${windowSec}::int) THEN 1
            ELSE LEAST(platform.rate_limit_buckets.hit_count + 1, ${maxAtt} + 1)
          END,
          updated_at = now()
        RETURNING hit_count`;

      const count = rows[0]?.hit_count;
      if (count === undefined) throw new Error('Rate limit update returned no counter');
      if (count > maxAttempts) {
        throw new HttpException(
          { errorCode: 'RATE_LIMITED', message: `Too many requests. Limit: ${maxAttempts} per hour.` },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    });
  }
}