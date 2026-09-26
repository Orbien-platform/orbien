import { IsEnum } from 'class-validator';
import { PlanType } from '@prisma/client';

export class ChangeTenantPlanDto {
  @IsEnum(PlanType)
  plan!: PlanType;
}
