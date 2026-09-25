import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentModule } from '../content/content.module';
import { BibleReaderController } from './bible-reader.controller';
import { BibleReaderService } from './bible-reader.service';
import { BibleVerseMarksController } from './bible-verse-marks.controller';
import { BibleVerseMarksService } from './bible-verse-marks.service';
import { BibleMarkInteractionsService } from './bible-mark-interactions.service';
import { ApiBibleTextProvider } from './api-bible-text.provider';
import { BIBLE_TEXT_PROVIDER } from './bible-text-provider.interface';

/**
 * Módulo da Bíblia (biblia-nvi-marcacoes-mobile) — leitura (T7-T10) +
 * marcação/feed (T11-T13), wiring final.
 *
 * `BIBLE_TEXT_PROVIDER` é injetado por token, nunca pela classe concreta —
 * é o que deixa `BibleReaderService` sem conhecer `ApiBibleTextProvider`, e
 * o que o teste de integração (T14) sobrescreve por um fake via
 * `overrideProvider`.
 */
@Module({
  // ContentModule pelo `NotificationsService` (push de resposta). Sem ciclo:
  // ContentModule não importa BibleModule.
  imports: [PrismaModule, HttpModule, ContentModule],
  controllers: [BibleReaderController, BibleVerseMarksController],
  providers: [
    BibleReaderService,
    BibleVerseMarksService,
    BibleMarkInteractionsService,
    { provide: BIBLE_TEXT_PROVIDER, useClass: ApiBibleTextProvider },
  ],
})
export class BibleModule {}
