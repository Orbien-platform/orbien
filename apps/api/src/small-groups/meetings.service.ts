import { randomUUID } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecord, GroupMeeting, GroupMeetingMaterial, MaterialVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CreateMeetingMaterialDto } from './dto/create-meeting-material.dto';
import { MeetingCheckinDto } from './dto/meeting-checkin.dto';

type CreateMeetingResult = {
  meeting: GroupMeeting;
  attendance_count: number;
};

type CheckinTokenResult = {
  token: string;
  expires_at: Date;
};

type CheckinResult = {
  status: 'checked_in' | 'already_checked_in';
  group_meeting_id: string;
};

// PROD-12: janela de validade do QR de check-in. Curta de propósito — o QR
// vale para a reunião em curso, não é um link permanente como `QrToken` do
// cadastro de visitante. O líder regenera (mesma rota, `upsert`) se precisar
// de mais tempo.
const CHECKIN_TOKEN_TTL_MINUTES = 240;

// Não é a mesma checagem que a expiração do token faz — esta impede GERAR um
// QR novo para um encontro que já passou há muito tempo (lançado tarde, de
// forma manual, como o restante do módulo permite via `occurred_at` livre).
// Sem isto, "encontro que já fechou" só seria barrado se alguém tivesse
// deixado um token antigo ainda válido por acaso.
const CHECKIN_MAX_MEETING_AGE_HOURS = 24;

const MATERIAL_LEADER_ROLES = ['cell_leader', 'admin_congregation', 'tenant_admin'];

// Espelha `MEETING_READ_ROLES` do controller — papéis de liderança que já
// enxergam grupos que não lideram (ex.: `pastor`/`secretary` cobrindo a rede
// toda) e por isso não passam pela checagem de participação de
// `assertParticipant`. Só `member` (o resto de `MEETING_LIST_READ_ROLES`)
// precisa provar `GroupMembership` real. Duplicado em vez de importado do
// controller pelo mesmo motivo que `MATERIAL_LEADER_ROLES` já é: o service é
// testado sem instanciar o controller.
const MEETING_PRIVILEGED_ROLES = [
  'tenant_admin',
  'admin_congregation',
  'pastor',
  'secretary',
  'cell_leader',
  'treasurer',
];

@Injectable()
export class MeetingsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateMeetingDto,
    user: JwtPayload,
  ): Promise<CreateMeetingResult> {
    const group = await this.prisma.client.smallGroup.findUnique({
      where: { id: dto.small_group_id },
      select: { id: true },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    return this.prisma.runInTx(
      async (tx) => {
        const meeting = await tx.groupMeeting.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            small_group_id: dto.small_group_id,
            occurred_at: new Date(dto.occurred_at),
            topic: dto.topic,
            observations: dto.observations,
            offering_amount: dto.offering_amount,
          },
        });

        let attendance_count = 0;

        if (dto.attendee_ids && dto.attendee_ids.length > 0) {
          const result = await tx.attendanceRecord.createMany({
            data: dto.attendee_ids.map((person_id) => ({
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              group_meeting_id: meeting.id,
              person_id,
            })),
            skipDuplicates: true,
          });
          attendance_count = result.count;
        }

        return { meeting, attendance_count };
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async findByGroup(groupId: string, user: JwtPayload) {
    const isPrivileged = user.roles.some((role) => MEETING_PRIVILEGED_ROLES.includes(role));
    if (!isPrivileged) {
      await this.assertParticipant(groupId, user.sub);
    }

    return this.prisma.client.groupMeeting.findMany({
      where: { small_group_id: groupId },
      orderBy: { occurred_at: 'desc' },
      include: {
        _count: { select: { attendanceRecords: true } },
      },
    });
  }

  /**
   * `member` só participa de um grupo por vez, mas nada nas rotas de
   * encontro/material recebia `person_id` para conferir isso — o `@Roles`
   * liberava qualquer `member`, de qualquer grupo ou de nenhum. Resolve a
   * pessoa pela conta autenticada (mesmo caminho de
   * `CelebrationAssignmentService.resolvePersonId`) e exige `GroupMembership`
   * real no grupo pedido.
   */
  private async assertParticipant(groupId: string, userId: string): Promise<void> {
    await this.resolveParticipantPersonId(groupId, userId);
  }

  /**
   * Mesma checagem de `assertParticipant`, mas devolvendo o `person_id` —
   * o check-in por QR (PROD-12) precisa dele para gravar o `AttendanceRecord`.
   * Participação, não papel (mesmo princípio de `PEND-01`/`PROD-01`): quem não
   * tem `GroupMembership` real na célula do encontro não se auto-marca
   * presente, papel de liderança incluído — diferente de `findByGroup`, aqui
   * não existe bypass para `MEETING_PRIVILEGED_ROLES`.
   */
  private async resolveParticipantPersonId(groupId: string, userId: string): Promise<string> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });

    const membership = account?.person_id
      ? await this.prisma.client.groupMembership.findUnique({
          where: {
            small_group_id_person_id: {
              small_group_id: groupId,
              person_id: account.person_id,
            },
          },
          select: { id: true },
        })
      : null;

    if (!membership || !account?.person_id) {
      throw new ForbiddenException('Você não participa deste grupo');
    }

    return account.person_id;
  }

  async findOne(meetingId: string) {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      include: {
        attendanceRecords: {
          include: { person: true },
        },
        materials: {
          include: { material: true },
        },
      },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');
    return meeting;
  }

  async update(meetingId: string, dto: UpdateMeetingDto): Promise<GroupMeeting> {
    const existing = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Reunião não encontrada');

    return this.prisma.client.groupMeeting.update({
      where: { id: meetingId },
      data: {
        ...dto,
        occurred_at: dto.occurred_at ? new Date(dto.occurred_at) : undefined,
      },
    });
  }

  async recordAttendance(
    meetingId: string,
    dto: RecordAttendanceDto,
    user: JwtPayload,
  ): Promise<{ added: number }> {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const result = await this.prisma.client.attendanceRecord.createMany({
      data: dto.person_ids.map((person_id) => ({
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        group_meeting_id: meetingId,
        person_id,
      })),
      skipDuplicates: true,
    });

    return { added: result.count };
  }

  async removeAttendance(
    meetingId: string,
    personId: string,
  ): Promise<AttendanceRecord> {
    const record = await this.prisma.client.attendanceRecord.findUnique({
      where: {
        group_meeting_id_person_id: {
          group_meeting_id: meetingId,
          person_id: personId,
        },
      },
    });
    if (!record) throw new NotFoundException('Registro de presença não encontrado');
    return this.prisma.client.attendanceRecord.delete({ where: { id: record.id } });
  }

  async addMaterial(
    meetingId: string,
    dto: CreateMeetingMaterialDto,
    user: JwtPayload,
  ): Promise<GroupMeetingMaterial> {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const material = await this.prisma.client.studyMaterial.findUnique({
      where: { id: dto.material_id },
      select: { id: true },
    });
    if (!material) throw new NotFoundException('Material de estudo não encontrado');

    const existing = await this.prisma.client.groupMeetingMaterial.findUnique({
      where: {
        meeting_id_material_id: {
          meeting_id: meetingId,
          material_id: dto.material_id,
        },
      },
    });
    if (existing) throw new ConflictException('Este material já está vinculado a esta reunião');

    return this.prisma.client.groupMeetingMaterial.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        meeting_id: meetingId,
        material_id: dto.material_id,
        visibility: dto.visibility ?? MaterialVisibility.all,
      },
    });
  }

  async listMaterials(meetingId: string, user: JwtPayload) {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true, small_group_id: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const isLeader = user.roles.some((role) => MATERIAL_LEADER_ROLES.includes(role));
    if (!isLeader) {
      await this.assertParticipant(meeting.small_group_id, user.sub);
    }

    return this.prisma.client.groupMeetingMaterial.findMany({
      where: {
        meeting_id: meetingId,
        ...(isLeader ? {} : { visibility: MaterialVisibility.all }),
      },
      include: { material: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async removeMaterial(
    meetingId: string,
    materialId: string,
  ): Promise<GroupMeetingMaterial> {
    // A reunião vem primeiro de propósito. `group_meetings` tem a policy
    // `tenant_congregation_isolation`; `group_meeting_materials` tem só a de
    // tenant. Sem esta leitura, o DELETE encontrava o vínculo pela chave
    // (meeting_id, material_id) e apagava material de reunião de outra
    // congregação do mesmo tenant. `addMaterial` e `listMaterials` já validavam
    // a reunião assim — só a remoção escapava.
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const link = await this.prisma.client.groupMeetingMaterial.findUnique({
      where: {
        meeting_id_material_id: {
          meeting_id: meetingId,
          material_id: materialId,
        },
      },
    });
    if (!link) throw new NotFoundException('Material não está vinculado a esta reunião');
    return this.prisma.client.groupMeetingMaterial.delete({ where: { id: link.id } });
  }

  /**
   * PROD-12: o líder gera (ou regenera) o QR de check-in do encontro. Um
   * token por `GroupMeeting` — chamar de novo rotaciona o valor e estende
   * `expires_at`, o que também serve para revogar o QR anterior (quem
   * escaneou o antigo recebe "inválido ou expirado" no próximo check-in).
   */
  async createCheckinToken(meetingId: string, user: JwtPayload): Promise<CheckinTokenResult> {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: { id: true, tenant_id: true, congregation_id: true, occurred_at: true },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    const cutoff = new Date(Date.now() - CHECKIN_MAX_MEETING_AGE_HOURS * 60 * 60 * 1000);
    if (meeting.occurred_at < cutoff) {
      throw new ConflictException('Este encontro já foi encerrado; não é possível gerar check-in por QR');
    }

    const token = randomUUID();
    const expires_at = new Date(Date.now() + CHECKIN_TOKEN_TTL_MINUTES * 60 * 1000);

    const checkinToken = await this.prisma.client.meetingCheckinToken.upsert({
      where: { group_meeting_id: meetingId },
      create: {
        tenant_id: meeting.tenant_id,
        congregation_id: meeting.congregation_id,
        group_meeting_id: meetingId,
        token,
        expires_at,
        created_by: user.sub,
      },
      update: {
        token,
        expires_at,
        created_by: user.sub,
      },
    });

    return { token: checkinToken.token, expires_at: checkinToken.expires_at };
  }

  /**
   * PROD-12: o membro escaneia o QR e a presença é gravada sozinha —
   * substitui a marcação manual só para quem participa de fato da célula.
   * `GroupMembership` real é obrigatório mesmo para papel de liderança (ver
   * `resolveParticipantPersonId`): o QR não é um atalho de `@Roles`, é prova
   * de presença de quem está na célula.
   */
  async checkin(dto: MeetingCheckinDto, user: JwtPayload): Promise<CheckinResult> {
    const checkinToken = await this.prisma.client.meetingCheckinToken.findUnique({
      where: { token: dto.token },
      select: {
        group_meeting_id: true,
        expires_at: true,
        tenant_id: true,
        congregation_id: true,
        groupMeeting: { select: { small_group_id: true } },
      },
    });

    if (!checkinToken || checkinToken.expires_at <= new Date()) {
      throw new NotFoundException('QR code inválido ou expirado');
    }

    const personId = await this.resolveParticipantPersonId(
      checkinToken.groupMeeting.small_group_id,
      user.sub,
    );

    const existing = await this.prisma.client.attendanceRecord.findUnique({
      where: {
        group_meeting_id_person_id: {
          group_meeting_id: checkinToken.group_meeting_id,
          person_id: personId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      return { status: 'already_checked_in', group_meeting_id: checkinToken.group_meeting_id };
    }

    await this.prisma.client.attendanceRecord.create({
      data: {
        tenant_id: checkinToken.tenant_id,
        congregation_id: checkinToken.congregation_id,
        group_meeting_id: checkinToken.group_meeting_id,
        person_id: personId,
      },
    });

    return { status: 'checked_in', group_meeting_id: checkinToken.group_meeting_id };
  }
}
