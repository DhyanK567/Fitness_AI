import { IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class CreateBookingDto {
  @IsOptional() @IsString() @Length(1, 140) member_id?: string;
  @IsString() @Length(1, 140) class_schedule_id!: string;
  @IsDateString({ strict: true }) booking_date!: string;
  @IsOptional() @IsString() @Length(1, 140) payment_id?: string | null;
}
