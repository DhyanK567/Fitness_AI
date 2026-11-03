import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class PublicRegisterEventDto {
  @IsString() @Length(1, 140) registrant_name!: string;
  @IsOptional() @IsPhoneNumber() registrant_phone?: string;
  @IsOptional() @IsEmail() registrant_email?: string;
}
