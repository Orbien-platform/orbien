import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PixStatus } from '@prisma/client';

export class ListPublicIntentsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  page_size: number = 20;

  /** Sem filtro, lista tudo — o tesoureiro quer ver o que está pendente e o que já fechou. */
  @IsOptional()
  @IsEnum(PixStatus)
  status?: PixStatus;
}
