import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecurringFrequency, TransactionType } from '@prisma/client';

export class CreateRecurringRuleDto {
  @IsEnum(RecurringFrequency, { message: 'Frequência deve ser weekly, monthly ou yearly' })
  frequency!: RecurringFrequency;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Intervalo deve ser um número inteiro' })
  @Min(1, { message: 'Intervalo deve ser maior ou igual a 1' })
  interval?: number = 1;

  @IsOptional()
  @IsISO8601({}, { message: 'Data de término inválida' })
  ends_at?: string;

  @IsNumber({}, { message: 'Valor deve ser um número' })
  @IsPositive({ message: 'Valor deve ser positivo' })
  amount!: number;

  @IsEnum(TransactionType, { message: 'Tipo deve ser income ou expense' })
  type!: TransactionType;

  @IsUUID('4', { message: 'category_id deve ser um UUID válido' })
  category_id!: string;

  @IsString()
  @IsNotEmpty({ message: 'Descrição é obrigatória' })
  description!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
