import { Injectable, NotFoundException } from '@nestjs/common';
import { ErpBaseService, ToolContext, ToolResult } from '../../common/erp-base.service';
import { CreateStaffDto, UpdateStaffDto, StaffResponseDto } from './dto';
import { ERP_METHODS } from '@wsos/erp-methods';

@Injectable()
export class StaffService extends ErpBaseService {
  async create(context: ToolContext, dto: CreateStaffDto): Promise<ToolResult<StaffResponseDto>> {
    const result = await this.callErp<StaffResponseDto>(context, ERP_METHODS.STAFF_CREATE, dto);
    if (!result.success) return result;
    return this.success(result.data as StaffResponseDto);
  }

  async findAll(context: ToolContext, role?: string): Promise<ToolResult<StaffResponseDto[]>> {
    const result = await this.callErp<{ staff: StaffResponseDto[] }>(context, ERP_METHODS.STAFF_LIST, { role });
    if (!result.success) return result as unknown as ToolResult<StaffResponseDto[]>;
    const data = result.data?.staff || [];
    return this.success(data);
  }

  async findOne(context: ToolContext, id: string): Promise<ToolResult<StaffResponseDto>> {
    const result = await this.callErp<StaffResponseDto>(context, ERP_METHODS.STAFF_GET, { id });
    if (!result.success) {
      if (result.error?.includes('404')) throw new NotFoundException(`Staff ${id} not found`);
      return result;
    }
    return result;
  }

  async update(context: ToolContext, id: string, dto: UpdateStaffDto): Promise<ToolResult<StaffResponseDto>> {
    const result = await this.callErp<StaffResponseDto>(context, ERP_METHODS.STAFF_UPDATE, { id, ...dto });
    if (!result.success) return result;
    return this.success(result.data as StaffResponseDto);
  }

  async delete(context: ToolContext, id: string): Promise<ToolResult<void>> {
    const result = await this.callErp<Record<string, unknown>>(context, ERP_METHODS.STAFF_DELETE, { id });
    if (!result.success) return result as unknown as ToolResult<void>;
    return this.success(undefined);
  }
}