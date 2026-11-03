import { IsDateString, IsEmail, IsIn, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class CreateMemberDto {
  @IsString() @Length(1, 140) full_name!: string;
  @IsEmail() @Length(1, 140) email!: string;
  @IsString() @Length(4, 25) phone!: string;
  @IsDateString() date_of_birth!: string;
  @IsIn(['male', 'female', 'other']) gender!: string;
  @IsDateString() join_date!: string;
  @IsString() @Length(1, 40) status!: string;
  @IsOptional() @IsString() @Length(0, 140) membership_id?: string | null;
  @IsOptional() @IsString() @Length(0, 2048) profile_photo_url?: string | null;
  @IsString() @Length(4, 25) emergency_contact!: string;
}
