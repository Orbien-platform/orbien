import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** As duas únicas ações que a policy de plataforma deixa esta rota enxergar. */
export const PLATFORM_ACTIONS = ['support_access', 'platform_access'] as const;

export class ListAuditQueryDto {
  /** Restringe a uma igreja. Sem isto, vêm as de todas. */
  @IsOptional()
  @IsString()
  tenant_id?: string;

  /**
   * `support_access` é sessão de suporte dentro de um tenant;
   * `platform_access` é rota que opera acima deles. Sem filtro, as duas.
   *
   * Qualquer outro valor é recusado aqui, e não silenciosamente ignorado: a
   * policy de 005 não devolveria essas linhas de qualquer jeito, e uma lista
   * vazia sem explicação é pior que um 400.
   */
  @IsOptional()
  @IsIn(PLATFORM_ACTIONS)
  action?: (typeof PLATFORM_ACTIONS)[number];

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  // Os mesmos tetos de `ListTenantsQueryDto`, e pelo mesmo motivo: `page` alto
  // vira OFFSET profundo, o que anularia o teto do `limit`.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
