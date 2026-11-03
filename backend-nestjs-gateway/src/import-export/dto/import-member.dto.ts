import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';

export class ImportMemberDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Length(1, 140)
  name!: string;

  @IsEmail()
  @Length(1, 140)
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  phone?: string | null;

  @IsOptional()
  @IsIn(['Basic', 'Premium', 'Ultra Premium'])
  plan?: string;

  @IsOptional()
  @IsIn(['Active', 'Review', 'Paused', 'Frozen', 'Inactive'])
  status?: string;

  @IsOptional()
  @IsString()
  joined?: string;

  @IsOptional()
  @IsString()
  expiry?: string;

  @IsOptional()
  @IsString()
  @Length(0, 140)
  coach?: string | null;
}
