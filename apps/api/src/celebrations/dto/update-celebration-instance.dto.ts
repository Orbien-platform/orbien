import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CelebrationInstanceStatus } from '@prisma/client';

export class UpdateCelebrationInstanceDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(CelebrationInstanceStatus)
  status?: CelebrationInstanceStatus;
}
