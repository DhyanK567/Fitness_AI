import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Optional } from '@nestjs/common';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class StaffLoginDto {
  @ApiProperty({ example: 'owner@acme.fitness' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Correct-Horse-Battery-Staple-9' })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiPropertyOptional({ description: 'TOTP code when MFA is enrolled', example: '123456' })
  @IsOptional()
  @IsString()
  totp_code?: string;

  @ApiPropertyOptional({ description: 'Single-use recovery code (alternative to totp_code)', example: 'ABCDE-12345' })
  @IsOptional()
  @IsString()
  recovery_code?: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Opaque refresh token from a prior login/refresh' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class LogoutDto extends RefreshTokenDto {}

export class InviteStaffDto {
  @ApiProperty({ example: 'frontdesk@acme.fitness' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Priya Front Desk' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName: string;

  @ApiProperty({ enum: ['owner', 'admin', 'front_desk', 'trainer', 'member', 'visitor'], example: 'front_desk' })
  @IsIn(['owner', 'admin', 'front_desk', 'trainer', 'member', 'visitor'])
  roleCode: string;
}

export class MemberSignupDto {
  @ApiProperty({ example: 'member@acme.fitness' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'New-Member-Password-9' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'member@acme.fitness' })
  @IsEmail()
  confirmEmail: string;

  @ApiProperty({ example: 'consent' })
  @IsString()
  @MinLength(1)
  consent: string;
}

export class MemberOtpRequestDto {
  @ApiProperty({ example: 'member@acme.fitness' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'consent' })
  @IsString()
  @MinLength(1)
  consent: string;
}

export class MemberOtpVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class AuthMeDto {
  @ApiProperty({ example: '11111111-1111-4111-8111-111111111111' })
  id: string;

  @ApiProperty({ example: 'member@acme.fitness' })
  email: string;

  @ApiProperty({ enum: ['member', 'visitor', 'front_desk', 'trainer', 'admin', 'owner'], example: 'member' })
  userType: string;

  @ApiProperty({ enum: ['none', 'read', 'write', 'admin'], example: 'none' })
  role: string;
}

export class AuthMePatchDto {
  @ApiProperty({ example: 'newname' })
  @IsString()
  @Optional()
  name?: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'user@acme.fitness' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'token-abc123' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'New-Secure-Password-9' })
  @IsString()
  @MinLength(12)
  password: string;
}

export class TotpVerifyDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}