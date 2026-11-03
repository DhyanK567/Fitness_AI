import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';
import { CreateClassScheduleDto, UpdateClassScheduleDto, ClassScheduleResponseDto } from './dto';
import { ToolResult } from '../../common/erp-base.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Class Schedules')
@ApiBearerAuth()
@Controller('class-schedules')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Post()
  @RequirePermission('schedules:write')
  @ApiOperation({ summary: 'Create a new class schedule' })
  async create(
    @Body() dto: CreateClassScheduleDto,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `schedule_${Date.now()}`,
    };
    return this.service.create(context, dto);
  }

  @Get()
  @RequirePermission('schedules:read')
  @ApiOperation({ summary: 'List class schedules with optional class filter' })
  async findAll(
    @Request() req: any,
    @Query('class_id') classId?: string,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `list_${Date.now()}`,
    };
    return this.service.findAll(context, classId);
  }

  @Get(':id')
  @RequirePermission('schedules:read')
  @ApiOperation({ summary: 'Get class schedule by ID' })
  async findOne(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `get_${Date.now()}`,
    };
    return this.service.findOne(context, id);
  }

  @Patch(':id')
  @RequirePermission('schedules:write')
  @ApiOperation({ summary: 'Update class schedule' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClassScheduleDto,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `update_${Date.now()}`,
    };
    return this.service.update(context, id, dto);
  }

  @Delete(':id')
  @RequirePermission('schedules:write')
  @ApiOperation({ summary: 'Delete class schedule' })
  async delete(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ToolResult<void>> {
    const context = {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `delete_${Date.now()}`,
    };
    return this.service.delete(context, id);
  }
}