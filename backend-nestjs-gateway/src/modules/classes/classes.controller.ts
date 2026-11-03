import { Body, Controller, Delete, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { StaffAccessGuard } from '../../common/staff-access.guard';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { ClassScheduleDto } from './dto/class-schedule.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { UpdateClassScheduleDto } from './dto/update-class-schedule.dto';
import { CLASSES_PERMISSIONS } from './classes.policy';
import { ClassesService } from './classes.service';

@Controller('classes')
@UseGuards(TenantContextGuard, StaffAccessGuard)
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Post()
  @RequirePermission(CLASSES_PERMISSIONS.write)
  create(@Req() req: RequestWithContext, @Body() body: CreateClassDto) {
    return this.classes.create(this.context(req), body, req.auth?.userId as string);
  }

  @Put(':id')
  @RequirePermission(CLASSES_PERMISSIONS.write)
  update(@Req() req: RequestWithContext, @Param('id') id: string, @Body() body: UpdateClassDto) {
    return this.classes.update(this.context(req), id, body, req.auth?.userId as string);
  }

  @Delete(':id')
  @RequirePermission(CLASSES_PERMISSIONS.write)
  deactivate(@Req() req: RequestWithContext, @Param('id') id: string) {
    return this.classes.deactivate(this.context(req), id, req.auth?.userId as string);
  }

  @Post(':classId/schedules')
  @RequirePermission(CLASSES_PERMISSIONS.write)
  createSchedule(@Req() req: RequestWithContext, @Param('classId') classId: string, @Body() body: ClassScheduleDto) {
    return this.classes.createSchedule(this.context(req), classId, body, req.auth?.userId as string);
  }

  @Put(':classId/schedules/:scheduleId')
  @RequirePermission(CLASSES_PERMISSIONS.write)
  updateSchedule(@Req() req: RequestWithContext, @Param('classId') classId: string, @Param('scheduleId') scheduleId: string, @Body() body: UpdateClassScheduleDto) {
    return this.classes.updateSchedule(this.context(req), classId, scheduleId, body, req.auth?.userId as string);
  }

  @Delete(':classId/schedules/:scheduleId')
  @RequirePermission(CLASSES_PERMISSIONS.write)
  deactivateSchedule(@Req() req: RequestWithContext, @Param('classId') classId: string, @Param('scheduleId') scheduleId: string) {
    return this.classes.deactivateSchedule(this.context(req), classId, scheduleId, req.auth?.userId as string);
  }

  private context(req: RequestWithContext) {
    return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string };
  }
}
