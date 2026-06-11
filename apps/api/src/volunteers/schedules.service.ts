import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScheduleAssignment, ScheduleSlot, ScheduleStatus, ServiceSchedule } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateSlotDto } from './dto/create-slot.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { ListSchedulesQueryDto } from './dto/list-schedules-query.dto';

type ScheduleWithSlots = ServiceSchedule & {
  slots: (ScheduleSlot & {
    assignments: (ScheduleAssignment & {
      volunteerProfile: {
        id: string;
        person: { id: string; full_name: string };
      };
    })[];
  })[];
};

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Schedules ─────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    congregationId: string,
    userId: string,
    dto: CreateScheduleDto,
  ): Promise<ServiceSchedule> {
    return this.prisma.client.serviceSchedule.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        ministry_id: dto.ministry_id,
        title: dto.title,
        scheduled_date: new Date(dto.scheduled_date),
        deadline_confirm_at: dto.deadline_confirm_at ? new Date(dto.deadline_confirm_at) : null,
        created_by_user_id: userId,
      },
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
    query: ListSchedulesQueryDto,
  ): Promise<{ data: ServiceSchedule[]; total: number }> {
    const where: Prisma.ServiceScheduleWhereInput = {
      tenant_id: tenantId,
      congregation_id: congregationId,
      ...(query.ministry_id && { ministry_id: query.ministry_id }),
      ...(query.status && { status: query.status }),
      ...(query.date_from || query.date_to
        ? {
            scheduled_date: {
              ...(query.date_from && { gte: new Date(query.date_from) }),
              ...(query.date_to && { lte: new Date(query.date_to) }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.serviceSchedule.findMany({
        where,
        orderBy: { scheduled_date: 'asc' },
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.client.serviceSchedule.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<ScheduleWithSlots> {
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        slots: {
          orderBy: { created_at: 'asc' },
          include: {
            assignments: {
              include: {
                volunteerProfile: {
                  select: {
                    id: true,
                    person: { select: { id: true, full_name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    return schedule as ScheduleWithSlots;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateScheduleDto,
  ): Promise<ServiceSchedule> {
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('Só é possível editar escalas com status draft');
    }

    const data: Prisma.ServiceScheduleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.ministry_id !== undefined) data.ministry = { connect: { id: dto.ministry_id } };
    if (dto.scheduled_date !== undefined) data.scheduled_date = new Date(dto.scheduled_date);
    if (dto.deadline_confirm_at !== undefined)
      data.deadline_confirm_at = dto.deadline_confirm_at ? new Date(dto.deadline_confirm_at) : null;

    return this.prisma.client.serviceSchedule.update({ where: { id }, data });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<ServiceSchedule> {
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('Só é possível excluir escalas com status draft');
    }
    return this.prisma.client.serviceSchedule.delete({ where: { id } });
  }

  async publish(tenantId: string, congregationId: string, id: string): Promise<ServiceSchedule> {
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('Escala já publicada ou arquivada');
    }
    return this.prisma.client.serviceSchedule.update({
      where: { id },
      data: { status: ScheduleStatus.published },
    });
  }

  // ── Slots ─────────────────────────────────────────────────────────────────

  private async requireDraftSchedule(tenantId: string, congregationId: string, scheduleId: string) {
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('A escala precisa estar em draft para esta operação');
    }
    return schedule;
  }

  async createSlot(
    tenantId: string,
    congregationId: string,
    scheduleId: string,
    dto: CreateSlotDto,
  ): Promise<ScheduleSlot> {
    await this.requireDraftSchedule(tenantId, congregationId, scheduleId);
    return this.prisma.client.scheduleSlot.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        schedule_id: scheduleId,
        role_name: dto.role_name,
        required_count: dto.required_count,
        notes: dto.notes ?? null,
      },
    });
  }

  async removeSlot(
    tenantId: string,
    congregationId: string,
    scheduleId: string,
    slotId: string,
  ): Promise<ScheduleSlot> {
    await this.requireDraftSchedule(tenantId, congregationId, scheduleId);
    const slot = await this.prisma.client.scheduleSlot.findFirst({
      where: { id: slotId, schedule_id: scheduleId, tenant_id: tenantId },
    });
    if (!slot) throw new NotFoundException('Slot não encontrado');
    return this.prisma.client.scheduleSlot.delete({ where: { id: slotId } });
  }

  // ── Assignments ───────────────────────────────────────────────────────────

  async createAssignment(
    tenantId: string,
    congregationId: string,
    scheduleId: string,
    dto: CreateAssignmentDto,
  ): Promise<ScheduleAssignment> {
    await this.requireDraftSchedule(tenantId, congregationId, scheduleId);

    const slot = await this.prisma.client.scheduleSlot.findFirst({
      where: { id: dto.slot_id, schedule_id: scheduleId, tenant_id: tenantId },
    });
    if (!slot) throw new NotFoundException('Slot não encontrado na escala');

    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { id: dto.volunteer_profile_id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');

    return this.prisma.client.scheduleAssignment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        slot_id: dto.slot_id,
        volunteer_profile_id: dto.volunteer_profile_id,
        checkin_token: randomUUID(),
      },
    });
  }

  async removeAssignment(
    tenantId: string,
    congregationId: string,
    scheduleId: string,
    assignmentId: string,
  ): Promise<ScheduleAssignment> {
    await this.requireDraftSchedule(tenantId, congregationId, scheduleId);
    const assignment = await this.prisma.client.scheduleAssignment.findFirst({
      where: {
        id: assignmentId,
        tenant_id: tenantId,
        slot: { schedule_id: scheduleId },
      },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');
    return this.prisma.client.scheduleAssignment.delete({ where: { id: assignmentId } });
  }
}
