import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { GoogleIdentityService } from '../src/auth/google-identity.service';
import { AuthenticatedAccessGuard } from '../src/common/authenticated-access.guard';
import { TenantContextGuard } from '../src/common/tenant-context.guard';
import { LoginRateLimitGuard } from '../src/auth/login-rate-limit.guard';

const tenantId = '123e4567-e89b-42d3-a456-426614174000';

describe('Member Google auth HTTP boundary (e2e)', () => {
  let app: INestApplication;
  const auth = {
    loginWithGoogle: jest.fn(async () => ({ access_token: 'member-session' })),
    linkGoogleAccount: jest.fn(async () => ({ status: 'linked', already_linked: false })),
  };
  const google = { verify: jest.fn(async () => ({ subject: 'verified-google-subject' })) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthService).useValue(auth)
      .overrideProvider(GoogleIdentityService).useValue(google)
      .overrideGuard(TenantContextGuard).useValue({ canActivate: (context: any) => {
        const req = context.switchToHttp().getRequest();
        req.tenantId = tenantId;
        req.tenantCode = 'pilot';
        return true;
      } })
      .overrideGuard(LoginRateLimitGuard).useValue({ canActivate: () => true })
      .overrideGuard(AuthenticatedAccessGuard).useValue({ canActivate: (context: any) => {
        context.switchToHttp().getRequest().auth = { userId: 'member-1', roles: ['member'], sessionId: 'session-1' };
        return true;
      } })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('verifies a Google token and creates a member session through the routed endpoint', async () => {
    await request(app.getHttpServer())
      .post('/auth/member/google')
      .set('Host', 'pilot.fitness.local')
      .send({ id_token: 'g'.repeat(40) })
      .expect(200)
      .expect({ access_token: 'member-session' });

    expect(google.verify).toHaveBeenCalledWith('g'.repeat(40));
    expect(auth.loginWithGoogle).toHaveBeenCalledWith(tenantId, 'pilot', expect.any(String), 'verified-google-subject');
  });

  it('links the verified Google identity only to the authenticated member', async () => {
    await request(app.getHttpServer())
      .post('/auth/member/google/link')
      .set('Host', 'pilot.fitness.local')
      .send({ id_token: 'g'.repeat(40) })
      .expect(200)
      .expect({ status: 'linked', already_linked: false });

    expect(auth.linkGoogleAccount).toHaveBeenCalledWith(tenantId, 'member-1', 'session-1', 'verified-google-subject', expect.any(String));
  });

  it('rejects malformed ID-token payloads before invoking the identity verifier', async () => {
    google.verify.mockClear();
    await request(app.getHttpServer())
      .post('/auth/member/google')
      .set('Host', 'pilot.fitness.local')
      .send({ id_token: 'short' })
      .expect(400);
    expect(google.verify).not.toHaveBeenCalled();
  });
});
