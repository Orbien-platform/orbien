import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  CelebrationAttendance,
  CelebrationInstanceStatus,
  ScheduleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SaveAttendanceDto } from './dto/save-attendance.dto';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

// Liderança lança e corrige sem depender da escala. Mesmos papéis que escrevem
// em `CelebrationInstancesController`.
const LEADERSHIP_ROLES = ['tenant_admin', 'admin_congregation', 'pastor', 'secretary'];

// Atribuição que ainda vale: quem recusou ou trocou deixou de estar na escala.
const ACTIVE_ASSIGNMENT = [AssignmentStatus.pending, AssignmentStatus.confirmed];

export interface AttendanceCounts {
  children: number;
  members: number;
  attendees: number;
  visitors: number;
  total: number;
}

export function toCounts(a: Pick<CelebrationAttendance, 'children' | 'members' | 'attendees' | 'visitors'>): AttendanceCounts {
  return {
    children: a.children,
    members: a.members,
    attendees: a.attendees,
    visitors: a.visitors,
    total: a.children + a.members + a.attendees + a.visitors,
  };
}

/**
 * Crianças DISTINTAS com check-in por instância (qualquer status, aberto ou
 * fechado) — valor inicial sugerido para `children` (spec P2 Escala, AC 3).
 * Instância sem check-in fica fora do mapa: quem lê trata ausência como 0.
 * Instância CANCELADA também fica fora (DEC-1): culto que não aconteceu não
 * conta criança nenhuma, mesmo com check-in aberto que ainda precisa fechar.
 */
export async function checkinTotalsByInstance(
  client: PrismaService['client'],
  tenantId: string,
  instanceIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (instanceIds.length === 0) return totals;
  const rows = await client.kidsCheckin.findMany({
    where: {
      tenant_id: tenantId,
      celebration_instance_id: { in: instanceIds },
      session: { celebrationInstance: { status: { not: CelebrationInstanceStatus.cancelled } } },
    },
    select: { celebration_instance_id: true, child_id: true },
    distinct: ['celebration_instance_id', 'child_id'],
  });
  // `distinct` já resolve no banco; o Set garante a regra "distintas" mesmo
  // que a consulta mude.
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.celebration_instance_id}:${r.child_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    totals.set(r.celebration_instance_id, (totals.get(r.celebration_instance_id) ?? 0) + 1);
  }
  return totals;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "AAAA-MM-DD" de hoje no fuso da congregação. */
function todayKey(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

@Injectable()
export class CelebrationAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async save(
    instanceId: string,
    user: JwtPayload,
    dto: SaveAttendanceDto,
    now = new Date(),
  ) {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id: instanceId, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
      include: { congregation: { select: { timezone: true } } },
    });
    if (!instance) throw new NotFoundException('Celebração não encontrada');

    await this.assertCanCount(instance.id, user);

    if (instance.status === CelebrationInstanceStatus.cancelled) {
      throw new UnprocessableEntityException('Culto cancelado não tem contagem de presença');
    }
    // `scheduled_date` é data civil gravada à meia-noite UTC.
    const day = instance.scheduled_date.toISOString().slice(0, 10);
    if (day > todayKey(instance.congregation.timezone, now)) {
      throw new UnprocessableEntityException('A contagem só pode ser lançada a partir do dia do culto');
    }

    const data = {
      children: dto.children,
      members: dto.members,
      attendees: dto.attendees,
      visitors: dto.visitors,
      updated_by: user.sub,
    };
    const saved = await this.prisma.client.celebrationAttendance.upsert({
      where: { celebration_instance_id: instance.id },
      create: {
        ...data,
        tenant_id: user.tenant_id,
        congregation_id: instance.congregation_id,
        celebration_instance_id: instance.id,
      },
      update: data,
    });
    return { celebration_instance_id: instance.id, ...toCounts(saved), updated_at: saved.updated_at };
  }

  private async assertCanCount(instanceId: string, user: JwtPayload): Promise<void> {
    if (user.roles.some((r) => LEADERSHIP_ROLES.includes(r))) return;

    // A pessoa vem do banco, nunca de claim do token.
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    const assignment = account?.person_id
      ? await this.prisma.client.celebrationAssignment.findFirst({
          where: {
            tenant_id: user.tenant_id,
            status: { in: ACTIVE_ASSIGNMENT },
            volunteerProfile: { person_id: account.person_id },
            celebrationMinistry: {
              ministry: { counts_attendance: true },
              // Escala em rascunho não é escala: quem só está nela não foi nem avisado.
              schedule: { celebration_instance_id: instanceId, status: ScheduleStatus.published },
            },
          },
          select: { id: true },
        })
      : null;
    if (!assignment) {
      throw new ForbiddenException('Só quem está escalado no ministério responsável pela contagem pode lançá-la');
    }
  }

  private scope(user: JwtPayload, query: AttendanceQueryDto) {
    return {
      tenant_id: user.tenant_id,
      status: { not: CelebrationInstanceStatus.cancelled },
      ...(query.celebration_id && { celebration_id: query.celebration_id }),
      ...(query.date_from || query.date_to
        ? {
            scheduled_date: {
              ...(query.date_from && { gte: new Date(query.date_from) }),
              ...(query.date_to && { lte: new Date(query.date_to) }),
            },
          }
        : {}),
    };
  }

  /** Média dos cultos COM contagem — culto sem lançamento não entra como zero. */
  async summary(user: JwtPayload, query: AttendanceQueryDto) {
    const rows = await this.prisma.client.celebrationAttendance.findMany({
      where: { celebrationInstance: this.scope(user, query) },
      select: { children: true, members: true, attendees: true, visitors: true },
    });
    const sum = { children: 0, members: 0, attendees: 0, visitors: 0 };
    for (const r of rows) {
      sum.children += r.children;
      sum.members += r.members;
      sum.attendees += r.attendees;
      sum.visitors += r.visitors;
    }
    const n = rows.length;
    const totals: AttendanceCounts = toCounts(sum);
    const avg = (v: number) => (n === 0 ? 0 : round1(v / n));
    return {
      services_counted: n,
      totals,
      average: {
        children: avg(sum.children),
        members: avg(sum.members),
        attendees: avg(sum.attendees),
        visitors: avg(sum.visitors),
        total: avg(totals.total),
      },
    };
  }

  /** Cultos do período (até hoje) com a contagem de cada um; `null` = sem lançamento. */
  async list(user: JwtPayload, query: AttendanceQueryDto, now = new Date()) {
    // "Até hoje" no fuso da congregação — o mesmo critério de `save`, para um
    // culto nunca aparecer como "falta lançar" quando o lançamento ainda é recusado.
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: user.congregation_id, tenant_id: user.tenant_id },
      select: { timezone: true },
    });
    const upTo = new Date(`${todayKey(congregation?.timezone ?? DEFAULT_TIMEZONE, now)}T00:00:00.000Z`);
    const instances = await this.prisma.client.celebrationInstance.findMany({
      where: this.scope(user, query),
      orderBy: { scheduled_date: 'desc' },
      include: {
        celebration: { select: { id: true, name: true, start_time: true } },
        attendance: true,
      },
    });
    const visible = instances.filter((i) => i.attendance || i.scheduled_date <= upTo);
    const checkins = await checkinTotalsByInstance(
      this.prisma.client,
      user.tenant_id,
      visible.map((i) => i.id),
    );
    return visible.map((i) => ({
      celebration_instance_id: i.id,
      scheduled_date: i.scheduled_date,
      celebration: i.celebration,
      attendance: i.attendance ? toCounts(i.attendance) : null,
      // Sugestão para `children` (módulo Kids); o valor lançado à mão é o que vale.
      checkin_total: checkins.get(i.id) ?? 0,
    }));
  }
}
