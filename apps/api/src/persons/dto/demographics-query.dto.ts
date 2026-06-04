import { IsEnum, IsISO8601, IsOptional } from 'class-validator';
import { PersonClassification } from '@prisma/client';

export class DemographicsQueryDto {
  @IsOptional()
  @IsEnum(PersonClassification, { message: 'Classificação inválida' })
  classification?: PersonClassification;

  @IsOptional()
  @IsISO8601({}, { message: 'since deve ser uma data ISO 8601' })
  since?: string;

  @IsOptional()
  @IsISO8601({}, { message: 'until deve ser uma data ISO 8601' })
  until?: string;
}
