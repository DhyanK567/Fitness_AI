import { IsEmail, IsIn, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(1, 140) full_name?: string;
  @IsOptional() @IsString() @Length(4, 25) phone?: string;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() stage?: string;
  @IsOptional() @IsString() plan?: string | null;
  @IsOptional() @IsString() follow_up_date?: string | null;
  @IsOptional() @IsString() assigned_to?: string | null;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string | null;
}
