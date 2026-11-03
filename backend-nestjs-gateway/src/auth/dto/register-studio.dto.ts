import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterStudioDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  studio_name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  owner_name!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  owner_email!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value)
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/)
  @MaxLength(20)
  owner_phone?: string;

  @Transform(({ value }) => typeof value === 'string' ? value : value)
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(['Basic', 'Premium', 'Ultra Premium'])
  subscription_plan?: 'Basic' | 'Premium' | 'Ultra Premium';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postal_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  payment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  order_id?: string;
}
