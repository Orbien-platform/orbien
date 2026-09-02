import { IsArray, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateUnavailabilityDto {
  @IsInt()
  @Min(1)
  @Max(12)
  @Type(() => Number)
  referenceMonth!: number;

  @IsInt()
  @Min(2000)
  @Type(() => Number)
  referenceYear!: number;

  @IsArray()
  @IsISO8601({}, { each: true })
  dates!: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}
