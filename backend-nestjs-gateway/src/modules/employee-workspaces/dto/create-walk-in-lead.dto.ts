import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateWalkInLeadDto {
  @IsString()
  @Length(2, 160)
  full_name!: string;

  @Matches(/^(?:\+91[-\s]?)?[6-9]\d{9}$/, {
    message: 'phone must be a valid 10-digit Indian mobile number',
  })
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(0, 40)
  plan?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;
}
