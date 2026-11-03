import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { MemberOrStaffAccessGuard } from './booking-access.guard';

@Module({ imports: [ErpnextModule], controllers: [BookingsController], providers: [BookingsService, AuditOutboxService, PrismaService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard] })
export class BookingsModule {}
