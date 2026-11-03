import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportClassDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 140)
  name!: string;

  @IsOptional()
  @IsIn([
    'Pilates',
    'Strength',
    'Yoga',
    'HIIT',
    'Wellness',
    'Mobility',
    'Recovery',
    'Cardio',
  ])
  category?: string;

  @IsString()
  date!: string;

  @IsString()
  @Length(1, 10)
  startTime!: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  endTime?: string | null;

  @IsString()
  @Length(1, 140)
  trainer!: string;

  @IsOptional()
  @IsString()
  @Length(0, 140)
  room?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  capacity?: number;

  @IsOptional()
  @IsIn(['Scheduled', 'Cancelled'])
  status?: string;
}
