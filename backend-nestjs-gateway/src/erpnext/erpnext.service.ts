import {
  Injectable,
  InternalServerErrorException,
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  OnModuleInit,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type ErpRequestContext = {
  tenantId: string;
  correlationId: string;
  userId?: string;
  role?: string;
};

type ErpMethodRequest = ErpRequestContext & {
  method: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  httpMethod?: 'GET' | 'POST';
  timeoutMs?: number;
};

function frappeExceptionName(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || !('exc_type' in data)) return undefined;
  const type = (data as { exc_type?: unknown }).exc_type;
  if (typeof type !== 'string' || type.length > 200) return undefined;
  return type.split('.').pop();
}


@Injectable()
export class ErpnextService implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private getEnv(key: string): string | undefined {
    return this.config?.get<string>(key) ?? process.env[key];
  }

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    const expectedVersion = this.getEnv('FRAPPE_EXPECTED_APP_VERSION');
    if (!expectedVersion) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ERPNext startup compatibility check requires FRAPPE_EXPECTED_APP_VERSION');
      }
      return;
    }
    try {
      const installed = await this.version(
        { tenantId: 'startup-check', correlationId: randomUUID() },
        10_000,
      );
      if (installed?.app !== 'wellness_studio' || installed?.version !== expectedVersion) {
        throw new Error('Installed custom-app version does not match the expected version');
      }
    } catch {
      throw new Error('ERPNext startup compatibility check failed');
    }
  }

  async getLoggedInUser(context: ErpRequestContext) {
    return this.call({ ...context, method: 'frappe.auth.get_logged_user', httpMethod: 'GET' });
  }

  private timeout(): number {
    const configured = Number(this.getEnv('FRAPPE_TIMEOUT_MS') ?? 10_000);
    return Number.isFinite(configured) ? Math.min(Math.max(configured, 1_000), 30_000) : 10_000;
  }

  async health(context: ErpRequestContext) {
    return this.call({ ...context, method: 'wellness_studio.api.health.health', httpMethod: 'GET' });
  }

  async version(context: ErpRequestContext, timeoutMs?: number) {
    return this.call({ ...context, method: 'wellness_studio.api.health.version', httpMethod: 'GET', timeoutMs });
  }

  async call(request: ErpMethodRequest) {
    const baseUrl = this.getEnv('FRAPPE_BASE_URL') ?? this.getEnv('ERPNEXT_URL');
    const apiKey = this.getEnv('FRAPPE_API_KEY') ?? this.getEnv('ERPNEXT_API_KEY');
    const apiSecret = this.getEnv('FRAPPE_API_SECRET') ?? this.getEnv('ERPNEXT_API_SECRET');
    if (!baseUrl || !apiKey || !apiSecret) {
      throw new InternalServerErrorException('ERPNext environment variables are not configured');
    }
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/method/${request.method}`;
      const config = { headers: {
          Authorization: `token ${apiKey}:${apiSecret}`,
          'X-Tenant-ID': request.tenantId,
          'X-Correlation-ID': request.correlationId,
          ...(request.userId ? { 'X-User-ID': request.userId } : {}),
          ...(request.role ? { 'X-User-Role': request.role } : {}),
          ...(request.idempotencyKey ? { 'Idempotency-Key': request.idempotencyKey } : {}),
        }, timeout: request.timeoutMs ?? this.timeout() };
      const response = request.httpMethod === 'GET'
        ? await firstValueFrom(this.httpService.get(url, { ...config, params: request.body }))
        : await firstValueFrom(this.httpService.post(url, request.body ?? {}, config));
      return response.data?.message ?? response.data;
    } catch (error) {
      const response = (error as { response?: { status?: number; data?: unknown } }).response;
      const status = response?.status;
      const exceptionName = frappeExceptionName(response?.data);

      // Map only known Frappe exception classes. Upstream body/trace details are
      // deliberately discarded so provider internals never reach API clients.
      if (status === 404 && exceptionName === 'DoesNotExistError') {
        throw new NotFoundException('Requested ERP record was not found');
      }
      if (status === 409) {
        throw new ConflictException('ERP request conflicts with existing business data');
      }
      if ((status === 417 || status === 422) && ['ValidationError', 'FrappeTypeError', 'LinkValidationError'].includes(exceptionName ?? '')) {
        throw new BadRequestException('ERP request failed validation');
      }
      if (status === 403 && exceptionName === 'PermissionError') {
        throw new ForbiddenException('ERP denied this operation');
      }
      // A missing whitelisted method or invalid integration credential is an
      // adapter/configuration failure, not a client-side 404/401.
      if (status === 404) throw new BadGatewayException('ERPNext method is unavailable');
      if (status && status >= 400 && status < 500) throw new BadGatewayException('ERPNext rejected the request');
      throw new ServiceUnavailableException('ERPNext is unavailable');
    }
  }
}
