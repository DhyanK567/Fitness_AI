import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ClassesService } from './classes.service';

/** Read-only public/member catalogue routes; writes live in ClassesController. */
@Controller('classes')
@UseGuards(TenantContextGuard)
export class ClassesPublicController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  list(@Req() req: RequestWithContext) {
    return this.classes.list(this.context(req));
  }

  @Get(':id')
  get(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.classes.get(this.context(req), id);
  }

  @Get(':classId/schedules')
  listSchedules(@Req() req: RequestWithContext, @Param('classId') classId: string) {
    return this.classes.listSchedules(this.context(req), classId);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string };
  }
}
