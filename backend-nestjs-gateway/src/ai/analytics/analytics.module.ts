import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { StudioInsightsService } from './studio-insights.service';

@Module({
  providers: [
    PrismaService,
    AuditOutboxService,
    StudioInsightsService,
  ],
  exports: [StudioInsightsService],
})
export class AnalyticsModule {}
