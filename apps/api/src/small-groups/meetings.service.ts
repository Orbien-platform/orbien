import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MeetingMaterialNotifier } from './meeting-material.notifier';
import { StorageService } from '../storage/storage.service';
import { UploadMeetingMaterialDto } from './dto/upload-meeting-material.dto';
import { assertMaterialFile } from '../study-materials/material-file';
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

/** Segundos. Dá tempo de abrir o arquivo; link copiado e guardado expira. */
const LEADERS_FILE_URL_TTL = 15 * 60;

const MATERIAL_LEADER_ROLES = ['cell_leader', 'admin_congregation', 'tenant_admin'];
// Os dois papéis que mexem em material de qualquer PG da congregação. Os demais
// (`cell_leader`) só mexem no do PG que lideram — o RLS filtra por congregação,
// não por papel.
const MATERIAL_ADMIN_ROLES = ['tenant_admin', 'admin_congregation'];

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: MeetingMaterialNotifier,
    private readonly storage: StorageService,
  ) {}

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

  /**
   * Confere que o encontro existe e que quem escreve pode mexer no material
   * dele: administração de qualquer PG da congregação; `cell_leader` só do PG
   * que lidera (líder titular do PG, ou `leader`/`trainee` na membership).
   * Devolve o PG do encontro.
   */
  async assertCanManageMaterials(meetingId: string, user: JwtPayload): Promise<string> {
    const meeting = await this.prisma.client.groupMeeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        small_group_id: true,
        smallGroup: { select: { leader_person_id: true } },
      },
    });
    if (!meeting) throw new NotFoundException('Reunião não encontrada');

    if (user.roles.some((role) => MATERIAL_ADMIN_ROLES.includes(role))) {
      return meeting.small_group_id;
    }

    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    const personId = account?.person_id;
    if (personId && personId === meeting.smallGroup.leader_person_id) {
      return meeting.small_group_id;
    }

    const membership = personId
      ? await this.prisma.client.groupMembership.findUnique({
          where: {
            small_group_id_person_id: { small_group_id: meeting.small_group_id, person_id: personId },
          },
          select: { role: true },
        })
      : null;
    if (!membership || !['leader', 'trainee'].includes(membership.role)) {
      throw new ForbiddenException('Só quem lidera este grupo pode enviar material para ele');
    }
    return meeting.small_group_id;
  }

  async addMaterial(
    meetingId: string,
    dto: CreateMeetingMaterialDto,
    user: JwtPayload,
  ): Promise<GroupMeetingMaterial> {
    await this.assertCanManageMaterials(meetingId, user);

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

    const releaseAt = dto.release_at ? new Date(dto.release_at) : null;
    const releasedNow = !releaseAt || releaseAt.getTime() <= Date.now();

    const link = await this.prisma.client.groupMeetingMaterial.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        meeting_id: meetingId,
        material_id: dto.material_id,
        visibility: dto.visibility ?? MaterialVisibility.all,
        release_at: releaseAt,
      },
    });

    // Liberado agora: avisa já. Agendado: o cron do notifier avisa na data.
    if (releasedNow) await this.notifier.notifyLink(link.id);
    return link;
  }

  /**
   * Cria o material a partir do arquivo enviado e já o vincula ao encontro,
   * num passo só — o líder de PG não tem `POST /study-materials` (é do
   * administrativo), e o alvo aqui é sempre o PG do encontro.
   */
  async uploadMaterial(
    meetingId: string,
    dto: UploadMeetingMaterialDto,
    file: Express.Multer.File | undefined,
    user: JwtPayload,
  ): Promise<GroupMeetingMaterial> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    const { ext, source } = assertMaterialFile(file);

    const smallGroupId = await this.assertCanManageMaterials(meetingId, user);

    const key = `${user.tenant_id}/materials/${randomUUID()}${ext}`;
    const file_url = await this.storage.upload(file.buffer, key, file.mimetype);

    const releaseAt = dto.release_at ? new Date(dto.release_at) : null;
    let link: GroupMeetingMaterial;
    try {
      link = await this.prisma.runInTx(
        async (tx) => {
          const material = await tx.studyMaterial.create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              title: dto.title.trim(),
              source_type: source,
              file_url,
              // O material espelha o vínculo: sem isso o `publishPending` e a
              // listagem do PG (`listGroupMaterials`) tratariam um material
              // "só líderes" ou agendado como público e já liberado.
              visibility: dto.visibility ?? MaterialVisibility.all,
              publish_at: releaseAt ?? new Date(),
              // O aviso é do `MeetingMaterialNotifier`, por vínculo.
              notified_at: new Date(),
              tags: [],
            },
          });
          await tx.materialTarget.create({
            data: { study_material_id: material.id, small_group_id: smallGroupId },
          });
          return tx.groupMeetingMaterial.create({
            data: {
              tenant_id: user.tenant_id,
              congregation_id: user.congregation_id,
              meeting_id: meetingId,
              material_id: material.id,
              visibility: dto.visibility ?? MaterialVisibility.all,
              release_at: releaseAt,
            },
            include: { material: true },
          });
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (err) {
      // Sem linha no banco o arquivo ficaria órfão no bucket.
      await this.storage.deleteByUrl(file_url);
      throw err;
    }

    if (!releaseAt || releaseAt.getTime() <= Date.now()) {
      await this.notifier.notifyLink(link.id);
    }
    return link;
  }

  /**
   * Materiais que alcançam o PG (`material_targets`), independentes de
   * encontro — é por aqui que o material de uma rede ou de todas as redes
   * chega ao PG. Mesma regra de `listMaterials`: líder vê tudo, inclusive o
   * agendado e o "só líderes"; membro precisa participar do PG e só enxerga o
   * publicado, não expirado e de visibilidade `all`.
   */
  async listGroupMaterials(groupId: string, user: JwtPayload) {
    const isLeader = user.roles.some((role) => MATERIAL_LEADER_ROLES.includes(role));
    if (!isLeader) {
      await this.assertParticipant(groupId, user.sub);
    }

    const now = new Date();
    const materials = await this.prisma.client.studyMaterial.findMany({
      where: {
        materialTargets: { some: { small_group_id: groupId } },
        ...(isLeader
          ? {}
          : {
              visibility: MaterialVisibility.all,
              publish_at: { lte: now },
              OR: [{ expires_at: null }, { expires_at: { gt: now } }],
            }),
      },
      orderBy: { publish_at: 'desc' },
    });
    return Promise.all(materials.map((m) => this.withSignedFile(m)));
  }

  /**
   * Material "só líderes" com arquivo sai da listagem com URL assinada de
   * curta duração, em vez da URL pública do R2. A URL pública continua válida
   * enquanto o bucket for público: o ganho completo vem de tornar o bucket
   * privado, e essa troca não exige mudar o código nem o app.
   */
  private async withSignedFile<T extends { visibility: MaterialVisibility; file_url: string | null }>(
    material: T,
    visibility: MaterialVisibility = material.visibility,
  ): Promise<T> {
    if (visibility !== MaterialVisibility.leaders_only || !material.file_url) return material;
    const key = this.storage.keyFromUrl(material.file_url);
    if (!key) return material;
    const file_url = await this.storage.getPresignedGetUrl(key, LEADERS_FILE_URL_TTL);
    return { ...material, file_url };
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

    const links = await this.prisma.client.groupMeetingMaterial.findMany({
      where: {
        meeting_id: meetingId,
        ...(isLeader
          ? {}
          : {
              visibility: MaterialVisibility.all,
              OR: [{ release_at: null }, { release_at: { lte: new Date() } }],
            }),
      },
      include: { material: true },
      orderBy: { created_at: 'asc' },
    });
    // A visibilidade que vale é a do vínculo (a do material é a do cadastro).
    return Promise.all(
      links.map(async (link) => ({
        ...link,
        material: await this.withSignedFile(link.material, link.visibility),
      })),
    );
  }

  async removeMaterial(
    meetingId: string,
    materialId: string,
    user: JwtPayload,
  ): Promise<GroupMeetingMaterial> {
    // A reunião vem primeiro de propósito. `group_meetings` tem a policy
    // `tenant_congregation_isolation`; `group_meeting_materials` tem só a de
    // tenant. Sem esta leitura, o DELETE encontrava o vínculo pela chave
    // (meeting_id, material_id) e apagava material de reunião de outra
    // congregação do mesmo tenant. `assertCanManageMaterials` faz essa leitura
    // e ainda confere que quem remove lidera o PG (ou administra).
    await this.assertCanManageMaterials(meetingId, user);

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
