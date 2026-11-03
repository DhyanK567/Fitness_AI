import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateEventDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() startAt?: string;
  @IsOptional() @IsString() endAt?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() @IsString() organizer?: string;
  @IsOptional() @IsNumber() capacity?: number | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @IsDateString() event_date?: string;
  @IsOptional() @IsString() start_time?: string;
  @IsOptional() @IsString() end_time?: string | null;
  @IsOptional() @IsBoolean() is_paid?: boolean;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() audience?: string;
  @IsOptional() @IsDateString() registration_deadline?: string | null;
  @IsOptional() @IsBoolean() is_published?: boolean;
  @IsOptional() @IsString() @Length(1, 2048) image?: string | null;
  @IsOptional() @IsString() description?: string | null;
}
