import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ScheduleStatus } from '@prisma/client';

export class ListSchedulesQueryDto {
  @IsOptional() @IsUUID('4') ministry_id?: string;

  @IsOptional() @IsEnum(ScheduleStatus) status?: ScheduleStatus;

  @IsOptional() @IsISO8601() date_from?: string;

  @IsOptional() @IsISO8601() date_to?: string;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number) offset: number = 0;

  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit: number = 20;
}
