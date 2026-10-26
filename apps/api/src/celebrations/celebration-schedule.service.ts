import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  AssignmentStatus,
  CelebrationAssignment,
  CelebrationInstance,
  CelebrationMinistry,
  CelebrationSchedule,
  KidsSessionStatus,
  Prisma,
  ScheduleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CelebrationInstancesService } from './celebration-instances.service';
import { AddScheduleMinistryDto } from './dto/add-schedule-ministry.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import { countScheduledVolunteers, volunteersMissing } from '../kids/sessions/kids-staffing';

// A tela de escala precisa mostrar QUEM está escalado, não só quantos.
type AssignmentRow = CelebrationAssignment & {
  volunteerProfile: { id: string; person: { id: string; full_name: string } };
};

// Sessão kids ligada ao ministério da escala (spec P2 Escala).
type KidsSessionRef = {
  id: string;
  status: KidsSessionStatus;
  room: { id: string; name: string; min_volunteers: number };
};

type MinistryRow = CelebrationMinistry & {
  ministry: { id: string; name: string };
  assignments: AssignmentRow[];
  assigned_count: number;
  kids_session: {
    id: string;
    room_id: string;
    room_name: string;
    status: KidsSessionStatus;
    min_volunteers: number;
  } | null;
  /** Quantos voluntários faltam para o mínimo da turma; `null` sem sessão kids. */
  volunteers_missing: number | null;
};

type ScheduleDetail = CelebrationSchedule & { ministries: MinistryRow[] };

const SCHEDULE_INCLUDE = {
  ministries: {
    orderBy: { created_at: 'asc' },
    include: {
      ministry: { select: { id: true, name: true } },
      kidsSession: { select: { id: true, status: true, room: { select: { id: true, name: true, min_volunteers: true } } } },
      assignments: {
        orderBy: { created_at: 'asc' },
        include: {
          volunteerProfile: {
            select: { id: true, person: { select: { id: true, full_name: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CelebrationScheduleInclude;

@Injectable()
export class CelebrationScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instancesService: CelebrationInstancesService,
  ) {}

  private async assertInstance(tenantId: string, congregationId: string, instanceId: string) {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id: instanceId, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!instance) throw new NotFoundException('Instância de celebração não encontrada');
  }

  private toDetail(
    schedule: CelebrationSchedule & {
      ministries: (CelebrationMinistry & {
        ministry: { id: string; name: string };
        kidsSession?: KidsSessionRef | null;
        assignments: AssignmentRow[];
      })[];
    },
  ): ScheduleDetail {
    // Falta de voluntários (spec P2 Escala, AC 2): a sessão pode ter mais de um
    // vínculo na escala (ministérios diferentes), então os escalados são
    // somados por sessão, e não por linha.
    const staffingRows = schedule.ministries.flatMap((m) =>
      m.assignments.map((a) => ({
        status: a.status,
        volunteer_profile_id: a.volunteer_profile_id,
        celebrationMinistry: { kids_session_id: m.kids_session_id },
      })),
    );
    return {
      ...schedule,
      ministries: schedule.ministries.map(({ kidsSession, ...m }) => ({
        ...m,
        // `swapped` fica na lista (a liderança vê quem trocou), mas não ocupa
        // a vaga: quem assumiu tem a própria linha.
        assigned_count: m.assignments.filter((a) => a.status !== AssignmentStatus.swapped).length,
        kids_session: kidsSession
          ? {
              id: kidsSession.id,
              room_id: kidsSession.room.id,
              room_name: kidsSession.room.name,
              status: kidsSession.status,
              min_volunteers: kidsSession.room.min_volunteers,
            }
          : null,
        volunteers_missing: kidsSession
          ? volunteersMissing(kidsSession.room.min_volunteers, countScheduledVolunteers(staffingRows, kidsSession.id))
          : null,
      })),
    };
  }

  async createOrGet(tenantId: string, congregationId: string, instanceId: string): Promise<CelebrationSchedule> {
    await this.assertInstance(tenantId, congregationId, instanceId);

    const existing = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
    });
    if (existing) return existing;

    return this.prisma.client.celebrationSchedule.create({
      data: { tenant_id: tenantId, congregation_id: congregationId, celebration_instance_id: instanceId },
    });
  }

  async getSchedule(tenantId: string, congregationId: string, instanceId: string): Promise<ScheduleDetail> {
    await this.assertInstance(tenantId, congregationId, instanceId);

    const schedule = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
      include: SCHEDULE_INCLUDE,
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada para esta instância');

    return this.toDetail(schedule);
  }

  async addMinistry(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    dto: AddScheduleMinistryDto,
  ): Promise<CelebrationMinistry & { ministry: { id: string; name: string } }> {
    return this.prisma.runInTx(async (_tx) => {
      await this.assertInstance(tenantId, congregationId, instanceId);

      const schedule =
        (await this.prisma.client.celebrationSchedule.findUnique({
          where: { celebration_instance_id: instanceId },
        })) ??
        (await this.prisma.client.celebrationSchedule.create({
          data: { tenant_id: tenantId, congregation_id: congregationId, celebration_instance_id: instanceId },
        }));

      const ministry = await this.prisma.client.ministry.findFirst({
        where: { id: dto.ministry_id, tenant_id: tenantId, congregation_id: congregationId },
        select: { id: true },
      });
      if (!ministry) throw new NotFoundException('Ministério não encontrado');

      // Sessão kids (spec P2 Escala, AC 1): tem que ser desta MESMA instância,
      // do mesmo tenant e congregação — fora disso é 404, sem distinguir os casos.
      const kidsSessionId = dto.kids_session_id ?? null;
      if (kidsSessionId) {
        const session = await this.prisma.client.kidsSession.findFirst({
          where: {
            id: kidsSessionId,
            tenant_id: tenantId,
            congregation_id: congregationId,
            celebration_instance_id: instanceId,
          },
          select: { id: true, status: true },
        });
        if (!session) throw new NotFoundException('Sessão kids não encontrada nesta celebração');
        if (session.status === KidsSessionStatus.cancelled) {
          throw new UnprocessableEntityException('Sessão kids cancelada não recebe escala');
        }
      }

      // Um vínculo por (escala, ministério, sessão): o mesmo ministério "Kids"
      // escala N turmas, uma linha por turma (índices parciais na migration).
      const duplicate = await this.prisma.client.celebrationMinistry.findFirst({
        where: { schedule_id: schedule.id, ministry_id: dto.ministry_id, kids_session_id: kidsSessionId },
      });
      if (duplicate) throw new ConflictException('Ministério já vinculado à escala');

      try {
        return await this.prisma.client.celebrationMinistry.create({
          data: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            schedule_id: schedule.id,
            ministry_id: dto.ministry_id,
            slots: dto.slots,
            kids_session_id: kidsSessionId,
          },
          include: { ministry: { select: { id: true, name: true } } },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Ministério já vinculado à escala');
        }
        throw e;
      }
    });
  }

  /**
   * Remove a escala da instância. Ministérios e atribuições saem por cascata.
   * Não bloqueamos escala publicada: cancelar uma escala já divulgada é uma
   * ação legítima de administração — e é justamente aí que ela é necessária.
   */
  async remove(
    tenantId: string,
    congregationId: string,
    instanceId: string,
  ): Promise<CelebrationSchedule> {
    await this.assertInstance(tenantId, congregationId, instanceId);

    const schedule = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada para esta instância');

    return this.prisma.client.celebrationSchedule.delete({ where: { id: schedule.id } });
  }

  async removeMinistry(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    ministryId: string,
    kidsSessionId?: string,
  ): Promise<CelebrationMinistry> {
    await this.assertInstance(tenantId, congregationId, instanceId);

    const schedule = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada para esta instância');

    // Sem `kidsSessionId`, remove o vínculo comum; com ele, só o daquela sessão.
    const cm = await this.prisma.client.celebrationMinistry.findFirst({
      where: { schedule_id: schedule.id, ministry_id: ministryId, kids_session_id: kidsSessionId ?? null },
    });
    if (!cm) throw new NotFoundException('Ministério não encontrado na escala');

    return this.prisma.client.celebrationMinistry.delete({ where: { id: cm.id } });
  }

  async applyTemplate(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    dto: ApplyTemplateDto,
  ): Promise<ScheduleDetail> {
    return this.prisma.runInTx(async (_tx) => {
      await this.assertInstance(tenantId, congregationId, instanceId);

      const template = await this.prisma.client.scheduleTemplate.findFirst({
        where: { id: dto.template_id, tenant_id: tenantId, congregation_id: congregationId },
        include: { ministries: true },
      });
      if (!template) throw new NotFoundException('Template não encontrado');

      const schedule =
        (await this.prisma.client.celebrationSchedule.findUnique({
          where: { celebration_instance_id: instanceId },
        })) ??
        (await this.prisma.client.celebrationSchedule.create({
          data: { tenant_id: tenantId, congregation_id: congregationId, celebration_instance_id: instanceId },
        }));

      const already = await this.prisma.client.celebrationMinistry.findMany({
        where: { schedule_id: schedule.id },
        select: { ministry_id: true },
      });
      const alreadyIds = new Set(already.map((e) => e.ministry_id));

      const toAdd = template.ministries.filter((m) => !alreadyIds.has(m.ministry_id));
      if (toAdd.length > 0) {
        await this.prisma.client.celebrationMinistry.createMany({
          data: toAdd.map((m) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            schedule_id: schedule.id,
            ministry_id: m.ministry_id,
            slots: m.slots,
          })),
        });
      }

      const updated = await this.prisma.client.celebrationSchedule.findUnique({
        where: { id: schedule.id },
        include: SCHEDULE_INCLUDE,
      });

      return this.toDetail(updated!);
    });
  }

  // Materializa as instâncias do período (Fatia 2) e informa, para cada uma, o estado da
  // escala — sem criá-la. A escala nasce sob demanda quando o líder abre a instância (createOrGet).
  async materializePeriodWithStatus(
    tenantId: string,
    congregationId: string,
    celebrationId: string,
    from: Date,
    to: Date,
  ): Promise<Array<CelebrationInstance & { schedule_status: ScheduleStatus | null }>> {
    const instances = await this.instancesService.materializeInstancesForPeriod(
      tenantId,
      congregationId,
      celebrationId,
      from,
      to,
    );
    if (instances.length === 0) return [];

    const schedules = await this.prisma.client.celebrationSchedule.findMany({
      where: { celebration_instance_id: { in: instances.map((i) => i.id) } },
      select: { celebration_instance_id: true, status: true },
    });
    const statusByInstance = new Map(schedules.map((s) => [s.celebration_instance_id, s.status]));

    return instances.map((instance) => ({
      ...instance,
      schedule_status: statusByInstance.get(instance.id) ?? null,
    }));
  }
}
