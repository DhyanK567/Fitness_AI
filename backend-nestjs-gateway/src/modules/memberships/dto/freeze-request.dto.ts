import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFreezeRequestDto {
  @IsUUID() member_id!: string;
  @IsIn([7, 14]) days!: 7 | 14;
  @IsIn(['Travelling / Vacation', 'Medical Recovery / Injury']) reason!: string;
}

export class ReviewFreezeRequestDto {
  @IsIn(['Approved', 'Declined']) decision!: 'Approved' | 'Declined';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
