import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMembershipOrderDto {
  @IsString()
  @IsNotEmpty()
  plan_id!: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;

  @IsOptional()
  @IsString()
  referral_code?: string;

  @IsOptional()
  @IsBoolean()
  redeem_reward?: boolean;
}

export class VerifyMembershipPaymentDto {
  @IsString()
  @IsNotEmpty()
  plan_id!: string;

  @IsString()
  @IsNotEmpty()
  razorpay_order_id!: string;

  @IsString()
  @IsNotEmpty()
  razorpay_payment_id!: string;

  @IsString()
  @IsNotEmpty()
  razorpay_signature!: string;

  @IsOptional()
  @IsString()
  referral_code?: string;

  @IsOptional()
  @IsBoolean()
  redeem_reward?: boolean;
}
