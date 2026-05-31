import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { WaitlistSizeRange, WaitlistStatus } from '@prisma/client';

export class ListWaitlistQueryDto {
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;

  @IsOptional()
  @IsEnum(WaitlistSizeRange)
  size_range?: WaitlistSizeRange;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
