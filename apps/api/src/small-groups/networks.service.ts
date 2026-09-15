import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Network } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateNetworkDto } from './dto/create-network.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';
import { classifyHealth } from './small-groups.service';

export type NetworkGoalStatus = {
  goal_pct: number | null;
  current_pct: number | null;
  met: boolean | null;
  green: number;
  yellow: number;
  red: number;
  total: number;
};

// CRUD de Network (PROD-20, CEL20-07) — mesmo padrão de SmallGroupsService:
// tenant/congregação vêm do JwtPayload, NotFoundException em
// findOne/update/remove quando o id não existe.
@Injectable()
export class NetworksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNetworkDto, user: JwtPayload): Promise<Network> {
    await this.assertLeaderExists(dto.leader_person_id, user.tenant_id);

    return this.prisma.client.network.create({
      data: {
        ...dto,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  // Mesmo padrão de SmallGroupsService.multiply para leader_person_id:
  // SPEC_DEVIATION (design.md pede NotFoundException, spec.md AC2 é
  // explícita — 400) resolvida a favor do spec.md, BadRequestException com
  // a mesma mensagem. Sem isso, um leader_person_id inexistente ou de outro
  // tenant estoura P2003 (FK) do Prisma como 500 genérico.
  private async assertLeaderExists(
    leaderPersonId: string | null | undefined,
    tenantId: string,
  ): Promise<void> {
    if (!leaderPersonId) return;

    const leader = await this.prisma.client.person.findUnique({
      where: { id: leaderPersonId },
      select: { id: true, tenant_id: true },
    });
    if (!leader || leader.tenant_id !== tenantId) {
      throw new BadRequestException('Pessoa não encontrada');
    }
  }

  async findAll(): Promise<Network[]> {
    return this.prisma.client.network.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Network> {
    const network = await this.prisma.client.network.findUnique({ where: { id } });
    if (!network) throw new NotFoundException('Rede não encontrada');
    return network;
  }

  async update(id: string, dto: UpdateNetworkDto): Promise<Network> {
    const existing = await this.prisma.client.network.findUnique({
      where: { id },
      select: { id: true, tenant_id: true },
    });
    if (!existing) throw new NotFoundException('Rede não encontrada');

    await this.assertLeaderExists(dto.leader_person_id, existing.tenant_id);

    return this.prisma.client.network.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<Network> {
    const existing = await this.prisma.client.network.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Rede não encontrada');
    return this.prisma.client.network.delete({ where: { id } });
  }

  // Status da meta de saúde da rede (PROD-20, CEL20-08): agrega o semáforo
  // (classifyHealth, mesma função pura de SmallGroupsService) de todas as
  // células da rede numa única consulta agregada, cobrindo os 3 casos do AC:
  // com meta, sem meta (goal_pct/met null) e sem células (total 0,
  // current_pct null — sem dividir por zero).
  async getGoalStatus(id: string): Promise<NetworkGoalStatus> {
    const network = await this.prisma.client.network.findUnique({
      where: { id },
      select: { health_goal_pct: true },
    });
    if (!network) throw new NotFoundException('Rede não encontrada');

    const goalPct = network.health_goal_pct ?? null;

    const groups = await this.prisma.client.smallGroup.findMany({
      where: { network_id: id },
      select: { id: true },
    });
    const total = groups.length;

    if (total === 0) {
      return { goal_pct: goalPct, current_pct: null, met: null, green: 0, yellow: 0, red: 0, total: 0 };
    }

    const groupIds = groups.map((g) => g.id);
    const rows = await this.prisma.client.groupMeeting.groupBy({
      by: ['small_group_id'],
      where: { small_group_id: { in: groupIds } },
      _max: { occurred_at: true },
    });
    const lastMeetingByGroupId = new Map(rows.map((r) => [r.small_group_id, r._max.occurred_at]));

    let green = 0;
    let yellow = 0;
    let red = 0;
    for (const groupId of groupIds) {
      const status = classifyHealth(lastMeetingByGroupId.get(groupId) ?? null);
      if (status === 'green') green += 1;
      else if (status === 'yellow') yellow += 1;
      else red += 1;
    }

    const currentPct = Math.round(((green + yellow) / total) * 10000) / 100;
    const met = goalPct === null ? null : currentPct >= goalPct;

    return { goal_pct: goalPct, current_pct: currentPct, met, green, yellow, red, total };
  }
}
