import { IsDateString, IsOptional } from 'class-validator';

export class CashBalanceQueryDto {
  // Dia civil de corte do caixa (inclusive). Sem ele, hoje em Brasília.
  @IsOptional()
  @IsDateString({}, { message: 'as_of deve ser uma data válida' })
  as_of?: string;
}
