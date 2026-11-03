import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ example: 'MEM-00001' })
  @IsString()
  member_id: string;

  @ApiPropertyOptional({ example: 'MSHP-00012' })
  @IsOptional()
  @IsString()
  membership_id?: string | null;

  @ApiPropertyOptional({ example: 'BKG-00001' })
  @IsOptional()
  @IsString()
  booking_id?: string | null;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ example: 'INR', default: 'INR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ example: 'Cash' })
  @IsString()
  payment_method: string;

  @ApiPropertyOptional({ example: 'MAN-ABC1234' })
  @IsOptional()
  @IsString()
  ref?: string;

  @ApiPropertyOptional({ example: 'Manual membership payment' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'Membership' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'Paid' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional({ enum: ['pending', 'success', 'failed', 'refunded', 'Paid', 'Pending'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class PaymentResponseDto {
  @ApiProperty({ example: 'PAY-00001' })
  id: string;

  @ApiProperty()
  member_id: string;

  @ApiPropertyOptional()
  membership_id?: string | null;

  @ApiPropertyOptional()
  booking_id?: string | null;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  payment_method: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  razorpay_order_id?: string | null;

  @ApiPropertyOptional()
  razorpay_payment_id?: string | null;

  @ApiPropertyOptional()
  paid_at?: string | null;

  @ApiPropertyOptional()
  ref?: string;

  @ApiPropertyOptional()
  notes?: string | null;

  [key: string]: unknown;
}