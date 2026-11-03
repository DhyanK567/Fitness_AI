import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportBodyDto {
  @IsOptional()
  @IsArray()
  rows?: Array<Record<string, unknown>>;

  @IsOptional()
  @IsString()
  @MaxLength(10 * 1024 * 1024)
  rawCsv?: string;

  @IsOptional()
  @IsIn([true, false, 'true', 'false'])
  dryRun?: boolean | string;

  @IsOptional()
  @IsIn(['skip', 'update'])
  duplicatePolicy?: 'skip' | 'update';
}
