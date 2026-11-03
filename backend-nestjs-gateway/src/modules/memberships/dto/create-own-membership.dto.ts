import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsString, Length, Max, Min } from 'class-validator';

/** Membership selection for B2C; the authenticated account supplies member_id. */
export class CreateOwnMembershipDto {
  @IsString() @Length(1, 140) plan_name!: string;
  @IsIn(['monthly', 'quarterly', 'annual']) plan_type!: string;
  @IsDateString() start_date!: string;
  @IsDateString() end_date!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) price!: number;
  @IsBoolean() auto_renew!: boolean;
}
