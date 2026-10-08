import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import { IsNotBeforePeriodStart } from './period-range.validator';

export class BalanceteQueryDto {
  @IsDateString()
  period_start!: string;

  @IsDateString()
  @IsNotBeforePeriodStart()
  period_end!: string;

  @IsOptional()
  @IsUUID()
  congregation_id?: string;
}
