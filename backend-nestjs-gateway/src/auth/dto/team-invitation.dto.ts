import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Length, Matches, MaxLength } from 'class-validator';

export const TEAM_ROLES = ['front_desk', 'staff', 'trainer', 'admin', 'coach', 'lead_trainer', 'biller', 'accountant'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;
const INVITATION_TOKEN = /^[a-f0-9]{64}$/i;

export class CreateTeamInvitationDto {
  @IsString()
  @Length(2, 160)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  full_name!: string;

  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email!: string;

  @IsString()
  @Matches(INDIAN_MOBILE, { message: 'phone must be a valid Indian mobile number' })
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const digits = value.replace(/\D/g, '');
    const national = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    return national.length === 10 ? `+91${national}` : value;
  })
  phone!: string;

  @IsIn(TEAM_ROLES)
  role!: TeamRole;
}

export class InvitationTokenDto {
  @IsString()
  @Matches(INVITATION_TOKEN, { message: 'token is malformed' })
  token!: string;
}

export class AcceptTeamInvitationDto extends InvitationTokenDto {
  @IsString()
  @Length(10, 128)
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'totp_code must contain exactly 6 digits' })
  totp_code!: string;
}
