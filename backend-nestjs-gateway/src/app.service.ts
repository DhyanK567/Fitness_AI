import { Injectable } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';
import { RedisClient } from './common/redis-client';
import { ErpnextService } from './erpnext/erpnext.service';
import { LlmGatewayService } from './ai/gateway/llm-gateway.service';
import { ConfigService } from '@nestjs/config';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    erp: ComponentHealth;
    llm: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  error?: string;
}

export interface VersionInfo {
  version: string;
  buildDate: string;
  commit?: string;
  environment: string;
}

@Injectable()
export class AppService {
  private llmHealthCache: { status: ComponentHealth; expiresAt: number } | null = null;
  private readonly LLM_HEALTH_CACHE_TTL_MS = 60_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisClient,
    private readonly erpService: ErpnextService,
    private readonly llmGateway: LlmGatewayService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Liveness probe - always returns 200, no dependency calls.
   * Used by k8s to determine if the pod should be restarted.
   */
  async getLiveHealth(): Promise<HealthCheckResult> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: 'healthy' },
        redis: { status: 'healthy' },
        erp: { status: 'healthy' },
        llm: { status: 'healthy' },
      },
    };
  }

  /**
   * Readiness probe - returns 503 if DB or Redis unhealthy; ERP and LLM only mark degraded.
   * LLM check is cached for 60s to avoid calling Gemini per probe.
   * Used by k8s to determine if the pod should receive traffic.
   */
  async getReadyHealth(): Promise<HealthCheckResult> {
    const timestamp = new Date().toISOString();
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkErp(),
      this.checkLlmCached(),
    ]);

    const [dbResult, redisResult, erpResult, llmResult] = checks;

    const checksMap = {
      database: this.extractHealth(dbResult),
      redis: this.extractHealth(redisResult),
      erp: this.extractHealth(erpResult),
      llm: this.extractHealth(llmResult),
    };

    // Database and Redis are critical in production - unhealthy means overall unhealthy (503)
    // In local development, missing Redis degrades health gracefully to 200 without blocking review.
    // ERP and LLM are non-critical - unhealthy means overall degraded (200)
    const isDev = this.config.get<string>('NODE_ENV') === 'development';
    const redisCritical = !isDev || this.config.get<string>('REDIS_REQUIRED') === 'true';
    const criticalUnhealthy = checksMap.database.status === 'unhealthy' || (redisCritical && checksMap.redis.status === 'unhealthy');
    const nonCriticalUnhealthy = checksMap.erp.status === 'unhealthy' || checksMap.llm.status === 'unhealthy' || (!redisCritical && checksMap.redis.status === 'unhealthy');
    const degradedCount = Object.values(checksMap).filter(c => c.status === 'degraded').length;

    let overallStatus: HealthCheckResult['status'] = 'healthy';
    if (criticalUnhealthy) overallStatus = 'unhealthy';
    else if (nonCriticalUnhealthy) overallStatus = 'degraded';
    else if (degradedCount > 0) overallStatus = 'degraded';

    return {
      status: overallStatus,
      timestamp,
      checks: checksMap,
    };
  }

  /**
   * Alias of ready health for backward compatibility.
   */
  async getHealth(): Promise<HealthCheckResult> {
    return this.getReadyHealth();
  }

  private async checkDatabase(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      await this.redis.getClient().ping();
      return { status: 'healthy', latencyMs: Date.now() - start };
    } catch (error) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: (error as Error).message };
    }
  }

  private async checkErp(): Promise<ComponentHealth> {
    const start = Date.now();
    try {
      const result = await this.erpService.health({ tenantId: 'health-check', correlationId: 'health-check' });
      const success = (result as any)?.success;
      if (success) {
        return { status: 'healthy', latencyMs: Date.now() - start };
      }
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: 'ERP returned non-success' };
    } catch (error) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, error: (error as Error).message };
    }
  }

  private async checkLlmCached(): Promise<ComponentHealth> {
    const now = Date.now();
    if (this.llmHealthCache && this.llmHealthCache.expiresAt > now) {
      return this.llmHealthCache.status;
    }

    const start = Date.now();
    try {
      const result = await this.llmGateway.chat({
        messages: [{ role: 'user', content: 'health' }],
        tools: [],
        toolChoice: 'none',
        temperature: 0,
        maxTokens: 5,
        timeout: 5000,
        context: { tenantId: 'health-check', userId: 'health-check', role: 'admin', correlationId: 'health-check' },
      });
      let status: ComponentHealth;
      if (result?.content) {
        status = { status: 'healthy' as const, latencyMs: Date.now() - start };
      } else {
        status = { status: 'unhealthy' as const, latencyMs: Date.now() - start, error: 'LLM returned empty response' };
      }
      this.llmHealthCache = { status, expiresAt: now + this.LLM_HEALTH_CACHE_TTL_MS };
      return status;
    } catch (error) {
      const status: ComponentHealth = { status: 'unhealthy' as const, latencyMs: Date.now() - start, error: (error as Error).message };
      this.llmHealthCache = { status, expiresAt: now + this.LLM_HEALTH_CACHE_TTL_MS };
      return status;
    }
  }

  /**
   * Clear the LLM health check cache (for testing)
   */
  clearLlmHealthCache(): void {
    this.llmHealthCache = null;
  }

  private extractHealth(result: PromiseSettledResult<ComponentHealth>): ComponentHealth {
    if (result.status === 'fulfilled') return result.value;
    return { status: 'unhealthy', error: (result.reason as Error)?.message ?? 'Unknown error' };
  }

  async getVersion(): Promise<VersionInfo> {
    return {
      version: this.config.get<string>('APP_VERSION') ?? '0.1.0',
      buildDate: this.config.get<string>('BUILD_DATE') ?? new Date().toISOString(),
      commit: this.config.get<string>('GIT_COMMIT'),
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
    };
  }
}
