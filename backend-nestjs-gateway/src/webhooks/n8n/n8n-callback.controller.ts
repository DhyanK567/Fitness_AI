import { Controller, Post, Body, RawBodyRequest, Req, Header, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('Webhooks')
@Controller('webhooks/n8n')
@UseGuards(AuthGuard, PermissionGuard)
export class N8nCallbackController {
  @Post('callback')
  @RequirePermission('webhooks:write')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'n8n workflow callback' })
  async callback(
    @Body() body: any,
    @Req() req: any,
  ) {
    // n8n workflow callback handler
    return { success: true, message: 'Callback received' };
  }
}