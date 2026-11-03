import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../common/request-context.types';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { ConfigurationService } from './configuration.service';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';
import { UpsertSettingDto } from './dto/setting.dto';
import { SettingReadGuard } from './setting-read.guard';

@Controller('settings')
@UseGuards(TenantContextGuard)
export class ConfigurationController {
  constructor(private readonly service: ConfigurationService) {}

  @Get()
  @UseGuards(StaffAccessGuard)
  @RequirePermission('settings:read')
  list(@Req() request: RequestWithContext) {
    return this.service.list(request.tenantId as string);
  }

  @Get(':key')
  @UseGuards(SettingReadGuard)
  @RequirePermission('settings:read')
  get(@Req() request: RequestWithContext, @Param('key') key: string) {
    return this.service.get(request.tenantId as string, key);
  }

  @Put(':key')
  @UseGuards(StaffAccessGuard)
  @RequirePermission('settings:write')
  upsert(
    @Req() request: RequestWithContext,
    @Param('key') key: string,
    @Body() body: UpsertSettingDto,
  ) {
    return this.service.upsert(
      request.tenantId as string,
      key,
      body.value,
      request.auth?.userId as string,
      request.correlationId as string,
    );
  }
}
