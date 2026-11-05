import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  RETENTION_BATCH,
  RETENTION_MAX_BATCHES,
  RetentionResult,
} from '../persons/logs-consent-retention.service';

export const LOGIN_ATTEMPTS_RETENTION_DAYS = 7;
export const PASSWORD_RESET_RETENTION_DAYS = 7;
export const REFRESH_TOKEN_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Retenção das três tabelas de auth que nenhum job limpava (CONF-02, resíduos).
 *
 *   - `login_attempts`: o contador só tem efeito durante a janela (no máximo
 *     1 h). Passado o prazo é lixo — com o e-mail de quem tentou, existindo ou
 *     não. Corte em `max(window_at, blocked_at)`.
 *   - `password_reset_tokens`: vale 30 min. Corte em `expires_at`, usado ou
 *     não (um token usado também expira em até 30 min).
 *   - `refresh_tokens`: corte em `expires_at`, revogado ou não. CUIDADO: a
 *     linha REVOGADA é a evidência que `AuthService.refresh` usa para detectar
 *     reuso e derrubar a família. Um token roubado só serve enquanto algum
 *     descendente seu estiver vivo, e cada elo vive 7 dias e nasce dentro da
 *     vida do pai: depois de `expires_at + 7 dias` não há descendente vivo. Os
 *     30 dias são esse limite duro mais folga (cron perdido — PEND-13 — e
 *     investigação de incidente).
 *
 * `prisma.system` (BYPASSRLS), sem policy nova. Lotes de 1000, cada um numa
 * instrução própria; falha no meio preserva o já apagado. Log só com contagens.
 *
 * `refresh_tokens.replaced_by_id` aponta do pai para o filho, e o pai expira
 * antes: `ORDER BY expires_at` apaga o pai antes ou junto do filho.
 */
@Injectable()
export class AuthTokensRetentionService {
  private readonly logger = new Logger(AuthTokensRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 1h UTC: 0h é o recorrente, 2h os logs, 3h–8h os demais.
  @Cron('0 1 * * *')
  async cronPurgeAuthTokens(): Promise<void> {
    for (const [label, job] of [
      ['tentativas de login', () => this.purgeLoginAttempts()],
      ['tokens de redefinição', () => this.purgePasswordResetTokens()],
      ['refresh tokens', () => this.purgeRefreshTokens()],
    ] as const) {
      try {
        const { deleted, failed } = await job();
        this.logger.log(`Retenção de ${label}: ${deleted} apagado(s), ${failed ? 'com falha' : 'sem falha'}`);
      } catch (err) {
        this.logger.error(`Retenção de ${label} falhou: ${String(err)}`);
      }
    }
  }

  // `identifierPrefix`/`userIds` restringem a varredura (o cron não passa;
  // existem para o teste de integração só tocar linhas dos tenants de teste).
  async purgeLoginAttempts(now = new Date(), identifierPrefix?: string): Promise<RetentionResult> {
    const cutoff = daysBefore(now, LOGIN_ATTEMPTS_RETENTION_DAYS);
    const scope = identifierPrefix ? Prisma.sql`AND l.identifier LIKE ${identifierPrefix + '%'}` : Prisma.empty;
    return this.deleteInBatches(
      (limit) => Prisma.sql`
        DELETE FROM login_attempts
        WHERE id IN (
          SELECT l.id FROM login_attempts l
          WHERE GREATEST(l.window_at, COALESCE(l.blocked_at, l.window_at)) < ${cutoff}
            ${scope}
          ORDER BY l.window_at, l.id
          LIMIT ${limit}
        )`,
    );
  }

  async purgePasswordResetTokens(now = new Date(), userIds?: string[]): Promise<RetentionResult> {
    const cutoff = daysBefore(now, PASSWORD_RESET_RETENTION_DAYS);
    const scope = userIds ? Prisma.sql`AND t.user_id IN (${Prisma.join(userIds)})` : Prisma.empty;
    return this.deleteInBatches(
      (limit) => Prisma.sql`
        DELETE FROM password_reset_tokens
        WHERE id IN (
          SELECT t.id FROM password_reset_tokens t
          WHERE t.expires_at < ${cutoff}
            ${scope}
          ORDER BY t.expires_at, t.id
          LIMIT ${limit}
        )`,
    );
  }

  async purgeRefreshTokens(now = new Date(), userIds?: string[]): Promise<RetentionResult> {
    const cutoff = daysBefore(now, REFRESH_TOKEN_RETENTION_DAYS);
    const scope = userIds ? Prisma.sql`AND r.user_account_id IN (${Prisma.join(userIds)})` : Prisma.empty;
    return this.deleteInBatches(
      (limit) => Prisma.sql`
        DELETE FROM refresh_tokens
        WHERE id IN (
          SELECT r.id FROM refresh_tokens r
          WHERE r.expires_at < ${cutoff}
            ${scope}
          ORDER BY r.expires_at, r.id
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
        this.logger.error(`Lote de retenção falhou após ${deleted} apagado(s): ${String(err)}`);
        return { deleted, failed: true };
      }
      deleted += count;
      if (count < RETENTION_BATCH) break;
    }
    return { deleted, failed: false };
  }
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}
