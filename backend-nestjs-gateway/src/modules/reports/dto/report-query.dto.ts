import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';

export class ReportQueryDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly', 'yearly'], example: 'monthly' })
  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly', 'yearly'])
  period?: 'daily' | 'weekly' | 'monthly' | 'yearly';

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ example: 12, default: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  periods?: number;

  [key: string]: unknown;
}

export class RevenueReportDto {
  total_revenue: number;
  period_revenue: number;
  transaction_count: number;
  average_transaction: number;
  period_start: string;
  period_end: string;
  currency: string;

  [key: string]: unknown;
}

export class AttendanceReportDto {
  class_id: string;
  class_name: string;
  total_sessions: number;
  total_attendance: number;
  average_attendance_rate: number;

  [key: string]: unknown;
}

export class MembershipReportDto {
  active_memberships: number;
  expiring_this_week: number;
  expiring_this_month: number;
  cancelled_this_month: number;
  new_memberships_this_month: number;
  total_revenue: number;

  [key: string]: unknown;
}

export class DashboardStatsDto {
  total_members: number;
  active_memberships: number;
  expiring_this_week: number;
  bookings_today: number;
  revenue_this_month: number;
  average_attendance_rate: number;
  top_classes: Array<{ id: string; name: string; attendance_rate: number }>;
  recent_payments: Array<{ id: string; member: string; amount: number; date: string }>;
  recent_leads: Array<{ id: string; name: string; source: string; date: string }>;

  [key: string]: unknown;
}