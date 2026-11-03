import { Module } from '@nestjs/common';
import { ErpnextModule } from '../erpnext/erpnext.module';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';

@Module({
  imports: [ErpnextModule],
  controllers: [ImportExportController],
  providers: [
    ImportExportService,
    AuditOutboxService,
    PrismaService,
    StaffAccessGuard,
    TenantContextGuard,
  ],
  exports: [ImportExportService],
})
export class ImportExportModule {}
