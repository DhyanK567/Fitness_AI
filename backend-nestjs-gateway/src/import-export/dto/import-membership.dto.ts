import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ImportMembershipDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsIn(['Monthly', 'Quarterly', 'Annual', 'Half-Yearly', 'Drop-in', 'Lifetime'])
  @IsOptional()
  planType?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @IsOptional()
  priceINR?: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Min(1)
  @Max(100000)
  @IsOptional()
  sessionLimit?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 'active', '1', 'yes'].includes(normalized)) return true;
      if (['false', 'inactive', '0', 'no'].includes(normalized)) return false;
    }
    return value;
  })
  @IsBoolean()
  active?: boolean;
}
