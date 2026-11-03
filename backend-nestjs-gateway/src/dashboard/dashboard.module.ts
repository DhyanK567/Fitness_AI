import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../common/prisma.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { TenantContextGuard } from '../common/tenant-context.guard';

@Module({ controllers: [DashboardController], providers: [DashboardService, PrismaService, StaffAccessGuard, TenantContextGuard] })
export class DashboardModule {}
