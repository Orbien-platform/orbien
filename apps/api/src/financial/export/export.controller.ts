import {
  BadRequestException,
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
import { PdfExportService } from './pdf-export.service';
import { ZipExportService } from './zip-export.service';
import { SpedExportService } from './sped-export.service';
import { JobsService } from './jobs.service';
import { StorageService } from '../../storage/storage.service';
import { ExportRequestDto } from './dto/export-request.dto';
import { PdfExportRequestDto } from './dto/pdf-export-request.dto';

const EXT_BY_JOB_TYPE: Record<string, string> = {
  csv: 'csv',
  ofx: 'ofx',
  pdf: 'pdf',
  zip: 'zip',
  sped: 'txt',
  dre: 'pdf',
};

const EXPORT_ROLES = ['tesoureiro', 'admin_congregation', 'tenant_admin'] as const;

@Controller('financial/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly pdfExportService: PdfExportService,
    private readonly zipExportService: ZipExportService,
    private readonly spedExportService: SpedExportService,
    private readonly jobsService: JobsService,
    private readonly storageService: StorageService,
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

  @Post('pdf')
  @Roles(...EXPORT_ROLES)
  async exportPdf(
    @Body() dto: PdfExportRequestDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { job_id: string; status: string }> {
    const result = await this.pdfExportService.exportPdf(
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

  @Post('zip')
  @Roles(...EXPORT_ROLES)
  async exportZip(
    @Body() dto: ExportRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ job_id: string; status: string }> {
    const result = await this.zipExportService.exportZip(
      user.tenant_id,
      user.congregation_id,
      dto,
      user.sub,
    );
    return { job_id: result.job_id, status: result.status };
  }

  @Post('sped')
  @Roles(...EXPORT_ROLES)
  async exportSped(
    @Body() dto: ExportRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ job_id: string; status: string }> {
    const result = await this.spedExportService.exportSped(
      user.tenant_id,
      user.congregation_id,
      dto,
      user.sub,
    );
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

  @Get('jobs/:id/download')
  @Roles(...EXPORT_ROLES)
  async downloadJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ download_url: string; expires_in: number }> {
    const job = await this.jobsService.findOne(user.tenant_id, user.congregation_id, id);
    if (job.status !== 'done') {
      throw new BadRequestException('Job ainda não concluído');
    }
    const ext = EXT_BY_JOB_TYPE[job.type] ?? 'bin';
    const key = `exports/${user.tenant_id}/${id}.${ext}`;
    const downloadUrl = await this.storageService.getPresignedGetUrl(key, 3600);
    return { download_url: downloadUrl, expires_in: 3600 };
  }
}
