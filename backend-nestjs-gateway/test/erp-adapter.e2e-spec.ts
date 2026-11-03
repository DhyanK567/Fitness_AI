import { createServer, type Server } from 'node:http';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { StaffAccessGuard } from '../src/common/staff-access.guard';
import { TenantContextGuard } from '../src/common/tenant-context.guard';

describe('ERP adapter HTTP boundary (e2e)', () => {
  let app: INestApplication;
  let frappe: Server;
  let frappeBaseUrl: string;
  let responseStatus = 200;
  let responseBody: unknown = { message: { app: 'wellness_studio', version: '0.0.1' } };
  let received: { path?: string; authorization?: string; tenant?: string; correlation?: string } = {};

  beforeAll(async () => {
    frappe = createServer((incoming, outgoing) => {
      received = {
        path: incoming.url,
        authorization: incoming.headers.authorization,
        tenant: incoming.headers['x-tenant-id'] as string | undefined,
        correlation: incoming.headers['x-correlation-id'] as string | undefined,
      };
      outgoing.writeHead(responseStatus, { 'content-type': 'application/json' });
      outgoing.end(JSON.stringify(responseBody));
    });
    await new Promise<void>((resolve) => frappe.listen(0, '127.0.0.1', resolve));
    const address = frappe.address();
    if (!address || typeof address === 'string') throw new Error('Local Frappe fixture did not bind a TCP port');
    frappeBaseUrl = `http://127.0.0.1:${address.port}`;

    const configValues: Record<string, string> = {
      FRAPPE_BASE_URL: frappeBaseUrl,
      FRAPPE_API_KEY: 'fixture-key',
      FRAPPE_API_SECRET: 'fixture-secret',
      FRAPPE_TIMEOUT_MS: '1500',
      FRAPPE_EXPECTED_APP_VERSION: '',
      NODE_ENV: 'test',
      TENANT_BASE_DOMAIN: 'fitness.local',
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService).useValue({ get: (key: string) => configValues[key] })
      .overrideGuard(TenantContextGuard).useValue({ canActivate: (context: any) => {
        const req = context.switchToHttp().getRequest();
        req.tenantId = '123e4567-e89b-42d3-a456-426614174000';
        req.tenantCode = 'pilot';
        return true;
      } })
      .overrideGuard(StaffAccessGuard).useValue({ canActivate: () => true })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await new Promise<void>((resolve, reject) => frappe.close((error) => error ? reject(error) : resolve()));
  });

  it('routes through NestJS and performs an authenticated Frappe version HTTP request', async () => {
    responseStatus = 200;
    responseBody = { message: { app: 'wellness_studio', version: '0.0.1' } };

    await request(app.getHttpServer())
      .get('/erpnext/version')
      .set('Host', 'pilot.fitness.local')
      .expect(200)
      .expect({ app: 'wellness_studio', version: '0.0.1' });

    expect(received.path).toBe('/api/method/wellness_studio.api.health.version');
    expect(received.authorization).toBe('token fixture-key:fixture-secret');
    expect(received.tenant).toBe('pilot');
    expect(received.correlation).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('maps an unavailable ERP method to a generic gateway error without provider details', async () => {
    responseStatus = 404;
    responseBody = { exc: 'private ERP stack trace' };

    await request(app.getHttpServer())
      .get('/erpnext/version')
      .set('Host', 'pilot.fitness.local')
      .expect(502)
      .expect((response) => {
        expect(response.body.message).toBe('ERPNext method is unavailable');
        expect(JSON.stringify(response.body)).not.toContain('private ERP stack trace');
      });
  });

  it('maps Frappe validation over HTTP to a safe client error without exposing its traceback', async () => {
    responseStatus = 417;
    responseBody = {
      exc_type: 'frappe.exceptions.ValidationError',
      exception: 'private ERP stack trace and filesystem path',
    };

    await request(app.getHttpServer())
      .get('/erpnext/version')
      .set('Host', 'pilot.fitness.local')
      .expect(400)
      .expect((response) => {
        expect(response.body.message).toBe('ERP request failed validation');
        expect(JSON.stringify(response.body)).not.toContain('private ERP stack trace');
        expect(JSON.stringify(response.body)).not.toContain('filesystem path');
      });
  });
});
