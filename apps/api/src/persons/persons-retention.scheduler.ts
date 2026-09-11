import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PersonsService } from './persons.service';

/**
 * Jobs de retenção da seção 5 do mapeamento LGPD (`orbien-lgpd-mapping.md`):
 * DT-05 (Art. 18, exclusão explícita), DT-07 (inatividade) e as duas
 * categorias que dependem do fim do contrato do tenant (financeiro, menor).
 * Roda como `prisma.system` (cross-tenant, BYPASSRLS) — não há request nem
 * tenant no contexto de um cron.
 */
@Injectable()
export class PersonsRetentionScheduler {
  private readonly logger = new Logger(PersonsRetentionScheduler.name);

  constructor(private readonly personsService: PersonsService) {}

  @Cron('0 3 * * *')
  async cronPurgeExpiredSoftDeletes(): Promise<void> {
    const result = await this.personsService.purgeExpiredSoftDeletes();
    this.logger.log(`Retenção de 30 dias: ${result.purged} pessoa(s) com dados sensíveis eliminados`);
  }

  // Horário distinto do purge de soft delete só para não concorrer com ele
  // pela mesma janela de baixo tráfego; os dois são idempotentes e podem
  // rodar em qualquer ordem.
  @Cron('0 4 * * *')
  async cronPurgeInactivePersons(): Promise<void> {
    const result = await this.personsService.purgeInactivePersons();
    this.logger.log(`Retenção por inatividade: ${result.purged} pessoa(s) anonimizadas`);
  }

  // Categoria "dados financeiros" da seção 5 (LGPD): 5 anos após o fim do
  // contrato do tenant. Horário próprio (5h) pelo mesmo motivo dos dois
  // acima — mesma janela de baixo tráfego, sem concorrer entre si.
  @Cron('0 5 * * *')
  async cronPurgeFinancialDonorsAfterContractEnd(): Promise<void> {
    const result = await this.personsService.purgeFinancialDonorsAfterContractEnd();
    this.logger.log(`Retenção de dado financeiro pós-contrato: ${result.purged} doador(es) anonimizados`);
  }

  // Categoria "dado de menor de 18 anos" da seção 5 (LGPD): 30 dias após o
  // fim do contrato do tenant.
  @Cron('0 6 * * *')
  async cronPurgeMinorsAfterContractEnd(): Promise<void> {
    const result = await this.personsService.purgeMinorsAfterContractEnd();
    this.logger.log(`Retenção de dado de menor pós-contrato: ${result.purged} pessoa(s) anonimizadas`);
  }
}
