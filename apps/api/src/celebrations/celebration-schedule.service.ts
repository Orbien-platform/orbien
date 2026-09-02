import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CelebrationAssignment,
  CelebrationInstance,
  CelebrationMinistry,
  CelebrationSchedule,
  ScheduleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CelebrationInstancesService } from './celebration-instances.service';
import { AddScheduleMinistryDto } from './dto/add-schedule-ministry.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';

// A tela de escala precisa mostrar QUEM está escalado, não só quantos.
type AssignmentRow = CelebrationAssignment & {
  volunteerProfile: { id: string; person: { id: string; full_name: string } };
};

type MinistryRow = CelebrationMinistry & {
  ministry: { id: string; name: string };
  assignments: AssignmentRow[];
  assigned_count: number;
};

type ScheduleDetail = CelebrationSchedule & { ministries: MinistryRow[] };

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
        assignments: AssignmentRow[];
      })[];
    },
  ): ScheduleDetail {
    return {
      ...schedule,
      ministries: schedule.ministries.map((m) => ({
        ...m,
        assigned_count: m.assignments.length,
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
      include: {
        ministries: {
          orderBy: { created_at: 'asc' },
          include: {
            ministry: { select: { id: true, name: true } },
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
      },
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

      const duplicate = await this.prisma.client.celebrationMinistry.findUnique({
        where: { schedule_id_ministry_id: { schedule_id: schedule.id, ministry_id: dto.ministry_id } },
      });
      if (duplicate) throw new ConflictException('Ministério já vinculado à escala');

      return this.prisma.client.celebrationMinistry.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          schedule_id: schedule.id,
          ministry_id: dto.ministry_id,
          slots: dto.slots,
        },
        include: { ministry: { select: { id: true, name: true } } },
      });
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
  ): Promise<CelebrationMinistry> {
    await this.assertInstance(tenantId, congregationId, instanceId);

    const schedule = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada para esta instância');

    const cm = await this.prisma.client.celebrationMinistry.findUnique({
      where: { schedule_id_ministry_id: { schedule_id: schedule.id, ministry_id: ministryId } },
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
        include: {
          ministries: {
            orderBy: { created_at: 'asc' },
            include: {
              ministry: { select: { id: true, name: true } },
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
        },
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
