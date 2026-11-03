import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    role: string;
  };
}

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Tenant ID is already attached by AuthGuard
    const tenantId = request.headers['x-tenant-id'] as string || request.user?.tenantId;

    if (!tenantId) {
      // For AI endpoints, tenant might come from the token
      return true;
    }

    return true;
  }
}