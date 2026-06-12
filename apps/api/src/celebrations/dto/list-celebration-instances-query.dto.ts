import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CelebrationInstanceStatus } from '@prisma/client';

export class ListCelebrationInstancesQueryDto {
  @IsOptional()
  @IsUUID()
  celebration_id?: string;

  @IsOptional()
  @IsEnum(CelebrationInstanceStatus)
  status?: CelebrationInstanceStatus;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
