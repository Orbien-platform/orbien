import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListKidsChildrenQueryDto {
  // Busca por nome (só a equipe; o responsável sempre vê todos os seus filhos).
  @IsOptional() @IsString() @MaxLength(100) search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
