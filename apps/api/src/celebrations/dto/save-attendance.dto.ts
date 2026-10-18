import { IsInt, Max, Min } from 'class-validator';

export const MAX_ATTENDANCE_COUNT = 100000;

// As quatro categorias não se sobrepõem; o total é a soma. Zero é um valor
// válido ("nenhum visitante") — por isso todas são obrigatórias.
export class SaveAttendanceDto {
  @IsInt()
  @Min(0)
  @Max(MAX_ATTENDANCE_COUNT)
  children!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_ATTENDANCE_COUNT)
  members!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_ATTENDANCE_COUNT)
  attendees!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_ATTENDANCE_COUNT)
  visitors!: number;
}
