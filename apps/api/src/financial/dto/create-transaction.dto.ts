import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionSource, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType, { message: 'Tipo deve ser income ou expense' })
  type!: TransactionType;

  @IsNumber({}, { message: 'Valor deve ser um número' })
  @IsPositive({ message: 'Valor deve ser positivo' })
  amount!: number;

  @IsNotEmpty()
  @IsDate({ message: 'Data inválida' })
  @Type(() => Date)
  occurred_at!: Date;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID('4', { message: 'category_id deve ser um UUID válido' })
  category_id!: string;

  @IsOptional()
  @IsUUID('4', { message: 'donor_person_id deve ser um UUID válido' })
  donor_person_id?: string;

  @IsOptional()
  @IsUUID('4', { message: 'cost_center_id deve ser um UUID válido' })
  cost_center_id?: string;

  @IsOptional()
  @IsEnum(TransactionSource, { message: 'Source inválido' })
  source?: TransactionSource;

  @IsOptional()
  @IsString()
  notes?: string;
}
