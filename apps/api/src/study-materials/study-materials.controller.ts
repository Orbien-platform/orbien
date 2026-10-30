import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { memoryStorage } from 'multer';
import { UploadTicketRoute } from '../auth/decorators/upload-ticket.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { StudyMaterialsService } from './study-materials.service';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { ListStudyMaterialsQueryDto } from './dto/list-study-materials-query.dto';

const WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];
const READ_ROLES = [...WRITE_ROLES, 'cell_leader'];
const STATS_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'cell_leader'];
const ALL_ROLES = [...READ_ROLES, 'member', 'treasurer'];

/** Segundos. Tempo de pegar o ticket e começar a subir, não de subir. */
const UPLOAD_TICKET_TTL = 300;
const FILE_MAX_BYTES = 50 * 1024 * 1024;

@Controller('study-materials')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class StudyMaterialsController {
  constructor(
    private readonly studyMaterialsService: StudyMaterialsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post()
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  create(
    @Body() dto: CreateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.create(dto, file, user);
  }

  /**
   * Ticket para subir o arquivo direto na API, fora do `/api-proxy` (teto de
   * 4,5 MB na Vercel) — mesmo desenho do upload de posts (ver DEPLOY.md). Não
   * há recurso a que prender o ticket (o material ainda não existe), então ele
   * é preso a um `upload_id` sorteado aqui, e o tipo `study_material` o impede de valer em outras rotas de upload.
   * O `:id` da rota tem esse nome porque o `RolesGuard` compara
   * `upload_target` com `params.id`.
   */
  @Post('upload-ticket')
  @Roles(...WRITE_ROLES)
  uploadTicket(@CurrentUser() user: JwtPayload): {
    upload_token: string;
    upload_id: string;
    expires_in: number;
  } {
    return this.signUploadTicket(user, randomUUID());
  }

  /**
   * Ticket para substituir o arquivo de um material que já existe: preso ao
   * `id` dele, e só vale em `PATCH upload/:id`.
   */
  @Post(':id/upload-ticket')
  @Roles(...WRITE_ROLES)
  async replaceTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.studyMaterialsService.findOne(id);
    return this.signUploadTicket(user, id);
  }

  private signUploadTicket(user: JwtPayload, upload_id: string) {
    const payload: JwtPayload = {
      sub: user.sub,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles: [],
      plan: user.plan,
      scope: 'upload',
      upload_kind: 'study_material',
      upload_target: upload_id,
      ...(user.impersonated_by ? { impersonated_by: user.impersonated_by } : {}),
      ...(user.support_session ? { support_session: true } : {}),
    };
    return {
      upload_token: this.jwtService.sign(payload, { expiresIn: UPLOAD_TICKET_TTL }),
      upload_id,
      expires_in: UPLOAD_TICKET_TTL,
    };
  }

  @Post('upload/:id')
  @Roles(...WRITE_ROLES)
  @UploadTicketRoute('study_material')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FILE_MAX_BYTES } }))
  createWithTicket(
    @Body() dto: CreateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.create(dto, file, user);
  }

  @Patch('upload/:id')
  @Roles(...WRITE_ROLES)
  @UploadTicketRoute('study_material')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: FILE_MAX_BYTES } }))
  updateWithTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.update(id, dto, file, user);
  }

  @Get()
  @Roles(...READ_ROLES)
  findAll(@Query() query: ListStudyMaterialsQueryDto) {
    return this.studyMaterialsService.findAll(query);
  }

  @Get(':id/stats')
  @Roles(...STATS_ROLES)
  getOpenStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.getOpenStats(id);
  }

  @Get(':id/versions')
  @Roles(...READ_ROLES)
  getVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.getVersions(id);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.findOne(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudyMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.update(id, dto, file, user);
  }

  @Delete(':id')
  @Roles('tenant_admin', 'admin_congregation')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.studyMaterialsService.remove(id);
  }

  @Post(':id/open')
  @Roles(...ALL_ROLES)
  recordOpen(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.studyMaterialsService.recordOpen(id, user);
  }
}
