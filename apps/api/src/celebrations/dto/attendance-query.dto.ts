import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AttendanceQueryDto {
  @IsOptional()
  @IsUUID()
  celebration_id?: string;

  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;
}
