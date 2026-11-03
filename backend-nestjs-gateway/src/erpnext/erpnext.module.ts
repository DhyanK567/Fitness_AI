import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';

import { ErpnextService } from './erpnext.service';
import { ErpnextController } from './erpnext.controller';
import { ErpCallbackController } from './erp-callback.controller';
import { PrismaService } from '../common/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';

@Global()
@Module({
  imports: [HttpModule],
  controllers: [ErpnextController, ErpCallbackController],
  providers: [ErpnextService, PrismaService, AuditOutboxService, StaffAccessGuard, TenantContextGuard, JwtService],
  exports: [ErpnextService, PrismaService, JwtService, AuditOutboxService],
})
export class ErpnextModule {}
