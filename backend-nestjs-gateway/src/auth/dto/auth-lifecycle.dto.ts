import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterStudioDto {
  @Transform(({ obj, value }) => {
    const val = value ?? obj?.studioName;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @Length(2, 120)
  studio_name!: string;

  @Transform(({ obj, value }) => {
    const val = value ?? obj?.tenantCode;
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}$/, {
    message: 'Tenant code must be 2-39 alphanumeric/hyphen characters and start with alphanumeric',
  })
  tenant_code!: string;

  @Transform(({ obj, value }) => {
    const val = value ?? obj?.ownerName;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @Length(2, 160)
  owner_name!: string;

  @Transform(({ obj, value }) => {
    const val = value ?? obj?.ownerEmail;
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
  })
  @IsEmail()
  @MaxLength(254)
  owner_email!: string;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const val = value ?? obj?.ownerPhone;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Invalid owner phone format (expected 10-15 digits)',
  })
  owner_phone?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class VerifyOwnerEmailDto {
  @Transform(({ obj, value }) => {
    const val = value ?? obj?.tenantId;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'tenant_id must be a canonical UUID',
  })
  tenant_id!: string;

  @Transform(({ obj, value }) => {
    const val = value ?? obj?.rawToken;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  token!: string;
}

export class ResendVerificationEmailDto {
  @IsOptional()
  @Transform(({ obj, value }) => {
    const val = value ?? obj?.tenantId;
    return typeof val === 'string' ? val.trim() : val;
  })
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'tenant_id must be a canonical UUID',
  })
  tenant_id?: string;

  @IsOptional()
  @Transform(({ obj, value }) => {
    const val = value ?? obj?.tenantCode;
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,38}$/, {
    message: 'Tenant code must be 2-39 alphanumeric/hyphen characters and start with alphanumeric',
  })
  tenant_code?: string;

  @Transform(({ obj, value }) => {
    const val = value ?? obj?.email ?? obj?.owner_email ?? obj?.ownerEmail;
    return typeof val === 'string' ? val.trim().toLowerCase() : val;
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class AcceptStaffInviteDto {
  @IsString()
  @MinLength(32)
  invite_token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 160)
  full_name!: string;
}

export class ForgotPasswordDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class CompletePasswordResetDto {
  @IsString()
  @MinLength(32)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  new_password!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(32)
  refresh_token!: string;
}

export class LogoutDto extends RefreshTokenDto {
  @IsOptional()
  @IsBoolean()
  all_sessions?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  current_password!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  new_password!: string;
}
