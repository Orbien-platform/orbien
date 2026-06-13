import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { PersonsImportService } from './persons-import.service';
import { ImportConfirmDto } from '../dto/import-confirm.dto';

const IMPORT_ROLES = ['admin_congregation', 'tenant_admin', 'secretary'] as const;

@Controller('persons/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class PersonsImportController {
  constructor(private readonly importService: PersonsImportService) {}

  @Post()
  @Roles(...IMPORT_ROLES)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadPreview(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importService.preview(file, user.tenant_id);
  }

  @Post('confirm')
  @Roles(...IMPORT_ROLES)
  confirmImport(
    @Body() dto: ImportConfirmDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importService.confirm(dto, user);
  }

  @Get('jobs/:id')
  @Roles(...IMPORT_ROLES)
  findJob(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.importService.findJob(user.tenant_id, user.congregation_id, id);
  }
}
