import { Global, Module, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export class RedisClient {
  private client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST') ?? 'localhost',
      port: parseInt(config.get('REDIS_PORT') ?? '6379', 10),
      password: config.get('REDIS_PASSWORD') ?? undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number): number | null => Math.min(times * 50, 2000),
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
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

  async set(key: string, value: string, mode?: string, ttlMs?: number): Promise<'OK' | null> {
    if (mode && ttlMs) {
      // ioredis: set(key, value, 'PX', ttlMs) or set(key, value, 'EX', seconds)
      // Cast to any to satisfy ioredis overloads
      return this.client.set(key, value, mode as any, ttlMs);
    }
    return this.client.set(key, value);
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
@Module({})
export class RedisModule {
  static forRoot(): DynamicModule {
    return {
      module: RedisModule,
      providers: [
        {
          provide: RedisClient,
          useFactory: (config: ConfigService) => new RedisClient(config),
          inject: [ConfigService],
        },
      ],
      exports: [RedisClient],
    };
  }
}