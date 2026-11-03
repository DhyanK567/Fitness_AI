import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class UpdatePaymentDto {
  @IsOptional()
  @IsIn(['Pending', 'Review', 'Paid', 'Failed', 'Partially Refunded', 'Refunded'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RefundPaymentDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RecordLedgerPaymentDto {
  @IsUUID()
  member_id!: string;

  @IsString()
  @MaxLength(80)
  type!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;

  @IsIn(['Cash', 'UPI', 'Card', 'Bank Transfer'])
  method!: string;

  @IsIn(['Paid', 'Pending', 'Review'])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
