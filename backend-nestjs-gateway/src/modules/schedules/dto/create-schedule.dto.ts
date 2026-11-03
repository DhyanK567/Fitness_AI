import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsDateString, IsOptional, IsInt, IsEnum, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateScheduleDto {
  @ApiProperty({ example: 'CLS-00001' })
  @IsString()
  class_id: string;

  @ApiProperty({ example: '2026-09-20T09:00:00Z' })
  @IsDateString()
  start_time: string;

  @ApiProperty({ example: '2026-09-20T10:00:00Z' })
  @IsDateString()
  end_time: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  [key: string]: unknown;
}

export class UpdateScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  start_time?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  end_time?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({ enum: ['scheduled', 'cancelled', 'completed'] })
  @IsOptional()
  @IsEnum(['scheduled', 'cancelled', 'completed'])
  status?: 'scheduled' | 'cancelled' | 'completed';

  [key: string]: unknown;
}

export class ScheduleResponseDto {
  @ApiProperty({ example: 'SCH-00001' })
  id: string;

  @ApiProperty()
  class_id: string;

  @ApiProperty()
  start_time: string;

  @ApiProperty()
  end_time: string;

  @ApiProperty()
  capacity: number;

  @ApiProperty()
  status: 'scheduled' | 'cancelled' | 'completed';

  [key: string]: unknown;
}