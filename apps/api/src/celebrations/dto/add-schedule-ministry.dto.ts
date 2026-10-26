import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class AddScheduleMinistryDto {
  @IsUUID()
  ministry_id!: string;

  @IsInt()
  @Min(1)
  slots!: number;

  // Liga a escala a uma sessão kids da MESMA instância (módulo Kids, T21).
  @IsOptional()
  @IsUUID()
  kids_session_id?: string;
}
