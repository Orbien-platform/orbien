import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
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
import { RecurringRuleModule } from './recurring-rules/recurring-rule.module';

@Module({
  imports: [PrismaModule, HttpModule, StorageModule, RecurringRuleModule],
  controllers: [
    CategoriesController,
    TransactionsController,
    PixController,
    DashboardController,
    DreController,
    ExportController,
  ],
  providers: [
    CategoriesService,
    TransactionsService,
    PixService,
    ForecastService,
    DashboardService,
    DreService,
    DrePdfService,
    ExportService,
    PdfExportService,
    ZipExportService,
    SpedExportService,
    JobsService,
  ],
})
export class FinancialModule {}
