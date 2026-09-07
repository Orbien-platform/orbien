import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PersonsService } from './persons.service';

/**
 * DT-05 (LGPD, Art. 18): 30 dias depois do soft delete, elimina os dados
 * sensíveis de quem não pediu anonimização explícita. Roda como
 * `prisma.system` (cross-tenant, BYPASSRLS) — não há request nem tenant no
 * contexto de um cron.
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
}
