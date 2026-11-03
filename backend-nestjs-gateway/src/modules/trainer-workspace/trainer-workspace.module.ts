import { Module } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { TrainerWorkspaceController } from './trainer-workspace.controller';
import { TrainerWorkspaceService } from './trainer-workspace.service';

@Module({ controllers: [TrainerWorkspaceController], providers: [TrainerWorkspaceService, PrismaService, StaffAccessGuard, TenantContextGuard] })
export class TrainerWorkspaceModule {}
