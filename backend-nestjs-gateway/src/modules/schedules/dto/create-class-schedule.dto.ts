import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';

export class CreateClassScheduleDto {
  @ApiProperty({ example: 'CLS-00001' })
  @IsString()
  class_id: string;

  @ApiProperty({ enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], example: 'Mon' })
  @IsEnum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  day_of_week: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

  @ApiProperty({ example: '06:00' })
  @IsString()
  start_time: string;

  @ApiProperty({ example: '07:00' })
  @IsString()
  end_time: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  [key: string]: unknown;
}

export class UpdateClassScheduleDto {
  @ApiPropertyOptional({ enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] })
  @IsOptional()
  @IsEnum(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  day_of_week?: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  start_time?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  end_time?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  [key: string]: unknown;
}

export class ClassScheduleResponseDto {
  @ApiProperty({ example: 'SCH-00001' })
  id: string;

  @ApiProperty()
  class_id: string;

  @ApiProperty()
  day_of_week: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

  @ApiProperty()
  start_time: string;

  @ApiProperty()
  end_time: string;

  @ApiProperty()
  capacity: number;

  [key: string]: unknown;
}