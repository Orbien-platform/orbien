import { IsInt, IsUUID, Min } from 'class-validator';

export class AddScheduleMinistryDto {
  @IsUUID()
  ministry_id!: string;

  @IsInt()
  @Min(1)
  slots!: number;
}
