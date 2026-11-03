import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreatePublicEnquirySessionDto {
  @IsNotEmpty({ message: 'captcha_token is required' })
  @IsString({ message: 'captcha_token must be a string' })
  captcha_token!: string;

  @IsOptional()
  @IsString({ message: 'page_context must be a string' })
  page_context?: string;
}

export class PostPublicEnquiryMessageDto {
  @IsNotEmpty({ message: 'message cannot be empty' })
  @IsString({ message: 'message must be a string' })
  @MaxLength(1000, { message: 'message cannot exceed 1000 characters' })
  message!: string;
}

export class PublicEnquiryConsentDto {
  @IsBoolean({ message: 'whatsapp consent must be a boolean' })
  whatsapp!: boolean;
}

export class CreatePublicEnquiryLeadDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @MaxLength(120, { message: 'name cannot exceed 120 characters' })
  name!: string;

  @IsNotEmpty({ message: 'phone is required' })
  @IsString({ message: 'phone must be a string' })
  phone!: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsNotEmpty({ message: 'consent is required' })
  @IsObject({ message: 'consent must be an object' })
  @ValidateNested()
  @Type(() => PublicEnquiryConsentDto)
  consent!: PublicEnquiryConsentDto;

  @IsOptional()
  @IsString({ message: 'interest must be a string' })
  @MaxLength(200, { message: 'interest cannot exceed 200 characters' })
  interest?: string;
}

export class PublicEnquiryHandoffDto {
  @IsOptional()
  @IsString({ message: 'reason must be a string' })
  reason?: string;

  @IsOptional()
  @IsString({ message: 'contact must be a string' })
  contact?: string;
}
