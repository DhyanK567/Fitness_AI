import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { of, throwError } from 'rxjs';
import { ErpnextService } from './erpnext.service';

describe('ErpnextService adapter boundary', () => {
  const config = {
    get: (key: string) => ({
      FRAPPE_BASE_URL: 'https://erp.example.test/',
      FRAPPE_API_KEY: 'integration-key',
      FRAPPE_API_SECRET: 'integration-secret',
      FRAPPE_TIMEOUT_MS: '5000',
    })[key],
  };

  beforeEach(() => {
    process.env.FRAPPE_BASE_URL = 'https://erp.example.test/';
    process.env.FRAPPE_API_KEY = 'integration-key';
    process.env.FRAPPE_API_SECRET = 'integration-secret';
    process.env.FRAPPE_TIMEOUT_MS = '5000';
  });

  afterEach(() => {
    delete process.env.FRAPPE_BASE_URL;
    delete process.env.FRAPPE_API_KEY;
    delete process.env.FRAPPE_API_SECRET;
    delete process.env.FRAPPE_TIMEOUT_MS;
  });

  it('sends tenant and correlation context with restricted integration credentials and unwraps Frappe response', async () => {
    const post = jest.fn(() => of({ data: { message: { booking_id: 'BK-1' } } } as any));
    const service = new ErpnextService({ post } as any);

    await expect(service.call({
      tenantId: 'tenant-a',
      correlationId: 'corr-a',
      method: 'wellness_studio.api.booking.book',
      idempotencyKey: 'request-1',
      body: { member: 'MEM-1' },
    })).resolves.toEqual({ booking_id: 'BK-1' });

    expect(post).toHaveBeenCalledWith(
      'https://erp.example.test/api/method/wellness_studio.api.booking.book',
      { member: 'MEM-1' },
      expect.objectContaining({
        timeout: 5000,
        headers: expect.objectContaining({
          Authorization: 'token integration-key:integration-secret',
          'X-Tenant-ID': 'tenant-a',
          'X-Correlation-ID': 'corr-a',
          'Idempotency-Key': 'request-1',
        }),
      }),
    );
  });

  it('uses GET for read-only health probes', async () => {
    const get = jest.fn(() => of({ data: { message: { status: 'ok' } } } as any));
    const service = new ErpnextService({ get } as any);

    await expect(service.health({ tenantId: 'tenant-a', correlationId: 'corr-health' }))
      .resolves.toEqual({ status: 'ok' });
    expect(get).toHaveBeenCalledWith(
      'https://erp.example.test/api/method/wellness_studio.api.health.health',
      expect.objectContaining({
        timeout: 5000,
        headers: expect.objectContaining({
          Authorization: 'token integration-key:integration-secret',
          'X-Tenant-ID': 'tenant-a',
          'X-Correlation-ID': 'corr-health',
        }),
      }),
    );
  });

  it('fails startup when the installed Frappe app version differs from the configured contract', async () => {
    const get = jest.fn(() => of({ data: { message: { app: 'wellness_studio', version: '0.0.2' } } } as any));
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.FRAPPE_EXPECTED_APP_VERSION = '0.0.1';
    const service = new ErpnextService({ get } as any);

    await expect(service.onModuleInit()).rejects.toThrow('ERPNext startup compatibility check failed');
    delete process.env.FRAPPE_EXPECTED_APP_VERSION;
    process.env.NODE_ENV = originalNodeEnv;
    expect(get).toHaveBeenCalledWith(
      'https://erp.example.test/api/method/wellness_studio.api.health.version',
      expect.objectContaining({ timeout: 10000 }),
    );
  });

  it('allows startup only when the expected Frappe app version matches', async () => {
    const get = jest.fn(() => of({ data: { message: { app: 'wellness_studio', version: '0.0.1' } } } as any));
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.FRAPPE_EXPECTED_APP_VERSION = '0.0.1';
    const service = new ErpnextService({ get } as any);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    delete process.env.FRAPPE_EXPECTED_APP_VERSION;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('maps an unavailable whitelisted Frappe method to a gateway error', async () => {
    const post = jest.fn(() => throwError(() => ({ response: { status: 404 } })));
    const service = new ErpnextService({ post } as any);
    await expect(service.call({ tenantId: 'tenant-a', correlationId: 'corr-a', method: 'missing.method' }))
      .rejects.toThrow(BadGatewayException);
  });

  it('maps allowlisted Frappe business errors to stable API statuses without leaking upstream details', async () => {
    let failure: unknown;
    const post = jest.fn(() => throwError(() => failure));
    const service = new ErpnextService({ post } as any);
    const scenarios = [
      { status: 417, exc_type: 'frappe.exceptions.ValidationError', expected: BadRequestException },
      { status: 409, exc_type: 'frappe.exceptions.DuplicateEntryError', expected: ConflictException },
      { status: 500, exc_type: 'frappe.exceptions.DuplicateEntryError', expected: ServiceUnavailableException },
      // Do not let an unexpected server failure become a client conflict based
      // solely on an upstream exception label.
      { status: 500, exc_type: 'frappe.exceptions.NameError', expected: ServiceUnavailableException },
      { status: 404, exc_type: 'frappe.exceptions.DoesNotExistError', expected: NotFoundException },
      { status: 403, exc_type: 'frappe.exceptions.PermissionError', expected: ForbiddenException },
      // A missing method and an invalid gateway credential are upstream faults,
      // not a caller's missing record or unauthenticated request.
      { status: 404, exc_type: 'MethodNotFound', expected: BadGatewayException },
      { status: 401, exc_type: 'AuthenticationError', expected: BadGatewayException },
      { status: 417, exc_type: 'UnexpectedError', expected: BadGatewayException },
    ];

    for (const scenario of scenarios) {
      failure = { response: { status: scenario.status, data: {
        exc_type: scenario.exc_type,
        exception: 'sensitive upstream stack trace and filesystem path',
      } } };
      try {
        await service.call({ tenantId: 'tenant-a', correlationId: 'corr-a', method: 'wellness_studio.api.member.create_member' });
        throw new Error('expected mapped ERP exception');
      } catch (error) {
        expect(error).toBeInstanceOf(scenario.expected);
        expect((error as Error).message).not.toContain('sensitive upstream');
      }
    }
  });

  it('maps transport failures to service unavailable without leaking provider details', async () => {
    const post = jest.fn(() => throwError(() => new Error('private upstream detail')));
    const service = new ErpnextService({ post } as any);
    try {
      await service.call({ tenantId: 'tenant-a', correlationId: 'corr-a', method: 'some.method' });
      throw new Error('expected upstream failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as Error).message).not.toContain('private upstream detail');
    }
  });
});
