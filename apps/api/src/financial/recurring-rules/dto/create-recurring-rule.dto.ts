import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { RecurringFrequency, RecurringRuleMode, TransactionType } from '@prisma/client';

export class CreateRecurringRuleDto {
  @IsEnum(RecurringRuleMode, { message: 'Modo deve ser installment ou fixed' })
  mode!: RecurringRuleMode;

  @IsEnum(RecurringFrequency, { message: 'Frequência deve ser weekly, monthly ou yearly' })
  frequency!: RecurringFrequency;

  @ValidateIf((o: CreateRecurringRuleDto) => o.mode === RecurringRuleMode.installment)
  @IsInt({ message: 'Número de parcelas deve ser um número inteiro' })
  @Min(2, { message: 'Número de parcelas deve ser maior ou igual a 2' })
  installments?: number;

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

  @IsOptional()
  @IsDateString({}, { message: 'Data de início inválida' })
  started_at?: string;
}
