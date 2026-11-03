import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';

export class RequestMemberOtpDto {
  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value)
  @Matches(/^\+[1-9][0-9]{7,14}$/)
  phone!: string;

  @IsIn(['login', 'register', 'link', 'complete_account'])
  purpose!: 'login' | 'register' | 'link' | 'complete_account';
}

export class VerifyMemberOtpDto {
  @IsUUID()
  challenge_id!: string;

  @Matches(/^[0-9]{6}$/)
  otp!: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 160)
  full_name?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class MemberRegisterDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value)
  @Matches(/^\+?[1-9][0-9]{7,14}$/)
  phone!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(8, 128)
  confirmPassword!: string;
}

export class MemberLoginDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class CompleteMemberAccountDto {
  @IsUUID()
  challenge_id!: string;

  @Matches(/^[0-9]{6}$/)
  otp!: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(8, 128)
  confirmPassword!: string;
}
