import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CelebrationInstanceStatus, KidsRoom } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplyKidsTemplateDto } from './dto/apply-kids-template.dto';
import { DEFAULT_TIMEZONE, todayUtcMidnight } from './kids-sessions.service';

export interface ApplyKidsTemplateResult {
  instances: number;
  created: number;
  already_open: number;
  skipped_rooms: number;
}

// `scheduled_date` é data civil gravada à meia-noite UTC.
const dayStart = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);

/**
 * Modelo de turmas padrão de uma celebração (`celebrations.kids_default_room_ids`)
 * e a aplicação dele em lote nas próximas instâncias (spec P1 Turmas, AC 7).
 */
@Injectable()
export class KidsTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  private async findCelebration(tenantId: string, congregationId: string, id: string) {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true, kids_default_room_ids: true },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');
    return celebration;
  }

  private findRooms(tenantId: string, congregationId: string, ids: string[]): Promise<KidsRoom[]> {
    return this.prisma.client.kidsRoom.findMany({
      where: { id: { in: ids }, tenant_id: tenantId, congregation_id: congregationId },
      orderBy: [{ min_age_months: 'asc' }, { name: 'asc' }],
    });
  }

  async get(tenantId: string, congregationId: string, celebrationId: string) {
    const celebration = await this.findCelebration(tenantId, congregationId, celebrationId);
    const ids = celebration.kids_default_room_ids;
    const rooms = ids.length ? await this.findRooms(tenantId, congregationId, ids) : [];
    return { celebration_id: celebration.id, room_ids: ids, rooms };
  }

  // Substitui o modelo. Lista vazia limpa.
  async set(tenantId: string, congregationId: string, celebrationId: string, roomIds: string[]) {
    await this.findCelebration(tenantId, congregationId, celebrationId);

    if (roomIds.length > 0) {
      const rooms = await this.findRooms(tenantId, congregationId, roomIds);
      if (rooms.length !== roomIds.length) throw new NotFoundException('Turma não encontrada');
      if (rooms.some((r) => !r.is_active)) {
        throw new UnprocessableEntityException('Turma desativada não entra no modelo');
      }
    }

    const saved = await this.prisma.client.celebration.update({
      where: { id: celebrationId },
      data: { kids_default_room_ids: roomIds },
      select: { id: true, kids_default_room_ids: true },
    });
    return { celebration_id: saved.id, room_ids: saved.kids_default_room_ids };
  }

  // Abre as turmas do modelo nas instâncias futuras e não canceladas. Idempotente:
  // par que já existe é pulado (`skipDuplicates`), não é erro — o 409 da abertura
  // avulsa não faz sentido num lote.
  async apply(
    tenantId: string,
    congregationId: string,
    celebrationId: string,
    dto: ApplyKidsTemplateDto,
    now = new Date(),
  ): Promise<ApplyKidsTemplateResult> {
    const celebration = await this.findCelebration(tenantId, congregationId, celebrationId);
    const templateIds = celebration.kids_default_room_ids;
    if (templateIds.length === 0) {
      throw new UnprocessableEntityException('Esta celebração não tem modelo de turmas kids');
    }

    // O modelo é uma lista de atalho: a turma pode ter sido desativada depois.
    const rooms = (await this.findRooms(tenantId, congregationId, templateIds)).filter((r) => r.is_active);
    if (rooms.length === 0) {
      throw new UnprocessableEntityException('Nenhuma turma do modelo está ativa');
    }
    const skippedRooms = templateIds.length - rooms.length;

    // Sem `date_from`, "hoje" é o dia civil da congregação (não o dia UTC): às
    // 21:30 em São Paulo já é o dia seguinte em UTC e o culto de hoje ficaria de fora.
    let from: Date;
    if (dto.date_from) {
      from = dayStart(dto.date_from);
    } else {
      const congregation = await this.prisma.client.congregation.findFirst({
        where: { id: congregationId, tenant_id: tenantId },
        select: { timezone: true },
      });
      from = todayUtcMidnight(congregation?.timezone ?? DEFAULT_TIMEZONE, now);
    }

    const instances = await this.prisma.client.celebrationInstance.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_id: celebrationId,
        status: { notIn: [CelebrationInstanceStatus.cancelled, CelebrationInstanceStatus.finalized] },
        scheduled_date: {
          gte: from,
          ...(dto.date_to && { lte: dayStart(dto.date_to) }),
        },
      },
      select: { id: true },
    });
    if (instances.length === 0) {
      return { instances: 0, created: 0, already_open: 0, skipped_rooms: skippedRooms };
    }

    const data = instances.flatMap((i) =>
      rooms.map((r) => ({
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_instance_id: i.id,
        room_id: r.id,
      })),
    );
    const { count } = await this.prisma.client.kidsSession.createMany({ data, skipDuplicates: true });

    return {
      instances: instances.length,
      created: count,
      already_open: data.length - count,
      skipped_rooms: skippedRooms,
    };
  }
}
