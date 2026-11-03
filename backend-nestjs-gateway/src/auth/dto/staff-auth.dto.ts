import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength, ValidateIf } from 'class-validator';

const STAFF_ROLES = ['owner', 'admin', 'front_desk', 'trainer'] as const;

export class StaffLoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @ValidateIf((input) => !input.mfa_ticket)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((input) => !input.mfa_ticket)
  @IsString()
  @Length(1, 128)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mfa_ticket?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  totp_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  recovery_code?: string;
}

export class InviteStaffDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 160)
  displayName!: string;

  @IsIn(STAFF_ROLES)
  roleCode!: typeof STAFF_ROLES[number];
}

export class ResetStaffPasswordDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
