import { Module } from '@nestjs/common';
import { AuditOutboxService } from '../../common/audit-outbox.service';
import { PrismaService } from '../../common/prisma.service';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ErpnextModule } from '../../erpnext/erpnext.module';
import { ClassesController } from './classes.controller';
import { ClassesPublicController } from './classes-public.controller';
import { ClassesService } from './classes.service';

@Module({ imports: [ErpnextModule], controllers: [ClassesController, ClassesPublicController], providers: [ClassesService, AuditOutboxService, PrismaService, StaffAccessGuard, TenantContextGuard] })
export class ClassesModule {}
