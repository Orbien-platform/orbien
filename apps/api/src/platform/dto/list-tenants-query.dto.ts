import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListTenantsQueryDto {
  /** Busca por slug ou nome, case-insensitive. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
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
