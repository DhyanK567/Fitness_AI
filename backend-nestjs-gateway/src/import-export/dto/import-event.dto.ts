import {
  IsDateString,
  IsOptional,
  IsString,
  IsInt,
  IsPositive,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportEventDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsString()
  @IsOptional()
  venue?: string;

  @IsString()
  @IsOptional()
  organizer?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100000)
  @IsOptional()
  capacity?: number;
}
