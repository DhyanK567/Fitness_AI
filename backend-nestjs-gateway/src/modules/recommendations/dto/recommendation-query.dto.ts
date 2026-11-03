import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ example: 7, default: 7 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;

  @ApiPropertyOptional({ example: 'strength & endurance' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ example: 'Intermediate' })
  @IsOptional()
  @IsString()
  level?: string;

  @ApiPropertyOptional({ example: 'usr-123' })
  @IsOptional()
  @IsString()
  memberId?: string;

  [key: string]: unknown;
}

export class RecommendationResponseDto {
  session_id: string;
  sessionId?: string;
  class_name: string;
  className?: string;
  category?: string;
  trainer: string;
  session_date?: string;
  date?: string;
  start_time: string;
  startTime?: string;
  end_time: string;
  endTime?: string;
  available_spots: number;
  availableSpots?: number;
  match_score: number;
  matchScore?: number;
  reason: string;
  book_href?: string;
  bookHref?: string;

  [key: string]: unknown;
}
