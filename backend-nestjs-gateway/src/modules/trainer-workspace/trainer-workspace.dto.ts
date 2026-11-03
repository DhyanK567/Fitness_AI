import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SaveWorkoutPlanDto {
  @IsOptional() @IsUUID() id?: string;
  @IsUUID() member_id!: string;
  @IsString() @MaxLength(160) title!: string;
  @IsOptional() @IsString() @MaxLength(240) goal?: string;
  @IsObject() exercises!: Record<string, unknown>;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SaveProgressNoteDto {
  @IsOptional() @IsUUID() id?: string;
  @IsUUID() member_id!: string;
  @IsDateString() recorded_at!: string;
  @IsObject() metrics!: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  @IsOptional() @IsString() @MaxLength(240) milestone?: string;
}
