process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];

/**
 * `archiver` é ESM-only; o grafo do `FinancialModule` alcança
 * `export/zip-export.service.ts`, que importa `archiver` no topo do arquivo.
 * Mesma solução de `export/zip-export.service.spec.ts`.
 */
jest.mock('archiver', () => ({ ZipArchive: class {}, default: class {} }), { virtual: true });

import { Test } from '@nestjs/testing';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { FinancialModule } from './financial.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { RecurringRuleModule } from './recurring-rules/recurring-rule.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { PixController } from './pix.controller';
import { PixService } from './pix.service';
import { ForecastService } from './forecast.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DreController } from './dre.controller';
import { DreService } from './dre.service';
import { DrePdfService } from './dre-pdf.service';
import { ExportController } from './export/export.controller';
import { ExportService } from './export/export.service';
import { PdfExportService } from './export/pdf-export.service';
import { ZipExportService } from './export/zip-export.service';
import { SpedExportService } from './export/sped-export.service';
import { JobsService } from './export/jobs.service';

describe('FinancialModule', () => {
  it('compila e registra todos os controllers e providers', async () => {
    const moduleRef = await Test.createTestingModule({
      // PixController usa `@UseGuards(ThrottlerGuard)` — o próprio guard
      // precisa do ThrottlerModule no grafo de DI para o módulo compilar.
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        PrismaModule,
        HttpModule,
        StorageModule,
        RecurringRuleModule,
        FinancialModule,
      ],
    }).compile();

    expect(moduleRef.get(CategoriesController)).toBeInstanceOf(CategoriesController);
    expect(moduleRef.get(CategoriesService)).toBeInstanceOf(CategoriesService);
    expect(moduleRef.get(TransactionsController)).toBeInstanceOf(TransactionsController);
    expect(moduleRef.get(TransactionsService)).toBeInstanceOf(TransactionsService);
    expect(moduleRef.get(PixController)).toBeInstanceOf(PixController);
    expect(moduleRef.get(PixService)).toBeInstanceOf(PixService);
    expect(moduleRef.get(ForecastService)).toBeInstanceOf(ForecastService);
    expect(moduleRef.get(DashboardController)).toBeInstanceOf(DashboardController);
    expect(moduleRef.get(DashboardService)).toBeInstanceOf(DashboardService);
    expect(moduleRef.get(DreController)).toBeInstanceOf(DreController);
    expect(moduleRef.get(DreService)).toBeInstanceOf(DreService);
    expect(moduleRef.get(DrePdfService)).toBeInstanceOf(DrePdfService);
    expect(moduleRef.get(ExportController)).toBeInstanceOf(ExportController);
    expect(moduleRef.get(ExportService)).toBeInstanceOf(ExportService);
    expect(moduleRef.get(PdfExportService)).toBeInstanceOf(PdfExportService);
    expect(moduleRef.get(ZipExportService)).toBeInstanceOf(ZipExportService);
    expect(moduleRef.get(SpedExportService)).toBeInstanceOf(SpedExportService);
    expect(moduleRef.get(JobsService)).toBeInstanceOf(JobsService);

    await moduleRef.close();
  });
});
