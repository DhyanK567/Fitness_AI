import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateClassDto {
  @IsOptional() @IsString() @Length(1, 140) name?: string;
  @IsOptional() @IsString() @Length(1, 140) trainer_id?: string;
  @IsOptional() @IsString() trainer?: string;
  @IsOptional() @IsString() @Length(1, 100) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) duration_mins?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) capacity?: number;
  @IsOptional() @IsString() location?: string | null;
  @IsOptional() @IsString() room?: string | null;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsString() status?: string;
}
