import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';

export class CreateAttendanceDto {
  @ApiProperty({ example: 'BKG-00001' })
  @IsString()
  booking_id: string;

  @ApiProperty({ enum: ['present', 'absent'], example: 'present' })
  @IsEnum(['present', 'absent'])
  status: 'present' | 'absent';

  @ApiPropertyOptional({ example: '2026-09-20T18:02:00Z' })
  @IsOptional()
  @IsDateString()
  check_in_time?: string | null;

  @ApiPropertyOptional({ example: '2026-09-20T19:00:00Z' })
  @IsOptional()
  @IsDateString()
  check_out_time?: string | null;

  [key: string]: unknown;
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  check_in_time?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  check_out_time?: string | null;

  @ApiPropertyOptional({ enum: ['present', 'absent'] })
  @IsOptional()
  @IsEnum(['present', 'absent'])
  status?: 'present' | 'absent';

  [key: string]: unknown;
}

export class AttendanceResponseDto {
  @ApiProperty({ example: 'ATT-00001' })
  id: string;

  @ApiProperty()
  booking_id: string;

  @ApiPropertyOptional()
  check_in_time?: string | null;

  @ApiPropertyOptional()
  check_out_time?: string | null;

  @ApiProperty()
  status: 'present' | 'absent';

  [key: string]: unknown;
}