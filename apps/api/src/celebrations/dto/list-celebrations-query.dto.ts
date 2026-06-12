import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { CelebrationType } from '@prisma/client';

export class ListCelebrationsQueryDto {
  @IsOptional()
  @IsEnum(CelebrationType)
  type?: CelebrationType;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  is_active?: boolean;
}
