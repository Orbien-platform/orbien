import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCelebrationInstanceDto {
  @IsUUID()
  celebration_id!: string;

  @IsDateString()
  scheduled_date!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
