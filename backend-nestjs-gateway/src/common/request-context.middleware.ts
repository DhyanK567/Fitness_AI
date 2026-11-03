import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';

import type { RequestWithContext } from './request-context.types';
import { withRequestAuditContext } from './request-audit-context';

const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_CODE_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}$/;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function tenantFromHost(host: string | undefined, baseDomain: string): string | undefined {
  if (!host) {
    return undefined;
  }

  const hostname = host.split(':')[0]?.trim().toLowerCase();
  if (!hostname || !baseDomain || !hostname.endsWith(`.${baseDomain}`)) {
    return undefined;
  }
  const tenantCode = hostname.slice(0, -(baseDomain.length + 1));
  if (tenantCode.includes('.')) return undefined;
  return tenantCode && TENANT_CODE_PATTERN.test(tenantCode) ? tenantCode : undefined;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor() {}

  use(request: RequestWithContext, response: Response, next: NextFunction): void {
    const suppliedCorrelationId = firstHeaderValue(request.headers['x-correlation-id']);
    if (suppliedCorrelationId && !CORRELATION_ID_PATTERN.test(suppliedCorrelationId)) {
      throw new BadRequestException('x-correlation-id must be a canonical UUID.');
    }

    const correlationId = suppliedCorrelationId ?? randomUUID();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const baseDomain = process.env.TENANT_BASE_DOMAIN ?? 'fitness.local';
    const suppliedTenant = firstHeaderValue(request.headers['x-tenant-id']);
    const path = request.path?.split('?')[0];

    const isPlatformWebhook = path === '/webhooks/razorpay' || path === '/api/v1/webhooks/razorpay' || path?.endsWith('/webhooks/razorpay');
    if (isPlatformWebhook) {
      request.tenantCode = undefined;
      request.tenantId = undefined;
      withRequestAuditContext({
        ipAddress: request.ip,
        route: request.path,
        userAgent: firstHeaderValue(request.headers['user-agent']),
      }, next);
      return;
    }

    // Dev-only tenant code override via header (e.g., x-tenant-code-dev: mysite)
    // Only allowed when NODE_ENV === 'development' AND ALLOW_DEV_TENANT_HEADER === 'true'
    const devTenantOverride = firstHeaderValue(request.headers['x-tenant-code-dev']);
    const allowDevTenantHeader = process.env.ALLOW_DEV_TENANT_HEADER === 'true';
    const isDevelopment = process.env.NODE_ENV === 'development';
    if (devTenantOverride) {
      if (!isDevelopment || !allowDevTenantHeader) {
        throw new BadRequestException('Dev tenant override header is only allowed when NODE_ENV=development and ALLOW_DEV_TENANT_HEADER=true');
      }
      if (!TENANT_CODE_PATTERN.test(devTenantOverride)) {
        throw new BadRequestException('x-tenant-code-dev is invalid');
      }
      request.tenantCode = devTenantOverride;
      withRequestAuditContext({
        ipAddress: request.ip,
        route: request.path,
        userAgent: firstHeaderValue(request.headers['user-agent']),
      }, next);
      return;
    }

    if (suppliedTenant && path !== '/webhooks/erp-events') {
      throw new BadRequestException('Tenant selection must come from the request host.');
    }

    if (suppliedTenant && !TENANT_CODE_PATTERN.test(suppliedTenant)) {
      throw new BadRequestException('x-tenant-id is invalid.');
    }
    const hostHeader = firstHeaderValue(request.headers['x-tenant-host']) ||
      firstHeaderValue(request.headers['x-forwarded-host']) ||
      firstHeaderValue(request.headers.host);
    let tenantCode = suppliedTenant ?? tenantFromHost(hostHeader, baseDomain);
    if (!tenantCode && process.env.NODE_ENV !== 'production') {
      const rawHost = hostHeader?.split(':')[0]?.trim().toLowerCase();
      if (rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === '::1' || !rawHost) {
        tenantCode = process.env.DEV_DEFAULT_TENANT || 'pilot-studio';
      }
    }
    if (tenantCode) {
      request.tenantCode = tenantCode;
    }

    withRequestAuditContext({
      ipAddress: request.ip,
      route: request.path,
      userAgent: firstHeaderValue(request.headers['user-agent']),
    }, next);
  }
}
