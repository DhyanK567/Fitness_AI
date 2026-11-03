import { Injectable, Module, Global, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisClient.name);
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD ?? undefined,
      maxRetriesPerRequest: process.env.NODE_ENV === 'test' ? 0 : 3,
      retryStrategy: (times) => {
        if (process.env.NODE_ENV === 'test' || times > 3) {
          return null;
        }
        return Math.min(times * 50, 2000);
      },
      enableReadyCheck: process.env.NODE_ENV !== 'test',
      lazyConnect: true,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis client error: ${err.message}`);
    });
  }

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test' && !process.env.REDIS_HOST) {
      return;
    }
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(`Failed to connect to Redis on startup: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client.status === 'ready' || this.client.status === 'connect') {
        await this.client.quit();
      } else {
        this.client.disconnect();
      }
    } catch {
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.client.zadd(key, score, member);
  }

  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.client.zremrangebyscore(key, min, max);
  }

  async zcard(key: string): Promise<number> {
    return this.client.zcard(key);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  multi(): ReturnType<Redis['multi']> {
    return this.client.multi();
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async set(key: string, value: string, mode?: 'EX' | 'PX' | 'EXAT' | 'PXAT' | 'KEEPTTL', ttlMs?: number): Promise<'OK' | null> {
    const client = this.client as any;
    if (mode && ttlMs) {
      return client.set(key, value, mode, ttlMs);
    }
    if (ttlMs) {
      return client.set(key, value, 'PX', ttlMs);
    }
    return client.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async eval(script: string, numKeys: number, ...keys: string[]): Promise<unknown> {
    return this.client.eval(script, numKeys, ...keys);
  }
}

@Global()
@Module({
  providers: [
    RedisClient,
    {
      provide: 'REDIS_CLIENT',
      useExisting: RedisClient,
    },
  ],
  exports: [RedisClient, 'REDIS_CLIENT'],
})
export class RedisModule {}