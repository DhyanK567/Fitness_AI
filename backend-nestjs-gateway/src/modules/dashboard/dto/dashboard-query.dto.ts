import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString, IsEnum, IsInt, Min, Max } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: ['daily', 'weekly', 'monthly'], example: 'monthly' })
  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly'])
  period?: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

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