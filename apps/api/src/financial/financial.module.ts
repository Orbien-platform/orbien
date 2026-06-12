import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
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

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [
    CategoriesController,
    TransactionsController,
    PixController,
    DashboardController,
    DreController,
  ],
  providers: [
    CategoriesService,
    TransactionsService,
    PixService,
    ForecastService,
    DashboardService,
    DreService,
  ],
})
export class FinancialModule {}
