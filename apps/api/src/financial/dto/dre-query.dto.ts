import { IsDateString, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { IsNotBeforePeriodStart } from './period-range.validator';

// UUID de centro de custo ou o literal `none` (lançamentos sem centro).
const UUID_OR_NONE =
  /^(none|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export class DreQueryDto {
  @IsDateString()
  period_start!: string;

  @IsDateString()
  @IsNotBeforePeriodStart()
  period_end!: string;

  @IsOptional()
  @IsUUID()
  congregation_id?: string;

  // Compatibilidade: filtra por nome. `cost_center_id` vence quando os dois vêm.
  @IsOptional()
  @IsString()
  cost_center?: string;

  @IsOptional()
  @Matches(UUID_OR_NONE, {
    message: 'cost_center_id deve ser um UUID ou "none"',
  })
  cost_center_id?: string;
}
