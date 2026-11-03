import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEmail, IsPhoneNumber, IsDateString, IsEnum, IsOptional, IsUUID, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(1)
  full_name: string;

  @ApiProperty({ example: 'john@studio.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '9876543210' })
  @IsPhoneNumber('IN')
  phone: string;

  @ApiProperty({ example: '1990-05-15' })
  @IsDateString()
  date_of_birth: string;

  @ApiProperty({ enum: ['trainer', 'front_desk', 'admin', 'manager'], example: 'trainer' })
  @IsEnum(['trainer', 'front_desk', 'admin', 'manager'])
  role: 'trainer' | 'front_desk' | 'admin' | 'manager';

  @ApiPropertyOptional({ example: 'STUDIO-001' })
  @IsOptional()
  @IsUUID()
  studio_id?: string;

  @ApiPropertyOptional({ example: 'BRANCH-001' })
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  hire_date: string;

  [key: string]: unknown;
}

export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  full_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsPhoneNumber('IN')
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @ApiPropertyOptional({ enum: ['trainer', 'front_desk', 'admin', 'manager'] })
  @IsOptional()
  @IsEnum(['trainer', 'front_desk', 'admin', 'manager'])
  role?: 'trainer' | 'front_desk' | 'admin' | 'manager';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  studio_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  hire_date?: string;

  [key: string]: unknown;
}

export class StaffResponseDto {
  @ApiProperty({ example: 'STF-00001' })
  id: string;

  @ApiProperty()
  full_name: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty()
  date_of_birth: string;

  @ApiProperty()
  role: 'trainer' | 'front_desk' | 'admin' | 'manager';

  @ApiPropertyOptional()
  studio_id?: string | null;

  @ApiPropertyOptional()
  branch_id?: string | null;

  @ApiProperty()
  hire_date: string;

  @ApiProperty()
  status: string;

  [key: string]: unknown;
}