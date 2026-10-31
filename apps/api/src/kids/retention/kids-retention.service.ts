import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const KIDS_CHECKIN_RETENTION_MONTHS = 12;
const BATCH = 200;

/**
 * Retenção de check-ins (KIDS-06): a identificação de quem retirou e o motivo
 * de uma retirada por exceção são apagados 12 meses depois do check-in.
 *
 * Exceção decidida pelo dono (2026-10-26): enquanto o responsável pelo
 * check-in (`guardian_person_id`) é membro ativo, o registro fica como está;
 * ao deixar de ser, a regra dos 12 meses volta a valer sozinha, porque o filtro
 * é reavaliado a cada rodada. "Membro ativo" = `classification = member`,
 * `deleted_at` nulo e, por precisão, `anonymized_at` nulo (a inatividade
 * anonimiza sem preencher `deleted_at`).
 *
 * Roda como `prisma.system` (cross-tenant, sem request nem tenant), no mesmo
 * padrão dos jobs de `PersonsService`. O que "anonimizar" significa está em
 * design.md (Retenção de check-in).
 */
@Injectable()
export class KidsRetentionService {
  private readonly logger = new Logger(KidsRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 7h: os jobs de pessoas ocupam 3h–6h; este roda depois deles, não junto.
  @Cron('0 7 * * *')
  async cronAnonymizeExpiredCheckins(): Promise<void> {
    try {
      const { anonymized, failed } = await this.anonymizeExpiredCheckins();
      this.logger.log(`Retenção de check-in kids: ${anonymized} anonimizado(s), ${failed} falha(s)`);
    } catch (err) {
      // Falha de consulta não derruba o processo; o job é idempotente e a
      // próxima rodada retoma de onde parou.
      this.logger.error(`Retenção de check-in kids falhou: ${String(err)}`);
    }
  }

  // `tenantId` restringe a varredura a um tenant. O cron não o passa (varre
  // todos); existe para o teste de integração rodar só nos tenants de teste.
  async anonymizeExpiredCheckins(now = new Date(), tenantId?: string): Promise<{ anonymized: number; failed: number }> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - KIDS_CHECKIN_RETENTION_MONTHS);

    const base: Prisma.KidsCheckinWhereInput = {
      ...(tenantId ? { tenant_id: tenantId } : {}),
      anonymized_at: null,
      // Estritamente anterior: exatamente 12 meses atrás ainda está no prazo.
      checked_in_at: { lt: cutoff },
      guardian: { isNot: { classification: 'member', deleted_at: null, anonymized_at: null } },
    };

    let anonymized = 0;
    let failed = 0;
    let lastId: string | undefined;

    for (;;) {
      const batch = await this.prisma.system.kidsCheckin.findMany({
        where: lastId ? { ...base, id: { gt: lastId } } : base,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      });
      if (batch.length === 0) break;

      for (const { id } of batch) {
        try {
          // `anonymized_at: null` no where: duas execuções concorrentes não
          // contam duas vezes nem sobrescrevem o carimbo da primeira.
          const res = await this.prisma.system.kidsCheckin.updateMany({
            where: { id, anonymized_at: null },
            data: {
              picked_up_by_name: null,
              picked_up_by_person_id: null,
              override_reason: null,
              anonymized_at: now,
            },
          });
          anonymized += res.count;
        } catch (err) {
          failed += 1;
          this.logger.error(`Falha ao anonimizar check-in ${id}: ${String(err)}`);
        }
      }

      lastId = batch[batch.length - 1]!.id;
      if (batch.length < BATCH) break;
    }

    return { anonymized, failed };
  }
}
