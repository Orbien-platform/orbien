import { IsOptional, IsUUID } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID('4')
  congregation_id?: string;
}
