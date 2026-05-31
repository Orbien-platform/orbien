import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PersonClassification } from '@prisma/client';

export class ReclassifyPersonDto {
  @IsEnum(PersonClassification, { message: 'Classificação inválida' })
  classification!: PersonClassification;

  @IsOptional()
  @IsString()
  reason?: string;
}
