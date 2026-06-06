import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { FinancialCategoryType } from '@prisma/client';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name!: string;

  @IsEnum(FinancialCategoryType, { message: 'Tipo deve ser income ou expense' })
  type!: FinancialCategoryType;

  @IsOptional()
  @IsUUID('4', { message: 'parent_id deve ser um UUID válido' })
  parent_id?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
