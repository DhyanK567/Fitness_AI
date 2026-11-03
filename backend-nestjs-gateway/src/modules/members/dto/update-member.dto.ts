import { IsDateString, IsEmail, IsIn, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class UpdateMemberDto {
  @IsOptional() @IsString() @Length(1, 140) full_name?: string;
  @IsOptional() @IsEmail() @Length(1, 140) email?: string;
  @IsOptional() @IsString() @Length(4, 25) phone?: string;
  @IsOptional() @IsDateString() date_of_birth?: string;
  @IsOptional() @IsIn(['male', 'female', 'other']) gender?: string;
  @IsOptional() @IsDateString() join_date?: string;
  @IsOptional() @IsString() @Length(1, 40) status?: string;
  @IsOptional() @IsString() @Length(0, 140) membership_id?: string | null;
  @IsOptional() @IsString() @Length(0, 2048) profile_photo_url?: string | null;
  @IsOptional() @IsString() @Length(4, 25) emergency_contact?: string;
}
