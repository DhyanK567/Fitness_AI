import { Injectable } from '@nestjs/common';
import { signAccessToken, verifyAccessToken } from '../src/common/auth-token';

@Injectable()
export class JwtService {
  private readonly options: any = {};

  sign(payload: any, options?: any): string {
    const secret = options?.secret || this.options?.secret || 'default-secret';
    return signAccessToken(payload, secret);
  }

  verify<T extends object = any>(token: string, options?: any): T {
    const secret = options?.secret || this.options?.secret || 'default-secret';
    const claims = verifyAccessToken(token, secret);
    if (!claims) {
      throw new Error('Invalid token');
    }
    return claims as unknown as T;
  }

  decode(token: string) {
    const [, body] = token.split('.');
    if (!body) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }
}

export class JwtModule {
  static register(options?: any) {
    return {
      module: JwtModule,
      providers: [
        {
          provide: JwtService,
          useValue: new JwtService(),
        },
      ],
      exports: [JwtService],
    };
  }

  static registerAsync(options?: any) {
    return {
      module: JwtModule,
      providers: [
        {
          provide: JwtService,
          useClass: JwtService,
        },
      ],
      exports: [JwtService],
    };
  }
}

export class TokenExpiredError extends Error {}
export class NotBeforeError extends Error {}
export class JsonWebTokenError extends Error {}
