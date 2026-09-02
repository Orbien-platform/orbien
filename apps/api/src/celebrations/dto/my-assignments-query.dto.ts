import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class MyAssignmentsQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  includePast?: boolean;
}
