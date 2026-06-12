import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ExportService } from './export.service';
import { JobsService } from './jobs.service';
import { ExportRequestDto } from './dto/export-request.dto';

const EXPORT_ROLES = ['treasurer', 'admin_congregation', 'tenant_admin'] as const;

@Controller('financial/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly jobsService: JobsService,
  ) {}

  @Post('csv')
  @Roles(...EXPORT_ROLES)
  async exportCsv(
    @Body() dto: ExportRequestDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { job_id: string; status: string }> {
    const result = await this.exportService.exportCsv(
      user.tenant_id,
      user.congregation_id,
      dto,
      user.sub,
    );

    if (result.type === 'file') {
      res.set({
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      });
      return new StreamableFile(result.buffer);
    }

    return { job_id: result.job_id, status: result.status };
  }

  @Post('ofx')
  @Roles(...EXPORT_ROLES)
  async exportOfx(
    @Body() dto: ExportRequestDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { job_id: string; status: string }> {
    const result = await this.exportService.exportOfx(
      user.tenant_id,
      user.congregation_id,
      dto,
      user.sub,
    );

    if (result.type === 'file') {
      res.set({
        'Content-Type': result.mimeType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      });
      return new StreamableFile(result.buffer);
    }

    return { job_id: result.job_id, status: result.status };
  }

  @Get('jobs/:id')
  @Roles(...EXPORT_ROLES)
  findJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.jobsService.findOne(user.tenant_id, user.congregation_id, id);
  }
}
