import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanGuard } from '../auth/guards/plan.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequiresPlan } from '../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { PRODUCT_AREA_READ_ROLES } from '../auth/product-areas';
import { DonationReceiptService } from './donation-receipts.service';
import { AnnualDonationReportService } from './annual-donation-report.service';
import { ListDonationReceiptsQueryDto } from './dto/list-donation-receipts-query.dto';
import { AnnualDonationReportQueryDto } from './dto/annual-donation-report-query.dto';

const READ_ROLES = PRODUCT_AREA_READ_ROLES.financial;

// Recibo automático por e-mail/PDF é Premium — `pricing-church-platform.md`
// §5.2. A geração em si acontece fora de request (após o webhook da Asaas
// confirmar o pagamento, ver `PixService.handleWebhook`); este controller só
// expõe a lista já gerada e o link de download.
@Controller('financial/donation-receipts')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class DonationReceiptsController {
  constructor(
    private readonly donationReceiptService: DonationReceiptService,
    private readonly annualDonationReportService: AnnualDonationReportService,
  ) {}

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListDonationReceiptsQueryDto, @CurrentUser() user: JwtPayload) {
    return this.donationReceiptService.list(user.tenant_id, query.page, query.page_size);
  }

  @Get(':id/download')
  @Roles(...READ_ROLES)
  download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload) {
    return this.donationReceiptService.getDownloadUrl(user.tenant_id, id);
  }

  // Rota literal antes da de `:personId` — precisa vir primeiro no
  // controller para o router não tentar casar "summary" como personId.
  @Get('annual/summary')
  @Roles(...READ_ROLES)
  annualSummary(@Query() query: AnnualDonationReportQueryDto, @CurrentUser() user: JwtPayload) {
    return this.annualDonationReportService.listDonorsForYear(user.tenant_id, query.year);
  }

  @Get('annual/:personId')
  @Roles(...READ_ROLES)
  async annualReport(
    @Param('personId', ParseUUIDPipe) personId: string,
    @Query() query: AnnualDonationReportQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.annualDonationReportService.generatePdf(user.tenant_id, personId, query.year);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="carne-dizimista-${query.year}.pdf"`,
    });
    return new StreamableFile(buffer);
  }
}
