import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class DreQueryDto {
  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;

  @IsOptional()
  @IsUUID()
  congregation_id?: string;

  @IsOptional()
  @IsString()
  cost_center?: string;
}
