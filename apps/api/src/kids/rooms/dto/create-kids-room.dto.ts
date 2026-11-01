import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

// Teto de 100 anos em meses: sem ele, um inteiro além de int4 chega ao
// Postgres e vira 500 em vez de 400.
export const MAX_AGE_MONTHS = 1200;

export class CreateKidsRoomDto {
  @IsString() @IsNotEmpty() name!: string;

  // Faixa etária obrigatória em toda turma (spec P1 Turmas, AC 2). A ordem
  // min <= max depende dos dois campos e é checada no service.
  @IsInt() @Min(0) @Max(MAX_AGE_MONTHS) min_age_months!: number;
  @IsInt() @Min(0) @Max(MAX_AGE_MONTHS) max_age_months!: number;

  @IsOptional() @IsBoolean() allows_out_of_range?: boolean;

  @IsOptional() @IsInt() @Min(1) @Max(10000) capacity?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1000) min_volunteers?: number;
}
