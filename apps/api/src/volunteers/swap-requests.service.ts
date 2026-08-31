import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, SwapStatus, VolunteerSwapRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../content/notifications.service';
import { CreateSwapRequestDto } from './dto/create-swap-request.dto';

@Injectable()
export class SwapRequestsService {
  private readonly logger = new Logger(SwapRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateSwapRequestDto): Promise<VolunteerSwapRequest & { swap_request_id: string; compatible_substitutes: number }> {
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const assignment = await this.prisma.client.scheduleAssignment.findUnique({
      where: { id: dto.assignment_id },
      include: {
        volunteerProfile: { select: { id: true, person_id: true } },
        slot: {
          include: {
            schedule: {
              select: {
                id: true,
                tenant_id: true,
                congregation_id: true,
                ministry_id: true,
                title: true,
                scheduled_date: true,
              },
            },
          },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');

    if (assignment.volunteerProfile.person_id !== userAccount.person_id) {
      throw new NotFoundException('Atribuição não encontrada');
    }

    if (assignment.status !== AssignmentStatus.confirmed) {
      throw new BadRequestException('Só é possível solicitar troca de atribuições confirmadas');
    }

    const existing = await this.prisma.client.volunteerSwapRequest.findFirst({
      where: { assignment_id: dto.assignment_id, status: SwapStatus.pending },
    });
    if (existing) {
      throw new ConflictException('Já existe uma solicitação de troca pendente para esta atribuição');
    }

    const schedule = assignment.slot.schedule;
    const date = new Date(schedule.scheduled_date);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayOfWeek = days[date.getUTCDay()];

    const sameDayStart = new Date(date);
    sameDayStart.setUTCHours(0, 0, 0, 0);
    const sameDayEnd = new Date(date);
    sameDayEnd.setUTCHours(23, 59, 59, 999);

    const candidates = await this.prisma.client.volunteerProfile.findMany({
      where: {
        tenant_id: schedule.tenant_id,
        congregation_id: schedule.congregation_id,
        id: { not: assignment.volunteer_profile_id },
        volunteerMinistries: { some: { ministry_id: schedule.ministry_id } },
        scheduleAssignments: {
          none: {
            status: AssignmentStatus.confirmed,
            slot: {
              schedule: { scheduled_date: { gte: sameDayStart, lte: sameDayEnd } },
            },
          },
        },
      },
      select: { id: true, person_id: true, availability: true },
    });

    const eligible = candidates.filter((p) => {
      const avail = p.availability as Record<string, string[]> | null;
      return Array.isArray(avail?.[dayOfWeek]) && (avail![dayOfWeek]?.length ?? 0) > 0;
    });

    const compatibleCount = eligible.length;

    const swapRequest = await this.prisma.client.volunteerSwapRequest.create({
      data: {
        tenant_id: schedule.tenant_id,
        congregation_id: schedule.congregation_id,
        assignment_id: dto.assignment_id,
        requester_id: assignment.volunteer_profile_id,
        message: dto.message ?? null,
      },
    });

    for (const candidate of eligible.slice(0, 20)) {
      this.notifications
        .sendPush({
          tenantId: schedule.tenant_id,
          congregationId: schedule.congregation_id,
          contentPostId: null,
          title: 'Solicitação de troca de escala',
          body: `${schedule.title} — você pode cobrir "${assignment.slot.role_name}"?`,
          filters: [{ field: 'tag', key: 'person_id', relation: '=', value: candidate.person_id }],
          data: { type: 'swap_request', swap_request_id: swapRequest.id },
        })
        .catch((err: unknown) => {
          this.logger.error(`Notificação de troca falhou para ${candidate.id}: ${String(err)}`);
        });
    }

    return { ...swapRequest, swap_request_id: swapRequest.id, compatible_substitutes: compatibleCount };
  }

  async accept(userId: string, swapRequestId: string): Promise<VolunteerSwapRequest> {
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const swapRequest = await this.prisma.client.volunteerSwapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        assignment: {
          include: {
            volunteerProfile: { select: { person_id: true } },
            slot: {
              include: {
                schedule: {
                  select: {
                    id: true,
                    tenant_id: true,
                    congregation_id: true,
                    title: true,
                    scheduled_date: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!swapRequest) throw new NotFoundException('Solicitação de troca não encontrada');
    if (swapRequest.status !== SwapStatus.pending) {
      throw new ConflictException('Solicitação de troca não está mais disponível');
    }

    const accepterProfile = await this.prisma.client.volunteerProfile.findFirst({
      where: {
        person_id: userAccount.person_id,
        tenant_id: swapRequest.tenant_id,
        congregation_id: swapRequest.congregation_id,
      },
      select: { id: true },
    });
    if (!accepterProfile) throw new NotFoundException('Perfil de voluntário não encontrado');

    if (accepterProfile.id === swapRequest.requester_id) {
      throw new BadRequestException('Você não pode aceitar a sua própria solicitação de troca');
    }

    // Ensure accepter doesn't already have an assignment for this slot
    const slotId = swapRequest.assignment.slot_id;
    const conflict = await this.prisma.client.scheduleAssignment.findUnique({
      where: { slot_id_volunteer_profile_id: { slot_id: slotId, volunteer_profile_id: accepterProfile.id } },
    });
    if (conflict) throw new ConflictException('Você já tem uma atribuição neste slot');

    const updated = await this.prisma.runInTx(async (tx) => {
      await tx.scheduleAssignment.update({
        where: { id: swapRequest.assignment_id },
        data: { volunteer_profile_id: accepterProfile.id },
      });

      return tx.volunteerSwapRequest.update({
        where: { id: swapRequestId },
        data: { status: SwapStatus.accepted, substitute_id: accepterProfile.id },
      });
    });

    const schedule = swapRequest.assignment.slot.schedule;
    this.notifications
      .sendPush({
        tenantId: schedule.tenant_id,
        congregationId: schedule.congregation_id,
        contentPostId: null,
        title: 'Troca de escala aceita!',
        body: `Sua solicitação de troca para ${schedule.title} foi aceita`,
        filters: [
          {
            field: 'tag',
            key: 'person_id',
            relation: '=',
            value: swapRequest.assignment.volunteerProfile.person_id,
          },
        ],
        data: { type: 'swap_accepted', swap_request_id: swapRequestId },
      })
      .catch((err: unknown) => {
        this.logger.error(`Notificação de aceite de troca falhou: ${String(err)}`);
      });

    return updated;
  }

  async reject(userId: string, swapRequestId: string): Promise<VolunteerSwapRequest> {
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const swapRequest = await this.prisma.client.volunteerSwapRequest.findUnique({
      where: { id: swapRequestId },
      include: {
        requester: { select: { person_id: true } },
        substitute: { select: { person_id: true } },
      },
    });
    if (!swapRequest) throw new NotFoundException('Solicitação de troca não encontrada');
    if (swapRequest.status !== SwapStatus.pending) {
      throw new ConflictException('Solicitação não pode ser rejeitada neste estado');
    }

    const isRequester = swapRequest.requester.person_id === userAccount.person_id;
    const isSubstitute = swapRequest.substitute?.person_id === userAccount.person_id;

    // Allow rejection by requester, assigned substitute, or any volunteer in the congregation
    // (to decline a broadcast notification they received)
    if (!isRequester && !isSubstitute) {
      const profile = await this.prisma.client.volunteerProfile.findFirst({
        where: {
          person_id: userAccount.person_id,
          tenant_id: swapRequest.tenant_id,
          congregation_id: swapRequest.congregation_id,
        },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException('Solicitação de troca não encontrada');
    }

    return this.prisma.client.volunteerSwapRequest.update({
      where: { id: swapRequestId },
      data: { status: SwapStatus.rejected },
    });
  }

  async cancel(userId: string, swapRequestId: string): Promise<VolunteerSwapRequest> {
    const userAccount = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!userAccount?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const swapRequest = await this.prisma.client.volunteerSwapRequest.findUnique({
      where: { id: swapRequestId },
      include: { requester: { select: { person_id: true } } },
    });
    if (!swapRequest) throw new NotFoundException('Solicitação de troca não encontrada');

    if (swapRequest.requester.person_id !== userAccount.person_id) {
      throw new NotFoundException('Solicitação de troca não encontrada');
    }

    if (swapRequest.status !== SwapStatus.pending) {
      throw new ConflictException('Solicitação não pode ser cancelada neste estado');
    }

    return this.prisma.client.volunteerSwapRequest.update({
      where: { id: swapRequestId },
      data: { status: SwapStatus.cancelled },
    });
  }

  async findAll(tenantId: string, congregationId: string): Promise<VolunteerSwapRequest[]> {
    return this.prisma.client.volunteerSwapRequest.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { created_at: 'desc' },
      include: {
        requester: {
          select: { id: true, person: { select: { full_name: true } } },
        },
        substitute: {
          select: { id: true, person: { select: { full_name: true } } },
        },
        assignment: {
          include: {
            slot: {
              select: {
                role_name: true,
                schedule: { select: { title: true, scheduled_date: true } },
              },
            },
          },
        },
      },
    }) as unknown as Promise<VolunteerSwapRequest[]>;
  }
}
