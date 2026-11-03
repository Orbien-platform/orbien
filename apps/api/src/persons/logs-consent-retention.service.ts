import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const AUDIT_LOG_RETENTION_YEARS = 2;
export const CONSENT_RETENTION_YEARS = 5;
export const RETENTION_BATCH = 1000;
// Teto por rodada: um backlog grande não monopoliza o banco numa noite; o que
// sobra é retomado na rodada seguinte (o filtro é reavaliado a cada vez).
export const RETENTION_MAX_BATCHES = 200;

/**
 * Entidades de auditoria que descrevem dado financeiro. Nunca expiram aqui:
 * a obrigação fiscal (Res. CFC 1.330/2011) e o rastro de origem do valor
 * dependem do `before`/`after` e do `subject_person_id` dessas linhas.
 */
export const FINANCIAL_AUDIT_ENTITIES = [
  'financial_transaction',
  'bank_statement_transaction',
  'pix_payment',
] as const;

/**
 * Retenção das duas linhas da seção 5 do mapeamento LGPD que não são cadastro
 * de pessoa (CONF-02):
 *   - logs de acesso e auditoria: 2 anos (Marco Civil, Art. 15), contados de
 *     `audit_logs.at`, com DELETE físico depois do prazo. Anonimizar o log
 *     tiraria o IP e o antes/depois e deixaria uma linha sem valor de prova;
 *   - registros de consentimento: 5 anos depois da revogação
 *     (`revoked_at`), com DELETE físico. Consentimento nunca revogado não
 *     expira, e a anonimização da pessoa não é marco de revogação.
 *
 * Fora das duas regras, sempre: dado financeiro e qualquer linha cujo titular
 * é doador (vínculo em `financial_transactions` ou `pix_payments`). Decisão do
 * dono (2026-11-02): nem o financeiro nem o dado pessoal que permite rastrear
 * a origem de uma doação (vínculo com CPF) saem por aqui.
 *
 * Linhas `support_access`/`platform_access` seguem o mesmo prazo e nunca
 * expiram antes de 2 anos. Se devem durar mais é questão jurídica (CONF-01).
 *
 * Roda como `prisma.system` (cross-tenant, BYPASSRLS), como os purges de
 * `PersonsService`; não abre exceção de RLS. Em lotes, cada lote numa
 * instrução própria: falha no meio preserva o que já foi apagado. O log
 * estruturado traz só contagens.
 */
@Injectable()
export class LogsConsentRetentionService {
  private readonly logger = new Logger(LogsConsentRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 2h UTC: 3h–6h são os purges de pessoa, 7h o Kids, 8h o notifier.
  @Cron('0 2 * * *')
  async cronPurgeExpiredLogsAndConsents(): Promise<void> {
    for (const [label, job] of [
      ['logs de auditoria', () => this.purgeExpiredAuditLogs()],
      ['consentimentos', () => this.purgeExpiredConsents()],
    ] as const) {
      try {
        const { deleted, failed } = await job();
        this.logger.log(`Retenção de ${label}: ${deleted} apagado(s), ${failed ? 'com falha' : 'sem falha'}`);
      } catch (err) {
        // Um job falhar não pode impedir o outro nem derrubar o processo.
        this.logger.error(`Retenção de ${label} falhou: ${String(err)}`);
      }
    }
  }

  // `tenantId` restringe a varredura (o cron não passa; existe para o teste de
  // integração rodar só nos tenants de teste).
  async purgeExpiredAuditLogs(now = new Date(), tenantId?: string): Promise<RetentionResult> {
    const cutoff = yearsBefore(now, AUDIT_LOG_RETENTION_YEARS);
    const tenantFilter = tenantId ? Prisma.sql`AND a.tenant_id = ${tenantId}` : Prisma.empty;
    return this.deleteInBatches(
      (limit) => Prisma.sql`
        DELETE FROM audit_logs
        WHERE id IN (
          SELECT a.id
          FROM audit_logs a
          WHERE a.at < ${cutoff}
            AND a.entity NOT IN (${Prisma.join([...FINANCIAL_AUDIT_ENTITIES])})
            AND NOT (${isDonor(Prisma.sql`a.subject_person_id`)})
            ${tenantFilter}
          ORDER BY a.at
          LIMIT ${limit}
        )`,
    );
  }

  async purgeExpiredConsents(now = new Date(), tenantId?: string): Promise<RetentionResult> {
    const cutoff = yearsBefore(now, CONSENT_RETENTION_YEARS);
    const tenantFilter = tenantId ? Prisma.sql`AND c.tenant_id = ${tenantId}` : Prisma.empty;
    return this.deleteInBatches(
      (limit) => Prisma.sql`
        DELETE FROM consent_records
        WHERE id IN (
          SELECT c.id
          FROM consent_records c
          WHERE c.revoked_at IS NOT NULL
            AND c.revoked_at < ${cutoff}
            AND NOT (${isDonor(Prisma.sql`c.person_id`)})
            ${tenantFilter}
          ORDER BY c.revoked_at
          LIMIT ${limit}
        )`,
    );
  }

  private async deleteInBatches(statement: (limit: number) => Prisma.Sql): Promise<RetentionResult> {
    let deleted = 0;
    for (let i = 0; i < RETENTION_MAX_BATCHES; i += 1) {
      let count: number;
      try {
        count = await this.prisma.system.$executeRaw(statement(RETENTION_BATCH));
      } catch (err) {
        // Lotes anteriores já foram confirmados; a próxima rodada retoma.
        this.logger.error(`Lote de retenção falhou após ${deleted} apagado(s): ${String(err)}`);
        return { deleted, failed: true };
      }
      deleted += count;
      if (count < RETENTION_BATCH) break;
    }
    return { deleted, failed: false };
  }
}

export interface RetentionResult {
  deleted: number;
  failed: boolean;
}

function yearsBefore(now: Date, years: number): Date {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

// Mesmo critério de "vínculo financeiro" do notifier e dos purges de pessoa.
function isDonor(personId: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`
    ${personId} IS NOT NULL AND (
      EXISTS (SELECT 1 FROM financial_transactions ft WHERE ft.donor_person_id = ${personId})
      OR EXISTS (SELECT 1 FROM pix_payments pp WHERE pp.donor_person_id = ${personId})
    )`;
}
