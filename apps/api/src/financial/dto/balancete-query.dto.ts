import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class BalanceteQueryDto {
  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;

  @IsOptional()
  @IsUUID()
  congregation_id?: string;
}
