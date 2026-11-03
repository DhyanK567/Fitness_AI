import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Controller, Get, HttpCode, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService, HealthCheckResult, VersionInfo } from '../app.service';
import { PrismaService } from '../common/prisma.service';
import { RedisClient } from '../common/redis-client';
import { ErpnextService } from '../erpnext/erpnext.service';
import { LlmGatewayService } from '../ai/gateway/llm-gateway.service';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

@Controller()
class TestHealthController {
  constructor(private readonly appService: AppService) {}

  @Get('health/live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe (public)' })
  @ApiResponse({ status: 200, description: 'Liveness check result' })
  async getLiveHealth(): Promise<HealthCheckResult> {
    return this.appService.getLiveHealth();
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness probe (public)' })
  @ApiResponse({ status: 200, description: 'Ready - service can accept traffic' })
  @ApiResponse({ status: 503, description: 'Not ready - critical dependencies unavailable' })
  async getReadyHealth(): Promise<HealthCheckResult> {
    const result = await this.appService.getReadyHealth();
    if (result.status === 'unhealthy') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint (public, alias of /health/ready)' })
  @ApiResponse({ status: 200, description: 'Health check result' })
  @ApiResponse({ status: 503, description: 'Service unhealthy' })
  async getHealth(): Promise<HealthCheckResult> {
    const result = await this.appService.getHealth();
    if (result.status === 'unhealthy') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }

  @Get('version')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Version info endpoint (public)' })
  @ApiResponse({ status: 200, description: 'Version information' })
  async getVersion(): Promise<VersionInfo> {
    return this.appService.getVersion();
  }
}

describe('Health & Version Endpoints', () => {
  let app: INestApplication;
  let mockPrisma: any;
  let mockRedis: any;
  let mockErpService: any;
  let mockLlmGateway: any;
  let mockConfigService: any;

  beforeAll(async () => {
    mockPrisma = {
      $queryRaw: (jest.fn() as any).mockResolvedValue([{ '?column?': 1 }]),
    };

    mockRedis = {
      getClient: (jest.fn() as any).mockReturnValue({
        ping: (jest.fn() as any).mockResolvedValue('PONG'),
      }),
    };

    mockErpService = {
      health: (jest.fn() as any).mockResolvedValue({ success: true, data: { status: 'ok' } }),
    };

    mockLlmGateway = {
      chat: (jest.fn() as any).mockResolvedValue({ content: 'OK', toolCalls: [], pendingAction: undefined }),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          'database.url': 'postgresql://test:test@localhost:5432/test',
          'redis.url': 'redis://localhost:6379',
          'jwt.secret': 'test-secret',
          'jwt.expiresIn': '1h',
          'llm.provider': 'gemini',
          'llm.apiKey': 'test-key',
          'llm.model': 'gemini-1.5-flash',
          'APP_VERSION': '0.1.0-test',
          'BUILD_DATE': '2026-10-11T00:00:00.000Z',
          'GIT_COMMIT': 'abc123',
          'NODE_ENV': 'test',
        };
        return config[key];
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TestHealthController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisClient, useValue: mockRedis },
        { provide: ErpnextService, useValue: mockErpService },
        { provide: LlmGatewayService, useValue: mockLlmGateway },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    const appInstance = moduleFixture.createNestApplication();
    appInstance.setGlobalPrefix('api/v1');
    await appInstance.init();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const appService = app.get(AppService);
    if (appService) {
      appService.clearLlmHealthCache();
    }
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    mockRedis.getClient().ping.mockResolvedValue('PONG');
    mockErpService.health.mockResolvedValue({ success: true, data: { status: 'ok' } });
    mockLlmGateway.chat.mockResolvedValue({ content: 'OK', toolCalls: [], pendingAction: undefined });
  });

  describe('GET /api/v1/health/live', () => {
    it('returns 200 with all components healthy (no dependency calls)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/live')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database.status).toBe('healthy');
      expect(res.body.checks.redis.status).toBe('healthy');
      expect(res.body.checks.erp.status).toBe('healthy');
      expect(res.body.checks.llm.status).toBe('healthy');
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('returns 200 with all components healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.status).toBe('healthy');
      expect(res.body.timestamp).toBeDefined();
      expect(res.body.checks).toBeDefined();
      expect(res.body.checks.database).toBeDefined();
      expect(res.body.checks.redis).toBeDefined();
      expect(res.body.checks.erp).toBeDefined();
      expect(res.body.checks.llm).toBeDefined();
      expect(res.body.checks.database.status).toBe('healthy');
      expect(res.body.checks.redis.status).toBe('healthy');
      expect(res.body.checks.erp.status).toBe('healthy');
      expect(res.body.checks.llm.status).toBe('healthy');
      expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns 503 when database is unhealthy', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);

      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.database.status).toBe('unhealthy');
      expect(res.body.checks.database.error).toContain('Connection refused');
    });

    it('returns 503 when Redis is unhealthy', async () => {
      mockRedis.getClient().ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(503);

      expect(res.body.status).toBe('unhealthy');
      expect(res.body.checks.redis.status).toBe('unhealthy');
    });

    it('returns 200 with degraded status when ERP is down but others healthy', async () => {
      mockErpService.health.mockRejectedValueOnce(new Error('ERP unavailable'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.erp.status).toBe('unhealthy');
    });

    it('returns 200 with degraded status when LLM is down but others healthy', async () => {
      mockLlmGateway.chat.mockRejectedValueOnce(new Error('LLM timeout'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(res.body.status).toBe('degraded');
      expect(res.body.checks.llm.status).toBe('unhealthy');
    });

    it('includes latencyMs for each check', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(res.body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.checks.erp.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.body.checks.llm.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('caches LLM health check for 60s', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(mockLlmGateway.chat).toHaveBeenCalledTimes(1);

      await request(app.getHttpServer())
        .get('/api/v1/health/ready')
        .expect(200);

      expect(mockLlmGateway.chat).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/v1/health (alias of ready)', () => {
    it('returns 200 with all components healthy', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toBe('healthy');
    });

    it('returns 503 when database is unhealthy', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('Connection refused'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(503);

      expect(res.body.status).toBe('unhealthy');
    });

    it('returns 503 when Redis is unhealthy', async () => {
      mockRedis.getClient().ping.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(503);

      expect(res.body.status).toBe('unhealthy');
    });

    it('returns 200 degraded when ERP is down but others healthy', async () => {
      mockErpService.health.mockRejectedValueOnce(new Error('ERP unavailable'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toBe('degraded');
    });

    it('returns 200 degraded when LLM is down but others healthy', async () => {
      mockLlmGateway.chat.mockRejectedValueOnce(new Error('LLM timeout'));

      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);

      expect(res.body.status).toBe('degraded');
    });
  });

  describe('GET /api/v1/version', () => {
    it('returns 200 with version info', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/version')
        .expect(200);

      expect(res.body).toBeDefined();
      expect(res.body.version).toBe('0.1.0-test');
      expect(res.body.buildDate).toBe('2026-10-11T00:00:00.000Z');
      expect(res.body.commit).toBe('abc123');
      expect(res.body.environment).toBe('test');
    });
  });
});