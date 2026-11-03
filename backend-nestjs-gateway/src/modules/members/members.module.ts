import { Module } from '@nestjs/common';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { PrismaService } from '../../common/prisma.service';
import { MembersController } from './members.controller';
import { MemberSelfController } from './member-self.controller';
import { MembersService } from './members.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';

@Module({ imports: [ErpnextModule], controllers: [MembersController, MemberSelfController], providers: [MembersService, AuditOutboxService, PrismaService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard] })
export class MembersModule {}
