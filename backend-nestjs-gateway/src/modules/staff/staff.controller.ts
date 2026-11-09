import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffDto, StaffResponseDto } from './dto';
import { ToolResult } from '../../common/erp-base.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Staff')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(AuthGuard, PermissionGuard)
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Post()
  @RequirePermission('staff:write')
  @ApiOperation({ summary: 'Create a new staff member' })
  async create(
    @Body() dto: CreateStaffDto,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `staff_${Date.now()}`,
    };
    return this.service.create(context, dto);
  }

  @Get()
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'List staff with optional role filter' })
  async findAll(
    @Request() req: any,
    @Query('role') role?: string,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `list_${Date.now()}`,
    };
    return this.service.findAll(context, role);
  }

  @Get(':id')
  @RequirePermission('staff:read')
  @ApiOperation({ summary: 'Get staff by ID' })
  async findOne(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `get_${Date.now()}`,
    };
    return this.service.findOne(context, id);
  }

  @Patch(':id')
  @RequirePermission('staff:write')
  @ApiOperation({ summary: 'Update staff' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Request() req: any,
  ): Promise<any> {
    const context = {
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `update_${Date.now()}`,
    };
    return this.service.update(context, id, dto);
  }

  @Delete(':id')
  @RequirePermission('staff:write')
  @ApiOperation({ summary: 'Delete staff' })
  async delete(
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<ToolResult<void>> {
    const context = {
      tenantId: req.user.tenantId,
      tenantCode: req.user.tenantCode,
      userId: req.user.id,
      role: req.user.role,
      correlationId: `delete_${Date.now()}`,
    };
    return this.service.delete(context, id);
  }
}