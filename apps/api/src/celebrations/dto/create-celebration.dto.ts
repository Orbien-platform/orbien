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

  // Data da celebração avulsa (recurrence "none"), YYYY-MM-DD. Sem ela a API
  // não sabe em que dia o culto acontece e não consegue criar a instância.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'scheduled_date must be in YYYY-MM-DD format' })
  scheduled_date?: string;
}
