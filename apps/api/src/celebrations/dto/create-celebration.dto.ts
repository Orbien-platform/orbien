import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { CelebrationType, CelebrationRecurrence } from '@prisma/client';

export class CreateCelebrationDto {
  @IsString()
  name!: string;

  @IsEnum(CelebrationType)
  type!: CelebrationType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  day_of_week?: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'start_time must be in HH:MM format' })
  start_time!: string;

  @IsEnum(CelebrationRecurrence)
  recurrence!: CelebrationRecurrence;
}
