import { Injectable, NotFoundException } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { CreateClassScheduleDto, UpdateClassScheduleDto, ClassScheduleResponseDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

@Injectable()
export class SchedulesService extends ErpBaseService {
  async create(context: ToolContext, dto: CreateClassScheduleDto): Promise<ToolResult<ClassScheduleResponseDto>> {
    const result = await this.callErp<ClassScheduleResponseDto>(context, ERP_METHODS.CLASS_SCHEDULE_CREATE, dto);
    if (!result.success) return result;
    return this.success(result.data as ClassScheduleResponseDto);
  }

  async findAll(context: ToolContext, classId?: string): Promise<ToolResult<ClassScheduleResponseDto[]>> {
    const result = await this.callErp<{ schedules: ClassScheduleResponseDto[] }>(context, ERP_METHODS.CLASS_SCHEDULE_LIST, { class_id: classId });
    if (!result.success) return result as unknown as ToolResult<ClassScheduleResponseDto[]>;
    const data = result.data?.schedules || [];
    return this.success(data);
  }

  async findOne(context: ToolContext, id: string): Promise<ToolResult<ClassScheduleResponseDto>> {
    const result = await this.callErp<ClassScheduleResponseDto>(context, ERP_METHODS.CLASS_SCHEDULE_GET, { id });
    if (!result.success) {
      if (result.error?.includes('404')) throw new NotFoundException(`Class schedule ${id} not found`);
      return result;
    }
    return result;
  }

  async update(context: ToolContext, id: string, dto: UpdateClassScheduleDto): Promise<ToolResult<ClassScheduleResponseDto>> {
    const result = await this.callErp<ClassScheduleResponseDto>(context, ERP_METHODS.CLASS_SCHEDULE_UPDATE, { id, ...dto });
    if (!result.success) return result;
    return this.success(result.data as ClassScheduleResponseDto);
  }

  async delete(context: ToolContext, id: string): Promise<ToolResult<void>> {
    const result = await this.callErp<Record<string, unknown>>(context, ERP_METHODS.CLASS_SCHEDULE_DELETE, { id });
    if (!result.success) return result as unknown as ToolResult<void>;
    return this.success(undefined);
  }
}