import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { WaitlistStatus } from '@prisma/client';

export class UpdateWaitlistDto {
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  contacted_at?: string;

  @IsOptional()
  @IsDateString()
  activated_at?: string;

  @IsOptional()
  @IsString()
  tenant_id?: string;
}
