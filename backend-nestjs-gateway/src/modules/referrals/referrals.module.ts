import { Module } from '@nestjs/common';
import { ReferralsController } from './referrals.controller';
import { ReferralsService } from './referrals.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';

@Module({
  controllers: [ReferralsController],
  providers: [
    ReferralsService,
    PrismaService,
    StaffAccessGuard,
    MemberOrStaffAccessGuard,
    TenantContextGuard,
  ],
  exports: [ReferralsService],
})
export class ReferralsModule {}
