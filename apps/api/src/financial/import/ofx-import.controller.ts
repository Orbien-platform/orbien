import { Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { PlanGuard } from '../../auth/guards/plan.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequiresPlan } from '../../auth/decorators/requires-plan.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { OfxImportService } from './ofx-import.service';
import { ListUnmatchedQueryDto } from './dto/list-unmatched-query.dto';

const IMPORT_ROLES = ['treasurer', 'admin_congregation', 'tenant_admin'] as const;

// Conciliação bancária é Premium, mesmo portão do resto do financeiro
// (DRE, exportação contábil, forecast) — `docs/produto/pricing-church-platform.md` §5.2.
@Controller('financial/import')
@UseGuards(JwtAuthGuard, RolesGuard, PlanGuard)
@UseInterceptors(TenantContextInterceptor)
@RequiresPlan('premium')
export class OfxImportController {
  constructor(private readonly ofxImportService: OfxImportService) {}

  @Post('ofx')
  @Roles(...IMPORT_ROLES)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  importOfx(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: JwtPayload) {
    return this.ofxImportService.importOfx(file, user);
  }

  @Get('ofx/unmatched')
  @Roles(...IMPORT_ROLES)
  findUnmatched(@Query() query: ListUnmatchedQueryDto, @CurrentUser() user: JwtPayload) {
    return this.ofxImportService.findUnmatched(query, user);
  }
}
