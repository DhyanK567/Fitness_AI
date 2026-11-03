import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleSignInDto {
  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  id_token!: string;
}
