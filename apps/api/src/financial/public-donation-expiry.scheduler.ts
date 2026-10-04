import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PixService } from './pix.service';

/**
 * Cobranças da doação pública que ninguém pagou. Um `@Cron` por si só não roda
 * com a API dormindo (PEND-13) — a página não depende dele: o status já vira
 * `expired` por leitura depois de 24h. O job é higiene: cancela o QR na Asaas e
 * fecha a linha. Ver `PixService.expireAbandonedPublicDonations`.
 */
@Injectable()
export class PublicDonationExpiryScheduler {
  private readonly logger = new Logger(PublicDonationExpiryScheduler.name);

  constructor(private readonly pixService: PixService) {}

  @Cron('0 4 * * *')
  async run(): Promise<void> {
    try {
      const { cancelled, kept } = await this.pixService.expireAbandonedPublicDonations();
      this.logger.log(`Doações públicas abandonadas: ${cancelled} canceladas, ${kept} mantidas`);
    } catch (err) {
      this.logger.error(`Falha na limpeza de doações públicas abandonadas: ${String(err)}`);
    }
  }
}
