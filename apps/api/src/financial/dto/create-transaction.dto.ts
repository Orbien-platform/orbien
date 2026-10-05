import {
  IsDate,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionSource, TransactionType } from '@prisma/client';

export class CreateTransactionDto {
  @IsEnum(TransactionType, { message: 'Tipo deve ser income ou expense' })
  type!: TransactionType;

  // `amount` é Decimal(12,2): mais de duas casas seriam arredondadas em
  // silêncio, e acima de 10 dígitos inteiros o INSERT estoura em 500.
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor deve ser um número com até 2 casas decimais' })
  @IsPositive({ message: 'Valor deve ser positivo' })
  @Max(9_999_999_999.99, { message: 'Valor acima do limite permitido' })
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

  // Cadastro já como pago. Só `paid` e `pending`: `confirmed` é do fluxo de
  // exportação contábil e não se escolhe aqui. Quem pode pedir `paid` é o mesmo
  // conjunto de `PATCH :id/status` — a checagem fica no controller.
  @IsOptional()
  @IsIn(['pending', 'paid'], { message: 'status deve ser pending ou paid' })
  status?: 'pending' | 'paid';
}
