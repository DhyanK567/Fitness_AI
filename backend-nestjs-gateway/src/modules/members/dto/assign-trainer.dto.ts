import { IsOptional, IsUUID } from 'class-validator';

export class AssignTrainerDto {
  @IsOptional()
  @IsUUID()
  trainer_user_id?: string | null;
}
