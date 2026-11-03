import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { EventRegistrationsController } from './event-registrations.controller';
import { EventsService } from './events.service';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { LoginRateLimitGuard } from '../../auth/login-rate-limit.guard';

@Module({
  imports: [ErpnextModule],
  controllers: [PublicEventsController, EventRegistrationsController, EventsController],
  providers: [EventsService, AuditOutboxService, PrismaService, StaffAccessGuard, MemberOrStaffAccessGuard, TenantContextGuard, LoginRateLimitGuard],
})
export class EventsModule {}
