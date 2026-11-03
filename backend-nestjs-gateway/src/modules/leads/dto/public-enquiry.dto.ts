import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class PublicEnquiryDto {
  @IsString() @Length(1, 140) full_name!: string;
  @IsPhoneNumber() phone!: string;
  @IsOptional() @IsEmail() email?: string;
}
