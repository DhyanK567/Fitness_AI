import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RecordAttendanceDto {
  @IsString() @Length(1, 140) booking_id!: string;
  @IsOptional() @IsString() attendance_method?: string;
  @IsOptional() @IsIn(['present', 'absent', 'late', 'Present', 'Absent', 'Late']) status?: string;
}
