import { IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateScheduleDto {
  @IsUUID('4') ministry_id!: string;

  @IsString() @IsNotEmpty() title!: string;

  @IsISO8601() scheduled_date!: string;

  @IsOptional() @IsISO8601() deadline_confirm_at?: string;
}
