import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Gender, PersonClassification } from '@prisma/client';

export class ListPersonsQueryDto {
  @IsOptional()
  @IsEnum(PersonClassification, { message: 'Classificação inválida' })
  classification?: PersonClassification;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gênero inválido' })
  gender?: Gender;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'limit máximo é 100' })
  limit = 20;
}
