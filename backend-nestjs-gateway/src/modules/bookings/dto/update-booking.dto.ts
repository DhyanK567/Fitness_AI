import { IsIn } from 'class-validator';

export class UpdateBookingDto {
  @IsIn(['confirmed', 'cancelled', 'Confirmed', 'Cancelled', 'waitlist', 'Waitlist', 'attended', 'Attended']) status!: string;
}
