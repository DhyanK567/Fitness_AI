import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class ImportAttendanceDto {
  @IsString()
  @IsOptional()
  bookingId?: string;

  @IsOptional()
  @IsEnum(['Present', 'Late', 'Absent'])
  status?: string;

  @IsDateString()
  @IsOptional()
  checkedInAt?: string;
}
