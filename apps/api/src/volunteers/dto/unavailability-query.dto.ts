import { IsInt, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

export class UnavailabilityQueryDto {
  @IsInt()
  @Min(1)
  @Max(12)
  @Transform(({ value }: { value: unknown }) => Number(value))
  month!: number;

  @IsInt()
  @Min(2000)
  @Transform(({ value }: { value: unknown }) => Number(value))
  year!: number;
}
