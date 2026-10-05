import { IsDateString, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID('4')
  congregation_id?: string;

  // Período da Visão Geral (dias civis, inclusive nas duas pontas). As duas
  // datas vêm juntas ou nenhuma — sem elas, o mês corrente.
  @ValidateIf((o: DashboardQueryDto) => o.period_end !== undefined)
  @IsDateString({}, { message: 'period_start deve ser uma data válida' })
  period_start?: string;

  @ValidateIf((o: DashboardQueryDto) => o.period_start !== undefined)
  @IsDateString({}, { message: 'period_end deve ser uma data válida' })
  period_end?: string;
}
