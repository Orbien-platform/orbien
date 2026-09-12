import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceRecord, GroupMeeting, GroupMeetingMaterial, MaterialVisibility } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { RecordAttendanceDto } from './dto/record-attendance.dto';
import { CreateMeetingMaterialDto } from './dto/create-meeting-material.dto';

type CreateMeetingResult = {
  meeting: GroupMeeting;
  attendance_count: number;
};

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

    if (!membership) {
      throw new ForbiddenException('Você não participa deste grupo');
    }
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
}
