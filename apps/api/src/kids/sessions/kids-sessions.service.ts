import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CelebrationInstanceStatus, KidsSession, KidsSessionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { STAFFING_STATUSES, countScheduledVolunteers, volunteersMissing } from './kids-staffing';
import { KidsSessionAccessService } from '../checkin/kids-session-access.service';
import { KidsActor } from '../children/kids-child-access.service';
import { KIDS_FAMILY_ROLES } from '../kids.roles';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
/** Dia civil de hoje no fuso da congregação, como `scheduled_date` é gravada (meia-noite UTC). */
export const todayUtcMidnight = (timezone: string, now: Date) =>
  new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now)}T00:00:00.000Z`);

@Injectable()
export class KidsSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionAccess: KidsSessionAccessService,
  ) {}

  /**
   * Sessões ABERTAS do dia na congregação (para o responsável achar o
   * `session_id` do check-in). Só turma e culto: nenhum dado de criança ou de
   * saúde. Gestão e responsável veem todas; o voluntário só as em que está
   * escalado (mesma regra do KidsSessionAccessService).
   */
  async listOpenToday(actor: KidsActor, now: Date = new Date()) {
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: actor.congregationId, tenant_id: actor.tenantId },
      select: { timezone: true },
    });
    const sessions = await this.prisma.client.kidsSession.findMany({
      where: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        status: KidsSessionStatus.open,
        celebrationInstance: {
          scheduled_date: todayUtcMidnight(congregation?.timezone ?? DEFAULT_TIMEZONE, now),
          status: { not: CelebrationInstanceStatus.cancelled },
        },
      },
      select: {
        id: true,
        status: true,
        room: {
          select: { id: true, name: true, min_age_months: true, max_age_months: true, allows_out_of_range: true },
        },
        celebrationInstance: {
          select: { id: true, scheduled_date: true, celebration: { select: { name: true, start_time: true } } },
        },
      },
      orderBy: [{ room: { min_age_months: 'asc' } }, { room: { name: 'asc' } }],
    });

    const seesAll = actor.roles.some((r) => KIDS_FAMILY_ROLES.includes(r));
    const visible = seesAll
      ? sessions
      : await this.onlyScheduled(actor, sessions);
    return visible.map((s) => ({
      session_id: s.id,
      status: s.status,
      room: s.room,
      instance: {
        id: s.celebrationInstance.id,
        scheduled_date: s.celebrationInstance.scheduled_date,
        celebration_name: s.celebrationInstance.celebration.name,
        start_time: s.celebrationInstance.celebration.start_time,
      },
    }));
  }

  private async onlyScheduled<T extends { id: string }>(actor: KidsActor, sessions: T[]): Promise<T[]> {
    if (!actor.roles.includes('volunteer') || sessions.length === 0) return [];
    const scheduled = await this.sessionAccess.scheduledAmong(
      actor.userId,
      sessions.map((s) => s.id),
    );
    return sessions.filter((s) => scheduled.has(s.id));
  }

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
