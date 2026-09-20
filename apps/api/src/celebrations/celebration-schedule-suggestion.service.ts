import { Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
type DayKey = (typeof DAY_KEYS)[number];
type Slot = 'morning' | 'afternoon' | 'evening';

// Um assignment `declined` nunca foi cumprido e um `swapped` foi repassado a outra
// pessoa — nenhum dos dois conta como "serviu" para efeito de rodízio.
const ROTATION_STATUSES: AssignmentStatus[] = [AssignmentStatus.pending, AssignmentStatus.confirmed];

// Teto de sugestões por função: evita payload grande em ministérios com dezenas de
// voluntários. `eligible_count` continua informando o total elegível para quem
// quiser rolar a lista manualmente (fora do escopo desta entrega).
const MAX_SUGGESTIONS_PER_MINISTRY = 10;

export interface VolunteerSuggestion {
  volunteer_profile_id: string;
  person_id: string;
  full_name: string;
  times_served: number;
  last_served_at: Date | null;
}

export interface MinistrySuggestion {
  celebration_ministry_id: string;
  ministry_id: string;
  ministry_name: string;
  slots: number;
  already_assigned_count: number;
  slots_remaining: number;
  eligible_count: number;
  suggestions: VolunteerSuggestion[];
}

interface CandidateProfile {
  id: string;
  availability: unknown;
  person: { id: string; full_name: string };
}

interface MinistryRow {
  id: string;
  ministry_id: string;
  slots: number;
  ministry: { name: string };
  assignments: { volunteer_profile_id: string }[];
}

function resolveDayKey(date: Date): DayKey {
  return DAY_KEYS[date.getUTCDay()]!;
}

// Celebration.start_time é "HH:MM" (validado no DTO). Os três baldes espelham os
// mesmos rótulos de VolunteerProfile.availability (morning/afternoon/evening) —
// ver create-volunteer-profile.dto.ts.
function resolveSlot(startTime: string): Slot {
  const hour = parseInt(startTime.split(':')[0]!, 10);
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

// availability é Json livre (Prisma.JsonValue): tratamos qualquer formato
// inesperado como "não disponível" em vez de lançar.
function isAvailableOn(availability: unknown, dayKey: DayKey, slot: Slot): boolean {
  if (!availability || typeof availability !== 'object') return false;
  const daySlots = (availability as Record<string, unknown>)[dayKey];
  return Array.isArray(daySlots) && daySlots.includes(slot);
}

@Injectable()
export class CelebrationScheduleSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sugere voluntários para cada função (CelebrationMinistry) já vinculada à escala
   * da instância — a sugestão preenche funções existentes, não decide quais funções
   * a celebração precisa (isso é `addMinistry`/`applyTemplate`, que rodam antes).
   */
  async suggest(
    tenantId: string,
    congregationId: string,
    instanceId: string,
  ): Promise<MinistrySuggestion[]> {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id: instanceId, tenant_id: tenantId, congregation_id: congregationId },
      select: {
        scheduled_date: true,
        celebration: { select: { start_time: true } },
        schedule: {
          select: {
            ministries: {
              select: {
                id: true,
                ministry_id: true,
                slots: true,
                ministry: { select: { name: true } },
                assignments: { select: { volunteer_profile_id: true } },
              },
            },
          },
        },
      },
    });
    if (!instance) throw new NotFoundException('Instância de celebração não encontrada');
    if (!instance.schedule || instance.schedule.ministries.length === 0) return [];

    const dayKey = resolveDayKey(instance.scheduled_date);
    const slot = resolveSlot(instance.celebration.start_time);

    const targetDate = new Date(instance.scheduled_date);
    targetDate.setUTCHours(0, 0, 0, 0);

    return Promise.all(
      instance.schedule.ministries.map((cm) =>
        this.suggestForMinistry(tenantId, congregationId, cm, dayKey, slot, targetDate),
      ),
    );
  }

  private async suggestForMinistry(
    tenantId: string,
    congregationId: string,
    cm: MinistryRow,
    dayKey: DayKey,
    slot: Slot,
    targetDate: Date,
  ): Promise<MinistrySuggestion> {
    const assignedIds = new Set(cm.assignments.map((a) => a.volunteer_profile_id));
    const base = {
      celebration_ministry_id: cm.id,
      ministry_id: cm.ministry_id,
      ministry_name: cm.ministry.name,
      slots: cm.slots,
      already_assigned_count: assignedIds.size,
      slots_remaining: Math.max(cm.slots - assignedIds.size, 0),
    };

    const memberships = await this.prisma.client.volunteerMinistry.findMany({
      where: { ministry_id: cm.ministry_id, tenant_id: tenantId, congregation_id: congregationId },
      select: {
        volunteerProfile: {
          select: { id: true, availability: true, person: { select: { id: true, full_name: true } } },
        },
      },
    });

    const candidates: CandidateProfile[] = memberships
      .map((m) => m.volunteerProfile)
      .filter((p) => !assignedIds.has(p.id))
      .filter((p) => isAvailableOn(p.availability, dayKey, slot));

    if (candidates.length === 0) {
      return { ...base, eligible_count: 0, suggestions: [] };
    }

    const candidateIds = candidates.map((c) => c.id);

    const [unavailable, history] = await Promise.all([
      this.prisma.client.volunteerUnavailabilityDate.findMany({
        where: {
          tenant_id: tenantId,
          date: targetDate,
          unavailability: { volunteer_profile_id: { in: candidateIds } },
        },
        select: { unavailability: { select: { volunteer_profile_id: true } } },
      }),
      this.prisma.client.celebrationAssignment.findMany({
        where: {
          tenant_id: tenantId,
          volunteer_profile_id: { in: candidateIds },
          status: { in: ROTATION_STATUSES },
          celebrationMinistry: { ministry_id: cm.ministry_id },
        },
        select: {
          volunteer_profile_id: true,
          celebrationMinistry: {
            select: { schedule: { select: { celebrationInstance: { select: { scheduled_date: true } } } } },
          },
        },
      }),
    ]);

    const unavailableIds = new Set(unavailable.map((u) => u.unavailability.volunteer_profile_id));
    const eligible = candidates.filter((c) => !unavailableIds.has(c.id));

    const stats = new Map<string, { count: number; lastServedAt: Date | null }>();
    for (const h of history) {
      const date = h.celebrationMinistry.schedule.celebrationInstance.scheduled_date;
      const current = stats.get(h.volunteer_profile_id) ?? { count: 0, lastServedAt: null };
      current.count += 1;
      if (!current.lastServedAt || date > current.lastServedAt) current.lastServedAt = date;
      stats.set(h.volunteer_profile_id, current);
    }

    const suggestions = eligible
      .map((c) => {
        const s = stats.get(c.id) ?? { count: 0, lastServedAt: null };
        return {
          volunteer_profile_id: c.id,
          person_id: c.person.id,
          full_name: c.person.full_name,
          times_served: s.count,
          last_served_at: s.lastServedAt,
        };
      })
      // Menos vezes na função primeiro; empatado, quem serviu há mais tempo (ou nunca
      // serviu, que vale como "há mais tempo" possível); empatado ainda, nome estável.
      .sort((a, b) => {
        if (a.times_served !== b.times_served) return a.times_served - b.times_served;
        const aTime = a.last_served_at?.getTime() ?? -Infinity;
        const bTime = b.last_served_at?.getTime() ?? -Infinity;
        if (aTime !== bTime) return aTime - bTime;
        return a.full_name.localeCompare(b.full_name);
      })
      .slice(0, MAX_SUGGESTIONS_PER_MINISTRY);

    return { ...base, eligible_count: eligible.length, suggestions };
  }
}
