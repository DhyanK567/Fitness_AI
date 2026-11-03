import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type ExportDataset =
  | 'members'
  | 'leads'
  | 'classes'
  | 'memberships'
  | 'bookings'
  | 'attendance'
  | 'payments'
  | 'events';

export class ExportQueryDto {
  @IsOptional()
  @IsIn(['members', 'leads', 'classes', 'memberships', 'bookings', 'attendance', 'payments', 'events'])
  dataset!: ExportDataset;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn(['json', 'csv', 'xlsx'])
  format?: string;
}
