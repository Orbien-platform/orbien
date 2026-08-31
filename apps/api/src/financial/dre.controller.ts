import { Body, Controller, Get, Post, Query, Res, StreamableFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DreService } from './dre.service';
import { DrePdfService } from './dre-pdf.service';
import { DreQueryDto } from './dto/dre-query.dto';

const DRE_ROLES = ['tesoureiro', 'admin_congregation', 'pastor', 'tenant_admin'] as const;

@Controller('financial/dre')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class DreController {
  constructor(
    private readonly dreService: DreService,
    private readonly drePdfService: DrePdfService,
  ) {}

  @Get()
  @Roles(...DRE_ROLES)
  getDre(@Query() query: DreQueryDto, @CurrentUser() user: JwtPayload) {
    const isPastor = user.roles.includes('pastor') && !user.roles.some((r) => ['admin_congregation', 'tenant_admin', 'tesoureiro'].includes(r));
    return this.dreService.buildDre(
      user.tenant_id,
      user.congregation_id,
      query,
      isPastor,
    );
  }

  @Post('export/pdf')
  @Roles(...DRE_ROLES)
  async exportPdf(
    @Body() query: DreQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const buffer = await this.drePdfService.generatePdf(
      user.tenant_id,
      user.congregation_id,
      query,
    );
    const s = query.period_start.replace(/-/g, '').slice(0, 6);
    const e = query.period_end.replace(/-/g, '').slice(0, 6);
    const filename = `orbien_dre_${s}${s === e ? '' : '_' + e}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(buffer);
  }
}
