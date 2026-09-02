import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  CelebrationAssignment,
  CelebrationSchedule,
  ScheduleStatus,
  VolunteerMinistryRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';
import { AddCelebrationAssignmentDto } from './dto/add-celebration-assignment.dto';
import { RespondCelebrationAssignmentDto } from './dto/respond-celebration-assignment.dto';

@Injectable()
export class CelebrationAssignmentService {
  private readonly logger = new Logger(CelebrationAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async resolvePersonId(userId: string): Promise<string> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');
    return account.person_id;
  }

  private async resolveProfile(userId: string, tenantId: string, congregationId: string) {
    const personId = await this.resolvePersonId(userId);
    const profile = await this.prisma.client.volunteerProfile.findFirst({
      where: { person_id: personId, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Perfil de voluntário não encontrado');
    return profile;
  }

  private async assertLeaderOrAdmin(
    userId: string,
    userRoles: string[],
    tenantId: string,
    congregationId: string,
    ministryId: string,
  ): Promise<void> {
    if (userRoles.includes('admin_congregation') || userRoles.includes('tenant_admin')) return;

    const profile = await this.resolveProfile(userId, tenantId, congregationId);
    const membership = await this.prisma.client.volunteerMinistry.findUnique({
      where: {
        volunteer_profile_id_ministry_id: {
          volunteer_profile_id: profile.id,
          ministry_id: ministryId,
        },
      },
      select: { role: true },
    });
    if (!membership || membership.role !== VolunteerMinistryRole.leader) {
      throw new ForbiddenException('Você não é líder deste ministério');
    }
  }

  // Checks volunteer unavailability against the real scheduled_date of the CelebrationInstance
  // this schedule belongs to (1:1 since Bloco 1) — exact, no more "next upcoming" approximation.
  private async checkUnavailability(
    tenantId: string,
    scheduledDate: Date,
    volunteerProfileId: string,
  ): Promise<boolean> {
    const instanceDate = new Date(scheduledDate);
    instanceDate.setUTCHours(0, 0, 0, 0);

    const unavail = await this.prisma.client.volunteerUnavailabilityDate.findFirst({
      where: {
        date: instanceDate,
        tenant_id: tenantId,
        unavailability: { volunteer_profile_id: volunteerProfileId },
      },
    });
    return !!unavail;
  }

  // ── Create Assignment ──────────────────────────────────────────────────────

  async createAssignment(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    celebrationMinistryId: string,
    userId: string,
    userRoles: string[],
    dto: AddCelebrationAssignmentDto,
  ): Promise<CelebrationAssignment & { overbooked: boolean; unavailable_on_date: boolean }> {
    // celebrationMinistryId is CelebrationMinistry.id — validate it belongs to this instance's schedule
    const cm = await this.prisma.client.celebrationMinistry.findFirst({
      where: {
        id: celebrationMinistryId,
        tenant_id: tenantId,
        congregation_id: congregationId,
        schedule: { celebration_instance_id: instanceId },
      },
      select: {
        id: true,
        ministry_id: true,
        slots: true,
        schedule: { select: { celebrationInstance: { select: { scheduled_date: true } } } },
      },
    });
    if (!cm) throw new NotFoundException('Ministério da escala não encontrado');

    await this.assertLeaderOrAdmin(userId, userRoles, tenantId, congregationId, cm.ministry_id);

    const volunteerProfile = await this.prisma.client.volunteerProfile.findFirst({
      where: { id: dto.volunteer_profile_id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!volunteerProfile) throw new NotFoundException('Perfil de voluntário não encontrado');

    const membership = await this.prisma.client.volunteerMinistry.findUnique({
      where: {
        volunteer_profile_id_ministry_id: {
          volunteer_profile_id: dto.volunteer_profile_id,
          ministry_id: cm.ministry_id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new UnprocessableEntityException('Voluntário não pertence a este ministério');
    }

    const duplicate = await this.prisma.client.celebrationAssignment.findUnique({
      where: {
        celebration_ministry_id_volunteer_profile_id: {
          celebration_ministry_id: cm.id,
          volunteer_profile_id: dto.volunteer_profile_id,
        },
      },
    });
    if (duplicate) throw new ConflictException('Voluntário já atribuído a este slot');

    const assignment = await this.prisma.client.celebrationAssignment.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_ministry_id: cm.id,
        volunteer_profile_id: dto.volunteer_profile_id,
      },
    });

    const [assignedCount, unavailableOnDate] = await Promise.all([
      this.prisma.client.celebrationAssignment.count({ where: { celebration_ministry_id: cm.id } }),
      this.checkUnavailability(tenantId, cm.schedule.celebrationInstance.scheduled_date, dto.volunteer_profile_id),
    ]);

    return { ...assignment, overbooked: assignedCount > cm.slots, unavailable_on_date: unavailableOnDate };
  }

  // ── Remove Assignment ──────────────────────────────────────────────────────

  async removeAssignment(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    celebrationMinistryId: string,
    assignmentId: string,
    userId: string,
    userRoles: string[],
  ): Promise<CelebrationAssignment> {
    const cm = await this.prisma.client.celebrationMinistry.findFirst({
      where: {
        id: celebrationMinistryId,
        tenant_id: tenantId,
        congregation_id: congregationId,
        schedule: { celebration_instance_id: instanceId },
      },
      select: { id: true, ministry_id: true },
    });
    if (!cm) throw new NotFoundException('Ministério da escala não encontrado');

    await this.assertLeaderOrAdmin(userId, userRoles, tenantId, congregationId, cm.ministry_id);

    const assignment = await this.prisma.client.celebrationAssignment.findFirst({
      where: { id: assignmentId, tenant_id: tenantId, celebration_ministry_id: cm.id },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');

    return this.prisma.client.celebrationAssignment.delete({ where: { id: assignmentId } });
  }

  // ── Publish ────────────────────────────────────────────────────────────────

  // Idempotent: re-publish only notifies assignments with notified_at IS NULL.
  async publish(
    tenantId: string,
    congregationId: string,
    instanceId: string,
  ): Promise<CelebrationSchedule> {
    const schedule = await this.prisma.client.celebrationSchedule.findUnique({
      where: { celebration_instance_id: instanceId },
      include: { celebrationInstance: { include: { celebration: { select: { name: true } } } } },
    });
    if (!schedule) throw new NotFoundException('Escala não encontrada');
    if (schedule.status === ScheduleStatus.archived) {
      throw new UnprocessableEntityException('Escala arquivada não pode ser publicada');
    }

    const celebrationName = schedule.celebrationInstance.celebration.name;

    // Collect recipients inside the transaction; fire OneSignal outside (no DB conn during HTTP)
    const toNotify = await this.prisma.runInTx(async (_tx) => {
      await this.prisma.client.celebrationSchedule.update({
        where: { id: schedule.id },
        data: { status: ScheduleStatus.published },
      });

      const pending = await this.prisma.client.celebrationAssignment.findMany({
        where: {
          tenant_id: tenantId,
          status: AssignmentStatus.pending,
          notified_at: null,
          celebrationMinistry: { schedule_id: schedule.id },
        },
        include: { volunteerProfile: { select: { person_id: true } } },
      });

      if (pending.length > 0) {
        await this.prisma.client.celebrationAssignment.updateMany({
          where: { id: { in: pending.map((a) => a.id) } },
          data: { notified_at: new Date() },
        });
      }

      return pending.map((a) => ({
        assignmentId: a.id,
        personId: a.volunteerProfile.person_id,
      }));
    });

    for (const { assignmentId, personId } of toNotify) {
      this.notifications
        .sendPush({
          tenantId,
          congregationId,
          contentPostId: null,
          title: 'Você está na escala!',
          body: celebrationName,
          filters: [{ field: 'tag', key: 'person_id', relation: '=', value: personId }],
          data: { type: 'celebration_assignment', assignment_id: assignmentId },
        })
        .catch((err: unknown) => {
          this.logger.error(`Falha ao notificar assignment ${assignmentId}: ${String(err)}`);
        });
    }

    const updated = await this.prisma.client.celebrationSchedule.findUnique({
      where: { id: schedule.id },
    });
    return updated!;
  }

  // ── Respond ────────────────────────────────────────────────────────────────

  async respondToAssignment(
    assignmentId: string,
    userId: string,
    tenantId: string,
    dto: RespondCelebrationAssignmentDto,
  ): Promise<CelebrationAssignment> {
    const personId = await this.resolvePersonId(userId);

    const assignment = await this.prisma.client.celebrationAssignment.findFirst({
      where: { id: assignmentId, tenant_id: tenantId },
      include: {
        celebrationMinistry: {
          include: { schedule: { select: { status: true } } },
        },
        volunteerProfile: { select: { person_id: true } },
      },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');

    if (assignment.volunteerProfile.person_id !== personId) {
      throw new ForbiddenException('Você não tem permissão para responder esta atribuição');
    }

    if (assignment.celebrationMinistry.schedule.status !== ScheduleStatus.published) {
      throw new UnprocessableEntityException('A escala ainda está em rascunho');
    }

    if (assignment.status !== AssignmentStatus.pending) {
      throw new ConflictException('Esta atribuição já foi respondida');
    }

    return this.prisma.client.celebrationAssignment.update({
      where: { id: assignmentId },
      data: { status: dto.status, responded_at: new Date() },
    });
  }

  // ── My Assignments ─────────────────────────────────────────────────────────

  // Returns celebration assignments from published schedules, each carrying the exact
  // scheduled_date of its CelebrationInstance (1:1 since Bloco 1 — no more approximation).
  // By default only today-or-future instances (bounded list); includePast=true adds history.
  // Sorted by scheduled_date asc.
  async getMyAssignments(
    userId: string,
    tenantId: string,
    congregationId: string,
    includePast: boolean,
  ) {
    const profile = await this.resolveProfile(userId, tenantId, congregationId);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const assignments = await this.prisma.client.celebrationAssignment.findMany({
      where: {
        volunteer_profile_id: profile.id,
        tenant_id: tenantId,
        celebrationMinistry: {
          schedule: {
            status: ScheduleStatus.published,
            ...(includePast ? {} : { celebrationInstance: { scheduled_date: { gte: today } } }),
          },
        },
      },
      include: {
        celebrationMinistry: {
          include: {
            ministry: true,
            schedule: { include: { celebrationInstance: { include: { celebration: true } } } },
          },
        },
      },
    });

    const result = assignments.map((a) => ({
      id: a.id,
      status: a.status,
      notified_at: a.notified_at,
      responded_at: a.responded_at,
      celebration: {
        id: a.celebrationMinistry.schedule.celebrationInstance.celebration.id,
        name: a.celebrationMinistry.schedule.celebrationInstance.celebration.name,
      },
      ministry: {
        id: a.celebrationMinistry.ministry.id,
        name: a.celebrationMinistry.ministry.name,
      },
      scheduled_date: a.celebrationMinistry.schedule.celebrationInstance.scheduled_date,
    }));

    result.sort((a, b) => a.scheduled_date.getTime() - b.scheduled_date.getTime());

    return result;
  }
}
