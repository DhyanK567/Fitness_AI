import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';

@Module({
  imports: [ErpnextModule],
  controllers: [ReportsController],
  providers: [ReportsService, PrismaService, StaffAccessGuard, TenantContextGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
