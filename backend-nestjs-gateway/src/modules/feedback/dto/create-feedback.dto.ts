import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, Min, Max, IsUUID, IsArray, IsIn, MaxLength } from 'class-validator';

export class CreateFeedbackDto {
  @ApiProperty({ example: 'MEM-00001' })
  @IsUUID()
  member_id: string;

  @ApiPropertyOptional({ example: 'BKG-00001' })
  booking_id?: string;

  @IsOptional()
  @IsUUID()
  trainer_user_id?: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  strengths?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  improvements?: string[];

  @ApiPropertyOptional({ example: 'Great class!' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ example: '2026-09-20T19:00:00Z' })
  @IsOptional()
  submitted_at?: string;

  [key: string]: unknown;
}

export class CreateMemberFeedbackDto {
  @ApiPropertyOptional({ example: 'class-pilates-preview' })
  @IsOptional()
  @IsString()
  session_id?: string;

  @ApiPropertyOptional({ example: 'a0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsUUID()
  trainer_user_id?: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: ['Clear posture cues', 'Great pacing'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  strengths?: string[];

  @ApiPropertyOptional({ example: ['Room temperature / sound'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  improvements?: string[];

  @ApiPropertyOptional({ example: 'Loved the energy and playlist today!' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ example: 'Trainer' })
  @IsOptional()
  @IsIn(['Trainer', 'Staff', 'General'])
  category?: 'Trainer' | 'Staff' | 'General';

  [key: string]: unknown;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @IsOptional()
  @IsIn(['New', 'Awaiting Review', 'Reviewed', 'Resolved'])
  review_status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  follow_up_note?: string;

  [key: string]: unknown;
}

export class FeedbackResponseDto {
  @ApiProperty({ example: 'FBK-00001' })
  id: string;

  @ApiProperty()
  member_id: string;

  @ApiPropertyOptional()
  booking_id?: string | null;

  @ApiProperty()
  rating: number;

  @ApiPropertyOptional()
  comment?: string | null;

  @ApiProperty()
  submitted_at: string;

  @ApiPropertyOptional()
  sentiment?: 'positive' | 'neutral' | 'negative';

  @ApiPropertyOptional()
  topics?: string[];

  @ApiPropertyOptional()
  theme?: string;

  [key: string]: unknown;
}
