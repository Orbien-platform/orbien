import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CelebrationInstanceStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsAttendanceQueryDto } from './dto/kids-attendance-query.dto';

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
// Janela padrão do período, a mesma dos indicadores de pessoas (PROD-37).
const DEFAULT_DAYS = 90;
const DAY_MS = 86_400_000;

const round1 = (n: number) => Math.round(n * 10) / 10;
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
/** "AAAA-MM-DD" de hoje no fuso da congregação. */
const todayKey = (timezone: string, now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
/** Dia civil (meia-noite UTC), como `scheduled_date` é gravada. */
const toDay = (key: string) => new Date(`${key.slice(0, 10)}T00:00:00.000Z`);

export interface KidsAttendanceRoom {
  room_id: string;
  room_name: string;
  /** Sessões da turma com ao menos um check-in no período. */
  sessions_counted: number;
  /** Soma, por sessão, das crianças distintas com check-in. */
  total_children: number;
  /** `total_children / sessions_counted`, uma casa decimal. */
  average_children: number;
}

@Injectable()
export class KidsAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Média de crianças por turma no período (spec P3): só sessões com ao menos um
   * check-in entram; sessão aberta e vazia não puxa a média para baixo.
   * Sem nenhuma sessão com check-in, `rooms` é `[]` e `sessions_counted` 0 —
   * a tela mostra estado vazio, nunca uma média zero.
   */
  async summary(tenantId: string, congregationId: string, query: KidsAttendanceQueryDto, now = new Date()) {
    const congregation = await this.prisma.client.congregation.findFirst({
      where: { id: congregationId, tenant_id: tenantId },
      select: { timezone: true },
    });
    const to = query.date_to ? dayKey(toDay(query.date_to)) : todayKey(congregation?.timezone ?? DEFAULT_TIMEZONE, now);
    const from = query.date_from
      ? dayKey(toDay(query.date_from))
      : dayKey(new Date(toDay(to).getTime() - (DEFAULT_DAYS - 1) * DAY_MS));
    if (from > to) throw new UnprocessableEntityException('O início do período não pode ser depois do fim');

    if (query.room_id) {
      const room = await this.prisma.client.kidsRoom.findFirst({
        where: { id: query.room_id, tenant_id: tenantId, congregation_id: congregationId },
        select: { id: true },
      });
      if (!room) throw new NotFoundException('Turma não encontrada');
    }

    const rows = await this.prisma.client.kidsCheckin.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        session: {
          ...(query.room_id && { room_id: query.room_id }),
          celebrationInstance: {
            status: { not: CelebrationInstanceStatus.cancelled },
            scheduled_date: { gte: toDay(from), lte: toDay(to) },
          },
        },
      },
      select: {
        session_id: true,
        child_id: true,
        session: { select: { room_id: true, room: { select: { id: true, name: true } } } },
      },
      distinct: ['session_id', 'child_id'],
    });

    // turma -> sessão -> crianças distintas
    const byRoom = new Map<string, { name: string; sessions: Map<string, Set<string>> }>();
    for (const r of rows) {
      const entry = byRoom.get(r.session.room_id) ?? { name: r.session.room.name, sessions: new Map() };
      const kids = entry.sessions.get(r.session_id) ?? new Set<string>();
      kids.add(r.child_id);
      entry.sessions.set(r.session_id, kids);
      byRoom.set(r.session.room_id, entry);
    }

    const rooms: KidsAttendanceRoom[] = [...byRoom.entries()]
      .map(([room_id, { name, sessions }]) => {
        const total = [...sessions.values()].reduce((sum, kids) => sum + kids.size, 0);
        return {
          room_id,
          room_name: name,
          sessions_counted: sessions.size,
          total_children: total,
          average_children: round1(total / sessions.size),
        };
      })
      .sort((a, b) => a.room_name.localeCompare(b.room_name, 'pt-BR'));

    return {
      period: { date_from: from, date_to: to },
      sessions_counted: rooms.reduce((sum, r) => sum + r.sessions_counted, 0),
      rooms,
    };
  }
}
