import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTenantsQueryDto {
  /** Busca por slug ou nome, case-insensitive. */
  @IsOptional()
  @IsString()
  search?: string;

  // Teto também aqui, não só no `limit`: `page` alto vira OFFSET profundo na
  // mesma tabela, o que anula o motivo do teto do `limit`. 100 páginas de 100
  // cobrem qualquer volume que o console vá listar antes de precisar de cursor.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  // O teto existe porque esta rota é a única do sistema que lê os N tenants:
  // sem ele um `limit=100000` varre a tabela inteira num request só.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
