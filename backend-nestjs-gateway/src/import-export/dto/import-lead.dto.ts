import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class ImportLeadDto {
  @IsString()
  @Length(1, 140)
  name!: string;

  @IsOptional()
  @IsEmail()
  @Length(1, 140)
  email?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string | null;

  @IsOptional()
  @IsIn([
    'Instagram',
    'Walk-in',
    'Website enquiry',
    'Referral',
    'Google Search',
    'Facebook',
    'Corporate',
  ])
  source?: string;

  @IsOptional()
  @IsIn([
    'New enquiry',
    'Trial booked',
    'Trial completed',
    'Follow-up',
    'Converted',
  ])
  stage?: string;

  @IsOptional()
  @IsString()
  followUpDate?: string;

  @IsOptional()
  @IsString()
  @Length(0, 140)
  assigned?: string | null;

  @IsOptional()
  @IsIn(['Basic', 'Premium', 'Ultra Premium'])
  plan?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string | null;
}
