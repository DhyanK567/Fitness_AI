import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { LeadsController } from './leads.controller';
import { PublicEnquiryController } from './public-enquiry.controller';
import { LeadsService } from './leads.service';
import { LoginRateLimitGuard } from '../../auth/login-rate-limit.guard';

@Module({ imports: [ErpnextModule], controllers: [LeadsController, PublicEnquiryController], providers: [LeadsService, AuditOutboxService, PrismaService, StaffAccessGuard, TenantContextGuard, LoginRateLimitGuard], exports: [LeadsService] })
export class LeadsModule {}
