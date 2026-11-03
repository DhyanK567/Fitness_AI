import { Module } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';
import { PrismaService } from '../common/prisma.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { SettingReadGuard } from './setting-read.guard';

@Module({
  controllers: [ConfigurationController],
  providers: [
    ConfigurationService,
    PrismaService,
    AuditOutboxService,
    StaffAccessGuard,
    TenantContextGuard,
    SettingReadGuard,
  ],
})
export class ConfigurationModule {}
