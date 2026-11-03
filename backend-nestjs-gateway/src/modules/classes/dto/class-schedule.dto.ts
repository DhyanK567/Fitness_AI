import { IsIn, Matches } from 'class-validator';

export class ClassScheduleDto {
  @IsIn(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) day_of_week!: string;
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) start_time!: string;
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/) end_time!: string;
}
