import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TenantContextGuard } from '../common/tenant-context.guard';
import { StaffAccessGuard } from '../common/staff-access.guard';
import { RequirePermission } from '../common/permission.decorator';
import type { RequestWithContext } from '../common/request-context.types';
import { AcceptTeamInvitationDto, CreateTeamInvitationDto, InvitationTokenDto } from './dto/team-invitation.dto';
import { TeamInvitationsService } from './team-invitations.service';

@Controller('auth/staff/invitations')
export class TeamInvitationsController {
  constructor(private readonly invitations: TeamInvitationsService) {}

  @Post()
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('staff:write')
  create(@Req() request: RequestWithContext, @Body() body: CreateTeamInvitationDto) {
    return this.invitations.create(request.tenantId as string, body, request.auth?.roles ?? []);
  }

  @Get()
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('staff:read')
  list(@Req() request: RequestWithContext) {
    return this.invitations.list(request.tenantId as string);
  }

  @Get('validate')
  validate(@Query() query: InvitationTokenDto) {
    return this.invitations.validate(query.token);
  }

  @Post('enroll')
  @HttpCode(200)
  enroll(@Body() body: InvitationTokenDto) {
    return this.invitations.enroll(body.token);
  }

  @Post('accept')
  @HttpCode(200)
  async accept(@Body() body: AcceptTeamInvitationDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.invitations.accept(body.token, body.password, body.totp_code);
    const secure = process.env.NODE_ENV === 'production';
    response.cookie('ws_staff_token', result.access_token, { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: result.expires_in * 1000 });
    response.cookie('ws_staff_refresh', result.refresh_token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 30 * 24 * 60 * 60 * 1000 });
    return result;
  }

  @Delete(':id')
  @UseGuards(TenantContextGuard, StaffAccessGuard)
  @RequirePermission('staff:write')
  revoke(@Req() request: RequestWithContext, @Param('id') invitationId: string) {
    return this.invitations.revoke(request.tenantId as string, invitationId);
  }
}
