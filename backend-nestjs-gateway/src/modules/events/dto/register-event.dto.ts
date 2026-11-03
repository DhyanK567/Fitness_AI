import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class RegisterEventDto {
  @IsString() @Length(1, 140) registrant_name!: string;
  @IsOptional() @IsString() @Length(1, 140) member_id?: string;
  @IsOptional() @IsPhoneNumber() registrant_phone?: string;
  @IsOptional() @IsEmail() registrant_email?: string;
}
