import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CelebrationInstanceStatus, KidsSession, KidsSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STAFFING_STATUSES, countScheduledVolunteers, volunteersMissing } from './kids-staffing';

@Injectable()
export class KidsSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findInstance(tenantId: string, congregationId: string, instanceId: string) {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id: instanceId, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true, status: true },
    });
    if (!instance) throw new NotFoundException('Celebração não encontrada');
    return instance;
  }

  // Instância sem sessões é "sem culto kids": lista vazia, nunca erro.
  async listByInstance(tenantId: string, congregationId: string, instanceId: string) {
    await this.findInstance(tenantId, congregationId, instanceId);
    const sessions = await this.prisma.client.kidsSession.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId, celebration_instance_id: instanceId },
      include: { room: true },
      orderBy: [{ room: { min_age_months: 'asc' } }, { room: { name: 'asc' } }],
    });
    if (sessions.length === 0) return [];

    // Escala (spec P2, AC 2): `volunteers_scheduled` = voluntários distintos
    // pending/confirmed ligados à sessão; `volunteers_missing` = quanto falta
    // para `room.min_volunteers` (>= 0).
    const rows = await this.prisma.client.celebrationAssignment.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        status: { in: [...STAFFING_STATUSES] },
        celebrationMinistry: { kids_session_id: { in: sessions.map((s) => s.id) } },
      },
      select: { status: true, volunteer_profile_id: true, celebrationMinistry: { select: { kids_session_id: true } } },
    });
    return sessions.map((s) => {
      const scheduled = countScheduledVolunteers(rows, s.id);
      return {
        ...s,
        volunteers_scheduled: scheduled,
        volunteers_missing: volunteersMissing(s.room.min_volunteers, scheduled),
      };
    });
  }

  async open(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    roomIds: string[],
  ): Promise<KidsSession[]> {
    const instance = await this.findInstance(tenantId, congregationId, instanceId);
    if (instance.status === CelebrationInstanceStatus.cancelled) {
      throw new UnprocessableEntityException('Culto cancelado não abre sessão kids');
    }

    const rooms = await this.prisma.client.kidsRoom.findMany({
      where: { id: { in: roomIds }, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (rooms.length !== roomIds.length) throw new NotFoundException('Turma não encontrada');
    if (rooms.some((r) => !r.is_active)) {
      throw new UnprocessableEntityException('Turma desativada não abre sessão nova');
    }

    // Tudo ou nada: se um par já existe, nenhuma das outras turmas é aberta.
    const existing = await this.prisma.client.kidsSession.findMany({
      where: { celebration_instance_id: instanceId, room_id: { in: roomIds } },
      select: { room_id: true },
    });
    if (existing.length > 0) throw new ConflictException('Já existe sessão kids desta turma neste culto');

    try {
      return await this.prisma.client.kidsSession.createManyAndReturn({
        data: roomIds.map((room_id) => ({
          tenant_id: tenantId,
          congregation_id: congregationId,
          celebration_instance_id: instanceId,
          room_id,
        })),
      });
    } catch (e) {
      // Duas aberturas simultâneas: quem perde a corrida cai na unicidade.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Já existe sessão kids desta turma neste culto');
      }
      throw e;
    }
  }

  async cancel(tenantId: string, congregationId: string, sessionId: string): Promise<KidsSession> {
    const session = await this.prisma.client.kidsSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!session) throw new NotFoundException('Sessão kids não encontrada');
    if (session.status === KidsSessionStatus.cancelled) return session;

    const present = await this.prisma.client.kidsCheckin.count({
      where: { session_id: sessionId, checked_out_at: null },
    });
    if (present > 0) {
      throw new UnprocessableEntityException(
        'Há criança presente nesta sessão. Faça o check-out antes de cancelar',
      );
    }

    return this.prisma.client.kidsSession.update({
      where: { id: sessionId },
      data: { status: KidsSessionStatus.cancelled },
    });
  }
}
