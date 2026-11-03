import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedbackController } from './feedback.controller';
import { MemberFeedbackController } from './member-feedback.controller';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { AuthenticatedAccessGuard } from '../../common/authenticated-access.guard';
import { AuditOutboxService } from '../../common/audit-outbox.service';

@Module({
  controllers: [FeedbackController, MemberFeedbackController],
  providers: [
    FeedbackService,
    PrismaService,
    AuditOutboxService,
    ConfigService,
    StaffAccessGuard,
    TenantContextGuard,
    AuthenticatedAccessGuard,
  ],
  exports: [FeedbackService],
})
export class FeedbackModule {}
