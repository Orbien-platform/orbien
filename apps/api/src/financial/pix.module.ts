import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { MailModule } from '../mail/mail.module';
import { PixController } from './pix.controller';
import { PixService } from './pix.service';
import { DonationReceiptsController } from './donation-receipts.controller';
import { DonationReceiptService } from './donation-receipts.service';

/**
 * Módulo próprio, separado do resto de `FinancialModule` (`PROD-24`):
 * `ContentModule` precisa de `PixService` para gerar o QR de inscrição de
 * evento paga, e importar `FinancialModule` inteiro arrasta `ExportController`
 * → `ZipExportService` → `archiver`, um pacote ESM-only que o Jest não
 * consegue exigir como CommonJS — quebrava `content.module.spec.ts` mesmo sem
 * nenhum teste de exportação envolvido. `PixModule` só carrega o que
 * `PixService`/`DonationReceiptService` realmente usam.
 */
@Module({
  imports: [PrismaModule, HttpModule, StorageModule, MailModule],
  controllers: [PixController, DonationReceiptsController],
  providers: [PixService, DonationReceiptService],
  exports: [PixService],
})
export class PixModule {}
