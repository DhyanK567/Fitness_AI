import { IsDateString, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

/** Fields a signed-in member may edit; identity, status and membership are server-owned. */
export class UpdateMemberProfileDto {
  @IsOptional() @IsString() @Length(1, 140) full_name?: string;
  @IsOptional() @IsEmail() @Length(1, 140) email?: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsIn(['male', 'female', 'other', 'prefer not to say']) gender?: string;
  @IsOptional() @IsString() @Length(0, 2048) profile_photo_url?: string | null;
  @IsOptional() @IsString() @Length(0, 32) emergency_contact?: string;
}
