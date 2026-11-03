import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateMembershipDto {
  @IsOptional() @IsString() @Length(1, 140) member_id?: string;
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(1, 160) plan_name?: string;
  @IsOptional() @IsString() plan_type?: string;
  @IsOptional() @IsString() planType?: string;
  @IsOptional() @IsDateString() start_date?: string;
  @IsOptional() @IsDateString() end_date?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceINR?: number;
  @IsOptional() session_limit?: number | string;
  @IsOptional() sessionLimit?: number | string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() auto_renew?: boolean;
  @IsOptional() @IsString() benefits?: string;
  @IsOptional() @IsString() description?: string;
}
