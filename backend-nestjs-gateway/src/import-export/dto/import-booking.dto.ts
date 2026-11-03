import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ImportBookingDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @IsOptional()
  classId?: string;

  @IsString()
  @IsOptional()
  memberId?: string;

  @IsOptional()
  @IsEnum(['Confirmed', 'Waitlisted', 'Cancelled'])
  status?: string;

  @IsDateString()
  @IsOptional()
  bookedAt?: string;
}
