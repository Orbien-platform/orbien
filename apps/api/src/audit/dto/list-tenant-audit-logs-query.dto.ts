import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * As ações que a igreja pode filtrar — e, por consequência, as únicas que a
 * rota devolve. É lista fechada de propósito, não um `@IsString()` livre:
 * `platform_access` também tem `tenant_id` preenchido (o tenant de origem da
 * conta de suporte, ver `AuditInterceptor`), e um filtro livre deixaria a
 * igreja que hospeda essa conta ler a operação da plataforma inteira. Quem
 * responde por `platform_access` é o console (`apps/admin`).
 */
export const TENANT_AUDIT_ACTIONS = ['support_access', 'tenant_transfer'] as const;

export type TenantAuditAction = (typeof TENANT_AUDIT_ACTIONS)[number];

export class ListTenantAuditLogsQueryDto {
  @IsOptional()
  @IsIn(TENANT_AUDIT_ACTIONS)
  action?: TenantAuditAction;

  /** Início da janela, inclusivo. Data ou instante ISO-8601. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Fim da janela, inclusivo. Data ou instante ISO-8601. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  // Mesmo teto de `ListAuditLogsQueryDto` no plano de plataforma, pelo mesmo
  // motivo: `audit_logs` é a tabela que mais cresce.
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
