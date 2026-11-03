import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { RequestContextMiddleware } from './request-context.middleware';

function createResponse() {
  return { setHeader: jest.fn() };
}

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowDevHeader = process.env.ALLOW_DEV_TENANT_HEADER;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
  process.env.ALLOW_DEV_TENANT_HEADER = originalAllowDevHeader;
});

describe('RequestContextMiddleware', () => {
  const middleware = new RequestContextMiddleware();

  it('preserves a valid correlation ID and resolves the tenant from the host', () => {
    const request = {
      headers: { 'x-correlation-id': '123e4567-e89b-42d3-a456-426614174000', host: 'pilot-studio.fitness.local' },
    } as any;
    const response = createResponse();
    const next = jest.fn();

    middleware.use(request, response as any, next);

    expect(request.correlationId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(request.tenantCode).toBe('pilot-studio');
    expect(request.tenantId).toBeUndefined();
    expect(response.setHeader).toHaveBeenCalledWith('x-correlation-id', '123e4567-e89b-42d3-a456-426614174000');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects client-supplied tenant IDs before the request reaches a controller', () => {
    const request = { headers: { 'x-tenant-id': 'other-studio' } } as any;

    expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(
      BadRequestException,
    );
  });

  it('allows a supplied tenant only on the signed ERP callback route', () => {
    const request = { path: '/webhooks/erp-events', headers: { 'x-tenant-id': 'pilot-studio' } } as any;
    const next = jest.fn();
    middleware.use(request, createResponse() as any, next);
    expect(request.tenantCode).toBe('pilot-studio');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed tenant IDs on the ERP callback route', () => {
    const request = { path: '/webhooks/erp-events', headers: { 'x-tenant-id': 'a.bad.tenant' } } as any;
    expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
  });

  it('does not resolve a tenant from an unrelated host suffix', () => {
    const request = { headers: { host: 'pilot-studio.attacker.example' } } as any;
    middleware.use(request, createResponse() as any, jest.fn());
    expect(request.tenantId).toBeUndefined();
  });

  it('matches the database tenant-code length constraint at both boundaries', () => {
    const shortest = { headers: { host: 'ab.fitness.local' } } as any;
    middleware.use(shortest, createResponse() as any, jest.fn());
    expect(shortest.tenantCode).toBe('ab');

    const tooShort = { headers: { host: 'a.fitness.local' } } as any;
    middleware.use(tooShort, createResponse() as any, jest.fn());
    expect(tooShort.tenantCode).toBeUndefined();

    const longest = { headers: { host: `${'a'.repeat(39)}.fitness.local` } } as any;
    middleware.use(longest, createResponse() as any, jest.fn());
    expect(longest.tenantCode).toBe('a'.repeat(39));

    const tooLong = { headers: { host: `${'a'.repeat(40)}.fitness.local` } } as any;
    middleware.use(tooLong, createResponse() as any, jest.fn());
    expect(tooLong.tenantCode).toBeUndefined();
  });

  it('exempts platform Razorpay webhook routes from tenant-host resolution', () => {
    const prefixedRequest = {
      path: '/api/v1/webhooks/razorpay',
      headers: { host: 'pilot-studio.fitness.local', 'x-tenant-id': 'pilot-studio' },
    } as any;
    const next1 = jest.fn();
    middleware.use(prefixedRequest, createResponse() as any, next1);
    expect(prefixedRequest.tenantCode).toBeUndefined();
    expect(prefixedRequest.tenantId).toBeUndefined();
    expect(next1).toHaveBeenCalledTimes(1);

    const unprefixedRequest = {
      path: '/webhooks/razorpay',
      headers: { host: 'localhost' },
    } as any;
    const next2 = jest.fn();
    middleware.use(unprefixedRequest, createResponse() as any, next2);
    expect(unprefixedRequest.tenantCode).toBeUndefined();
    expect(unprefixedRequest.tenantId).toBeUndefined();
    expect(next2).toHaveBeenCalledTimes(1);
  });

  describe('x-tenant-code-dev header (dev tenant override)', () => {
    const makeRequest = (overrides: Record<string, any> = {}) => ({
      headers: { host: 'localhost', 'x-tenant-code-dev': 'my-studio', ...overrides },
      path: '/api/v1/auth/register/studio',
    } as any);

    it('accepts header when NODE_ENV=development AND ALLOW_DEV_TENANT_HEADER=true', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = makeRequest();
      const next = jest.fn();
      middleware.use(request, createResponse() as any, next);
      expect(request.tenantCode).toBe('my-studio');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('rejects header when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = makeRequest();
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });

    it('rejects header when NODE_ENV=staging', () => {
      process.env.NODE_ENV = 'staging';
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = makeRequest();
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });

    it('rejects header when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = makeRequest();
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });

    it('rejects header when NODE_ENV is unset', () => {
      delete process.env.NODE_ENV;
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = makeRequest();
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });

    it('rejects header when ALLOW_DEV_TENANT_HEADER is not "true"', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_TENANT_HEADER = 'false';
      const request = makeRequest();
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);

      process.env.ALLOW_DEV_TENANT_HEADER = '1';
      const request2 = makeRequest();
      expect(() => middleware.use(request2, createResponse() as any, jest.fn())).toThrow(BadRequestException);

      delete process.env.ALLOW_DEV_TENANT_HEADER;
      const request3 = makeRequest();
      expect(() => middleware.use(request3, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });

    it('rejects invalid tenant code format in dev header', () => {
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_DEV_TENANT_HEADER = 'true';
      const request = { ...makeRequest(), headers: { ...makeRequest().headers, 'x-tenant-code-dev': 'invalid.tenant' } };
      expect(() => middleware.use(request, createResponse() as any, jest.fn())).toThrow(BadRequestException);
    });
  });
});
