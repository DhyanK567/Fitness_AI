import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { RequestWithContext } from '../../common/request-context.types';
import { RequirePermission } from '../../common/permission.decorator';
import { TenantContextGuard } from '../../common/tenant-context.guard';
import { AttendanceService } from './attendance.service';
import { ATTENDANCE_PERMISSIONS } from './attendance.policy';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CorrectAttendanceDto } from './dto/correct-attendance.dto';
import { MemberOrStaffAccessGuard } from '../bookings/booking-access.guard';

@Controller('attendance')
@UseGuards(TenantContextGuard, MemberOrStaffAccessGuard)
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}
  @Get() @RequirePermission(ATTENDANCE_PERMISSIONS.read) list(@Req() req: RequestWithContext) { return this.attendance.list(this.context(req)); }
  @Get('member/:memberId') @RequirePermission(ATTENDANCE_PERMISSIONS.read) listForMember(@Req() req: RequestWithContext, @Param('memberId') memberId: string) {
    if (req.auth?.memberRef && req.auth.memberRef !== memberId) throw new ForbiddenException('Members can only view their own attendance');
    return this.attendance.list({ ...this.context(req), memberRef: req.auth?.memberRef ?? memberId });
  }
  @Get('class/:classId') @RequirePermission(ATTENDANCE_PERMISSIONS.read) listForClass(@Req() req: RequestWithContext, @Param('classId') classId: string) {
    if (req.auth?.memberRef) throw new ForbiddenException('Members cannot list attendance for a class');
    return this.attendance.listForClass(this.context(req), classId);
  }
  @Post('check-in') @RequirePermission(ATTENDANCE_PERMISSIONS.write) checkIn(@Req() req: RequestWithContext, @Body() dto: RecordAttendanceDto) { return this.attendance.record(this.context(req), dto.booking_id, req.auth?.memberRef ? 'QR Scan' : dto.attendance_method ?? 'Front Desk', req.auth!.userId); }
  @Post() @RequirePermission(ATTENDANCE_PERMISSIONS.write) record(@Req() req: RequestWithContext, @Body() dto: RecordAttendanceDto) { return this.attendance.record(this.context(req), dto.booking_id, req.auth?.memberRef ? 'QR Scan' : dto.attendance_method ?? 'Trainer Marked', req.auth!.userId, dto.status); }
  @Get(':id') @RequirePermission(ATTENDANCE_PERMISSIONS.read) get(@Req() req: RequestWithContext, @Param('id') id: string) { return this.attendance.get(this.context(req), id); }
  @Put(':id') @RequirePermission(ATTENDANCE_PERMISSIONS.write) correct(@Req() req: RequestWithContext, @Param('id') id: string, @Body() dto: CorrectAttendanceDto) { if (req.auth?.memberRef) throw new ForbiddenException('Members cannot correct attendance records'); return this.attendance.correct(this.context(req), id, dto.status, dto.reason, req.auth!.userId); }
  @Delete(':id') @RequirePermission(ATTENDANCE_PERMISSIONS.write) remove() { return this.attendance.remove(); }
  private context(req: RequestWithContext) { return { tenantId: req.tenantId as string, tenantCode: req.tenantCode as string, correlationId: req.correlationId as string, memberRef: req.auth?.memberRef, actorId: req.auth?.userId, roles: req.auth?.roles ?? [] }; }
}
