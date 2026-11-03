import { IsIn, IsOptional, Matches } from 'class-validator';

export class UpdateClassScheduleDto {
  @IsOptional() @IsIn(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) day_of_week?: string;
  @IsOptional() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) start_time?: string;
  @IsOptional() @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) end_time?: string;
}
