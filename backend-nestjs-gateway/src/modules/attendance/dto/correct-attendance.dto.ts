import { IsIn, IsString, Length } from 'class-validator';

export class CorrectAttendanceDto {
  @IsIn(['present', 'absent', 'late', 'Present', 'Absent', 'Late']) status!: string;
  @IsString() @Length(1, 1000) reason!: string;
}
