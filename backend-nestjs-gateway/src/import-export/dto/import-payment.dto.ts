import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportPaymentDto {
  @IsString()
  @IsOptional()
  ref?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsString()
  @IsOptional()
  memberId?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  method?: string;

  @IsOptional()
  @IsEnum(['Paid', 'Pending', 'Review', 'Failed', 'Refunded', 'Partially Refunded'])
  status?: string;

  @Type(() => Number)
  @IsPositive()
  @IsOptional()
  amount?: number;

  @Type(() => Number)
  @Min(0)
  @IsOptional()
  refundedAmount?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
