import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { memoryStorage } from 'multer';
import { UploadTicketRoute } from '../auth/decorators/upload-ticket.decorator';
import { UploadMeetingMaterialDto } from './dto/upload-meeting-material.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CreateMeetingMaterialDto } from './dto/create-meeting-material.dto';
import { MeetingCheckinDto } from './dto/meeting-checkin.dto';

const MEETING_WRITE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary', 'cell_leader'];
const MEETING_READ_ROLES = [...MEETING_WRITE_ROLES, 'treasurer'];
// Só pra listar os encontros do grupo (MOB-09-10) — não pro detalhe de um
// encontro (`findOne`, que devolve attendanceRecords sem o filtro de
// visibility que listMaterials já aplica). `member` continua sem acesso a
// findOne de propósito.
//
// `member` só enxerga os encontros do **próprio** grupo: o `@Roles` aqui
// autoriza qualquer `member` a chamar a rota, e é o `MeetingsService` quem
// confere `GroupMembership` real antes de responder para quem não está em
// `MEETING_READ_ROLES` (que continuam vendo grupos que não lideram, por
// desenho). Fechava uma lacuna que ficou registrada em `docs/PENDENCIAS.md`
// desde o MOB-09-09: `member` de qualquer grupo — ou de nenhum — conseguia
// listar encontros e materiais `visibility: all` de qualquer outro grupo do
// tenant.
const MEETING_LIST_READ_ROLES = [...MEETING_READ_ROLES, 'member'];
const MEETING_ADMIN_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];
const MATERIAL_WRITE_ROLES = ['cell_leader', 'admin_congregation', 'tenant_admin'];
/** Segundos. Tempo de pegar o ticket e começar a subir, não de subir. */
const UPLOAD_TICKET_TTL = 300;
const MATERIAL_FILE_MAX_BYTES = 50 * 1024 * 1024;
const MATERIAL_READ_ROLES = ['member', ...MATERIAL_WRITE_ROLES];

@Controller('small-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class MeetingsController {
  constructor(
    private readonly meetingsService: MeetingsService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('meetings')
  @Roles(...MEETING_WRITE_ROLES)
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: JwtPayload) {
    return this.meetingsService.create(dto, user);
  }

  @Get('meetings/:meetingId')
  @Roles(...MEETING_READ_ROLES)
  findOne(@Param('meetingId', ParseUUIDPipe) meetingId: string) {
    return this.meetingsService.findOne(meetingId);
  }

  @Patch('meetings/:meetingId')
  @Roles(...MEETING_WRITE_ROLES)
  update(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(meetingId, dto);
  }

  @Get(':groupId/materials')
  @Roles(...MATERIAL_READ_ROLES)
  listGroupMaterials(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.listGroupMaterials(groupId, user);
  }

  @Get(':groupId/meetings')
  @Roles(...MEETING_LIST_READ_ROLES)
  findByGroup(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.findByGroup(groupId, user);
  }

  @Post('meetings/:meetingId/attendance')
  @Roles(...MEETING_WRITE_ROLES)
  recordAttendance(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: RecordAttendanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.recordAttendance(meetingId, dto, user);
  }

  @Delete('meetings/:meetingId/attendance/:personId')
  @Roles(...MEETING_ADMIN_ROLES)
  removeAttendance(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('personId', ParseUUIDPipe) personId: string,
  ) {
    return this.meetingsService.removeAttendance(meetingId, personId);
  }

  // PROD-12: o líder gera/regenera o QR deste encontro — mesmos papéis que já
  // escrevem presença manualmente em recordAttendance.
  @Post('meetings/:meetingId/checkin-token')
  @Roles(...MEETING_WRITE_ROLES)
  createCheckinToken(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.createCheckinToken(meetingId, user);
  }

  // PROD-12: o membro escaneia o QR. Sem :meetingId no path — o token já
  // identifica o encontro —, e sem bypass de papel: MeetingsService exige
  // GroupMembership real mesmo para quem está em MEETING_LIST_READ_ROLES por
  // liderar outras células.
  @Post('meetings/checkin')
  @Roles(...MEETING_LIST_READ_ROLES)
  checkin(@Body() dto: MeetingCheckinDto, @CurrentUser() user: JwtPayload) {
    return this.meetingsService.checkin(dto, user);
  }

  @Post('meetings/:meetingId/materials')
  @Roles(...MATERIAL_WRITE_ROLES)
  addMaterial(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body() dto: CreateMeetingMaterialDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.addMaterial(meetingId, dto, user);
  }

  /**
   * Ticket para subir o arquivo direto na API, fora do `/api-proxy` (teto de
   * 4,5 MB na Vercel) — mesmo desenho de `POST /content/posts/:id/upload-ticket`
   * (ver DEPLOY.md). Preso a esta reunião: recusado em qualquer outra rota. O
   * `:id` tem esse nome porque o `RolesGuard` compara `upload_target` com
   * `params.id`.
   */
  @Post('meetings/:id/materials/upload-ticket')
  @Roles(...MATERIAL_WRITE_ROLES)
  async materialUploadTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ upload_token: string; expires_in: number }> {
    // Reunião inexistente (ou de outra congregação, pelo RLS) e líder de outro
    // PG falham aqui, não depois de 50 MB pela rede.
    await this.meetingsService.assertCanManageMaterials(id, user);

    const payload: JwtPayload = {
      sub: user.sub,
      tenant_id: user.tenant_id,
      congregation_id: user.congregation_id,
      roles: [],
      plan: user.plan,
      scope: 'upload',
      upload_kind: 'meeting_material',
      upload_target: id,
      ...(user.impersonated_by ? { impersonated_by: user.impersonated_by } : {}),
      ...(user.support_session ? { support_session: true } : {}),
    };
    return {
      upload_token: this.jwtService.sign(payload, { expiresIn: UPLOAD_TICKET_TTL }),
      expires_in: UPLOAD_TICKET_TTL,
    };
  }

  @Post('meetings/:id/materials/upload')
  @Roles(...MATERIAL_WRITE_ROLES)
  @UploadTicketRoute('meeting_material')
  @UseInterceptors(
    FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MATERIAL_FILE_MAX_BYTES } }),
  )
  uploadMaterial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadMeetingMaterialDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.uploadMaterial(id, dto, file, user);
  }

  @Get('meetings/:meetingId/materials')
  @Roles(...MATERIAL_READ_ROLES)
  listMaterials(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.listMaterials(meetingId, user);
  }

  @Delete('meetings/:meetingId/materials/:materialId')
  @Roles(...MATERIAL_WRITE_ROLES)
  removeMaterial(
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.meetingsService.removeMaterial(meetingId, materialId, user);
  }
}
