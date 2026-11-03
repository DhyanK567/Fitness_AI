import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { MembershipsController } from './memberships.controller';
import { MemberMembershipsController } from './member-memberships.controller';
import { MembershipPlansPublicController } from './membership-plans-public.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [ErpnextModule],
  controllers: [MembershipPlansPublicController, MemberMembershipsController, MembershipsController],
  providers: [MembershipsService, AuditOutboxService, PrismaService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard],
})
export class MembershipsModule {}
