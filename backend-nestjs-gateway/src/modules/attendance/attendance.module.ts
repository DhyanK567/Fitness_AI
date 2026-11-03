import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

@Module({ imports: [ErpnextModule], controllers: [AttendanceController], providers: [AttendanceService, AuditOutboxService, PrismaService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard] })
export class AttendanceModule {}
