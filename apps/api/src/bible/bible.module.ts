import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { BibleReaderController } from './bible-reader.controller';
import { BibleReaderService } from './bible-reader.service';
import { ApiBibleTextProvider } from './api-bible-text.provider';
import { BIBLE_TEXT_PROVIDER } from './bible-text-provider.interface';

/**
 * Módulo da Bíblia (biblia-nvi-marcacoes-mobile). Nasce só com a leitura
 * (T7-T10); `BibleVerseMarksController`/`Service` entram no wiring final em
 * T13, mesmo padrão de `PixModule` (módulo próprio, cresce por task).
 *
 * `BIBLE_TEXT_PROVIDER` é injetado por token, nunca pela classe concreta —
 * é o que deixa `BibleReaderService` sem conhecer `ApiBibleTextProvider`, e
 * o que o teste de integração (T14) sobrescreve por um fake via
 * `overrideProvider`.
 */
@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [BibleReaderController],
  providers: [
    BibleReaderService,
    { provide: BIBLE_TEXT_PROVIDER, useClass: ApiBibleTextProvider },
  ],
})
export class BibleModule {}
