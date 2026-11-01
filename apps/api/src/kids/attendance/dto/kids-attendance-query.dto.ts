import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class KidsAttendanceQueryDto {
  // Sem período, vale a janela padrão de 90 dias terminando hoje.
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  // Filtro por turma; sem ele, todas as turmas com check-in no período.
  @IsOptional()
  @IsUUID()
  room_id?: string;
}
