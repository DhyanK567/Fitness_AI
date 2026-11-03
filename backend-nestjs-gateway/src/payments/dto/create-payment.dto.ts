import { Transform } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, Min, Validate, ValidateIf, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'exactlyOnePaymentTarget', async: false })
class ExactlyOnePaymentTarget implements ValidatorConstraintInterface {
  validate(_value: unknown, args: any) {
    const request = args.object as CreatePaymentDto;
    return Boolean(request.membership_id) !== Boolean(request.booking_id);
  }

  defaultMessage() {
    return 'Exactly one of membership_id or booking_id is required';
  }
}

export class CreatePaymentDto {
  @IsOptional()
  @IsString()
  @Length(1, 140)
  member_id!: string;

  @ValidateIf((value: CreatePaymentDto) => !value.booking_id)
  @IsString()
  @Length(1, 140)
  membership_id?: string;

  @ValidateIf((value: CreatePaymentDto) => !value.membership_id)
  @IsString()
  @Length(1, 140)
  booking_id?: string;

  @Transform(({ value }) => typeof value === 'string' ? Number(value) : value)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Validate(ExactlyOnePaymentTarget)
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsIn(['razorpay', 'cash', 'upi'])
  payment_method!: 'razorpay' | 'cash' | 'upi';
}
