import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RequestWithContext } from '../request-context.types';
import { RedisClient } from '../redis-client';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const DEFAULT_CONFIGS: Record<string, RateLimitConfig> = {
  'ai:chat': { windowMs: 60_000, maxRequests: 30, keyPrefix: 'ratelimit:ai' },
  'auth.login': { windowMs: 60_000, maxRequests: 10, keyPrefix: 'ratelimit:auth' },
  'auth.register': { windowMs: 3600_000, maxRequests: 5, keyPrefix: 'ratelimit:auth' },
  'bulk.import': { windowMs: 60_000, maxRequests: 60, keyPrefix: 'ratelimit:bulk-import' },
  'default': { windowMs: 60_000, maxRequests: 100, keyPrefix: 'ratelimit:api' },
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: RedisClient,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const routeKey = this.getRouteKey(request);
    if (routeKey === 'skip') return true;
    const config = DEFAULT_CONFIGS[routeKey] ?? DEFAULT_CONFIGS.default;

    const tenantId = request.tenantId ?? 'unknown';
    const userId = request.auth?.userId ?? request.ip ?? 'anonymous';
    const key = `${config.keyPrefix}:${tenantId}:${userId}`;

    return this.checkLimit(key, config);
  }

  private getRouteKey(request: RequestWithContext): string {
    const path = request.route?.path ?? '';
    // Skip platform-level studio registration - it has its own dedicated rate limiter (PlatformRateLimitGuard)
    // Path includes global API prefix '/api/v1'
    if (path === '/api/v1/auth/register/studio') return 'skip';
    if (path.includes('/ai/chat')) return 'ai:chat';
    if (path.includes('/auth/login')) return 'auth.login';
    if (path.includes('/auth/register')) return 'auth.register';
    if (path.includes('/import-export/import/')) return 'bulk.import';
    return 'default';
  }

  private async checkLimit(key: string, config: RateLimitConfig): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      const pipeline = this.redis.multi();
      pipeline.zremrangebyscore(key, 0, windowStart);
      pipeline.zcard(key);
      pipeline.zadd(key, now, `${now}:${Math.random()}`);
      pipeline.expire(key, Math.ceil(config.windowMs / 1000) + 1);

      const results = await pipeline.exec();
      const currentCount = results?.[1]?.[1] as number ?? 0;

      if (currentCount >= config.maxRequests) {
        const ttl = await this.redis.ttl(key);
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.', retryAfter: ttl },
          429,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (this.config.get<string>('NODE_ENV') === 'development') return true;
      throw new ServiceUnavailableException('Request throttling is unavailable');
    }

    return true;
  }
}
