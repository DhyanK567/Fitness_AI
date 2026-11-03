
import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller';
import { MemberAuthController } from './member-auth.controller';
import { AuthMemberController } from './auth.member.controller';
import { AuthLifecycleController } from './auth-lifecycle.controller';
import { AuthRegistrationController } from './auth-registration.controller';
import { TeamInvitationsController } from './team-invitations.controller';

import { AuthService } from './auth.service';
import { GoogleIdentityService } from './google-identity.service';
import { TeamInvitationsService } from './team-invitations.service';
import { InvitationEmailService } from './invitation-email.service';

import { PrismaService } from '../common/prisma.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { LoginRateLimitGuard } from './login-rate-limit.guard';
import { PlatformRateLimitGuard } from './platform-rate-limit.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { AuthenticatedAccessGuard } from '../common/authenticated-access.guard';
import { AuditOutboxService } from '../common/audit-outbox.service';

import { ErpnextModule } from '../erpnext/erpnext.module';

@Module({
  imports: [ErpnextModule],
  controllers: [
    AuthController,
    MemberAuthController,
    AuthMemberController,
    AuthLifecycleController,
    AuthRegistrationController,
    TeamInvitationsController,
  ],
  providers: [
    AuthService,
    GoogleIdentityService,
    PrismaService,
    StaffAccessGuard,
    LoginRateLimitGuard,
    PlatformRateLimitGuard,
    TenantContextGuard,
    AuthenticatedAccessGuard,
    AuditOutboxService,
    TeamInvitationsService,
    InvitationEmailService,
  ],
  exports: [AuthService],
})
export class AuthModule { }
