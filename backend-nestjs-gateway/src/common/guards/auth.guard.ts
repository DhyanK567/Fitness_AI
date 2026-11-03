import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../prisma.service';

interface JwtPayload {
  sub: string;
  tenantId?: string;
  tenant?: string;
  role?: string;
  roles?: string[];
  userId?: string;
  sid?: string;
}

// Extend Express Request type to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenantId: string;
    role: string;
  };
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        throw new Error('JWT_SECRET environment variable is not configured');
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret,
      });

      // Attach user info to request
      request.user = {
        id: (payload.userId || payload.sub) as string,
        tenantId: (payload.tenantId || payload.tenant) as string,
        role: (payload.role || payload.roles?.[0]) as string,
      };

      if (!payload.sid) {
        throw new UnauthorizedException('Token is missing session ID');
      }

      const session = await this.prisma.authSession.findUnique({
        where: { id: payload.sid }
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw new UnauthorizedException('Session is invalid or revoked');
      }

      // Verify the session belongs to the same tenant as the token
      if (session.tenantId !== request.user!.tenantId) {
        throw new UnauthorizedException('Invalid tenant access token');
      }

      // Verify tenant exists and is active
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: request.user!.tenantId },
      });

      if (!tenant || tenant.status !== 'active') {
        throw new UnauthorizedException('Tenant not found or inactive');
      }

      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}