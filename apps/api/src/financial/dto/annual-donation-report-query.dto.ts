import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AnnualDonationReportQueryDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  year: number = new Date().getUTCFullYear();
}
