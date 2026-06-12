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
import { ExportController } from './export/export.controller';
import { ExportService } from './export/export.service';
import { JobsService } from './export/jobs.service';

@Module({
  imports: [PrismaModule, HttpModule, StorageModule],
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
    ExportService,
    JobsService,
  ],
})
export class FinancialModule {}
