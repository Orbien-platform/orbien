import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, Prisma, ScheduleAssignment, ScheduleSlot, ScheduleStatus, ServiceSchedule } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';
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
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
      include: {
        ministry: { select: { name: true } },
        slots: {
          include: {
            assignments: {
              where: { status: AssignmentStatus.pending },
              include: {
                volunteerProfile: {
                  select: { person_id: true },
                },
              },
            },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('Escala já publicada ou arquivada');
    }

    const published = await this.prisma.client.serviceSchedule.update({
      where: { id },
      data: { status: ScheduleStatus.published },
    });

    // Fire-and-forget notifications to each pending volunteer
    const dateFmt = schedule.scheduled_date.toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const deadline = schedule.deadline_confirm_at
      ? schedule.deadline_confirm_at.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
      : null;

    const pendingAssignments = schedule.slots.flatMap((s) =>
      s.assignments.map((a) => ({ assignmentId: a.id, personId: a.volunteerProfile.person_id })),
    );

    for (const { assignmentId, personId } of pendingAssignments) {
      const bodyParts = [`${schedule.title} — ${dateFmt}`];
      if (deadline) bodyParts.push(`Confirme até ${deadline}`);

      this.notifications
        .sendPush({
          tenantId,
          congregationId,
          contentPostId: null,
          title: 'Você está na escala!',
          body: bodyParts.join(' · '),
          // person_id is an opaque UUID used to route to a specific device; not PII
          filters: [{ field: 'tag', key: 'person_id', relation: '=', value: personId }],
          data: { type: 'schedule_assignment', assignment_id: assignmentId, schedule_id: id },
        })
        .catch((err: unknown) => {
          this.logger.error(`Falha ao notificar assignment ${assignmentId}: ${String(err)}`);
        });
    }

    return published;
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

  // ── Suggest ───────────────────────────────────────────────────────────────

  async suggestAssignments(
    tenantId: string,
    congregationId: string,
    scheduleId: string,
  ): Promise<{ suggested: number; slots_filled: number; slots_remaining: number }> {
    // Load schedule with full slot+assignment hierarchy
    const schedule = await this.prisma.client.serviceSchedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        slots: {
          include: { assignments: { select: { volunteer_profile_id: true } } },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status !== ScheduleStatus.draft) {
      throw new BadRequestException('Sugestão automática só é possível em escalas com status draft');
    }

    // Day of week derived from scheduled_date (UTC, locale-agnostic)
    const date = new Date(schedule.scheduled_date);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[date.getUTCDay()];

    // Set of profile ids already assigned anywhere in this schedule
    const alreadyAssigned = new Set(
      schedule.slots.flatMap((s) => s.assignments.map((a) => a.volunteer_profile_id)),
    );

    // Load all volunteer profiles linked to this schedule's ministry.
    // Also load recent confirmed assignment count for fair rotation.
    const since60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const candidates = await this.prisma.client.volunteerProfile.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        volunteerMinistries: { some: { ministry_id: schedule.ministry_id } },
      },
      select: {
        id: true,
        availability: true,
        created_at: true,
        // Count of confirmed assignments in last 60 days for fair rotation
        scheduleAssignments: {
          where: {
            status: AssignmentStatus.confirmed,
            slot: {
              schedule: { scheduled_date: { gte: since60d } },
            },
          },
          select: { id: true },
        },
      },
    });

    // Filter by day availability (availability is JSON: { sunday: [...], ... })
    const eligible = candidates.filter((p) => {
      if (alreadyAssigned.has(p.id)) return false;
      const avail = p.availability as Record<string, string[]> | null;
      return Array.isArray(avail?.[dayOfWeek]) && (avail![dayOfWeek]?.length ?? 0) > 0;
    });

    // Sort: fewest recent confirmed assignments first, then oldest profile (stable rotation)
    eligible.sort((a, b) => {
      const diff = a.scheduleAssignments.length - b.scheduleAssignments.length;
      if (diff !== 0) return diff;
      return a.created_at.getTime() - b.created_at.getTime();
    });

    let suggested = 0;
    let slotsFilled = 0;
    let slotsRemaining = 0;

    for (const slot of schedule.slots) {
      const needed = slot.required_count - slot.assignments.length;
      if (needed <= 0) continue;

      // Pick first `needed` eligible candidates not yet used in this iteration
      const picked: string[] = [];
      for (const candidate of eligible) {
        if (alreadyAssigned.has(candidate.id)) continue;
        picked.push(candidate.id);
        alreadyAssigned.add(candidate.id); // prevent double-booking across slots
        if (picked.length >= needed) break;
      }

      if (picked.length > 0) {
        await this.prisma.client.scheduleAssignment.createMany({
          data: picked.map((profileId) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            slot_id: slot.id,
            volunteer_profile_id: profileId,
            checkin_token: randomUUID(),
          })),
          skipDuplicates: true,
        });
        suggested += picked.length;
      }

      const remaining = needed - picked.length;
      if (remaining === 0) slotsFilled++;
      else slotsRemaining++;
    }

    return { suggested, slots_filled: slotsFilled, slots_remaining: slotsRemaining };
  }

  // ── Confirm / Decline ─────────────────────────────────────────────────────

  async confirm(assignmentId: string, userId: string): Promise<ScheduleAssignment> {
    return this.respondToAssignment(assignmentId, userId, AssignmentStatus.confirmed);
  }

  async decline(assignmentId: string, userId: string): Promise<ScheduleAssignment> {
    return this.respondToAssignment(assignmentId, userId, AssignmentStatus.declined);
  }

  private async respondToAssignment(
    assignmentId: string,
    userId: string,
    newStatus: 'confirmed' | 'declined',
  ): Promise<ScheduleAssignment> {
    // Resolve person_id for the requesting user
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const assignment = await this.prisma.client.scheduleAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        volunteerProfile: { select: { person_id: true } },
        slot: { include: { schedule: { select: { deadline_confirm_at: true } } } },
      },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');

    // Ownership guard — volunteer can only respond to their own assignment
    if (assignment.volunteerProfile.person_id !== userAccount.person_id) {
      throw new NotFoundException('Atribuição não encontrada');
    }

    if (assignment.status !== AssignmentStatus.pending) {
      throw new ConflictException('Esta atribuição já foi respondida');
    }

    const deadline = assignment.slot.schedule.deadline_confirm_at;
    if (deadline && deadline < new Date()) {
      throw new ConflictException('Prazo para confirmação expirado');
    }

    return this.prisma.client.scheduleAssignment.update({
      where: { id: assignmentId },
      data: {
        status: newStatus,
        confirmed_at: newStatus === AssignmentStatus.confirmed ? new Date() : null,
      },
    });
  }

  // ── My Assignments ────────────────────────────────────────────────────────

  async getMyAssignments(
    userId: string,
    tenantId: string,
    congregationId: string,
    query: { status?: AssignmentStatus; upcoming?: boolean },
  ): Promise<object[]> {
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) return [];

    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { person_id: userAccount.person_id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!profile) return [];

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const where: Prisma.ScheduleAssignmentWhereInput = {
      volunteer_profile_id: profile.id,
      tenant_id: tenantId,
      ...(query.status && { status: query.status }),
      ...(query.upcoming
        ? { slot: { schedule: { scheduled_date: { gte: today } } } }
        : {}),
    };

    return this.prisma.client.scheduleAssignment.findMany({
      where,
      orderBy: { slot: { schedule: { scheduled_date: 'asc' } } },
      include: {
        slot: {
          select: {
            role_name: true,
            schedule: {
              select: {
                title: true,
                scheduled_date: true,
                ministry: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  // ── Check-in ──────────────────────────────────────────────────────────────

  async checkIn(token: string): Promise<{
    ok: boolean;
    already_checked_in?: boolean;
    volunteer_name: string;
    ministry_name: string;
    role_name: string;
    schedule_title: string;
  }> {
    const assignment = await this.prisma.system.scheduleAssignment.findUnique({
      where: { checkin_token: token },
      include: {
        volunteerProfile: {
          include: { person: { select: { full_name: true } } },
        },
        slot: {
          include: {
            schedule: {
              include: { ministry: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Token de check-in inválido');

    if (assignment.status !== AssignmentStatus.confirmed) {
      throw new BadRequestException('A atribuição não está confirmada');
    }

    const scheduledDate = assignment.slot.schedule.scheduled_date;
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - scheduledDate.getTime());
    if (diffMs > 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Check-in disponível apenas no dia da escala (±24h)');
    }

    const base = {
      ok: true,
      volunteer_name: assignment.volunteerProfile.person.full_name,
      ministry_name: assignment.slot.schedule.ministry.name,
      role_name: assignment.slot.role_name,
      schedule_title: assignment.slot.schedule.title,
    };

    if (assignment.checked_in_at) {
      return { ...base, already_checked_in: true };
    }

    await this.prisma.system.scheduleAssignment.update({
      where: { id: assignment.id },
      data: { checked_in_at: now },
    });

    return base;
  }

  // ── Reminder cron ─────────────────────────────────────────────────────────

  @Cron('0 8 * * *')
  async sendConfirmationReminders(): Promise<void> {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    // Schedules with deadline_confirm_at within the next 48 hours
    const pending = await this.prisma.system.scheduleAssignment.findMany({
      where: {
        status: AssignmentStatus.pending,
        slot: {
          schedule: {
            status: ScheduleStatus.published,
            deadline_confirm_at: { gte: now, lte: in48h },
          },
        },
      },
      include: {
        volunteerProfile: { select: { person_id: true } },
        slot: {
          include: {
            schedule: {
              select: {
                id: true,
                title: true,
                tenant_id: true,
                congregation_id: true,
                scheduled_date: true,
                deadline_confirm_at: true,
              },
            },
          },
        },
      },
      take: 50,
    });

    for (const a of pending) {
      const schedule = a.slot.schedule;
      const dateFmt = schedule.scheduled_date.toLocaleDateString('pt-BR', {
        timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const deadline = schedule.deadline_confirm_at!.toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
      });

      this.notifications
        .sendPush({
          tenantId: schedule.tenant_id,
          congregationId: schedule.congregation_id,
          contentPostId: null,
          title: 'Lembrete: confirme sua presença na escala',
          body: `${schedule.title} — ${dateFmt} · Confirme até ${deadline}`,
          filters: [{ field: 'tag', key: 'person_id', relation: '=', value: a.volunteerProfile.person_id }],
          data: { type: 'schedule_reminder', assignment_id: a.id, schedule_id: schedule.id },
        })
        .catch((err: unknown) => {
          this.logger.error(`Lembrete falhou para assignment ${a.id}: ${String(err)}`);
        });
    }

    if (pending.length) this.logger.log(`sendConfirmationReminders: ${pending.length} lembretes enviados`);
  }
}
