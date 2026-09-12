import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupMemberRole, PrayerRequest } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePrayerRequestDto } from './dto/create-prayer-request.dto';

/**
 * Pedido de oração da célula (PROD-01).
 *
 * Duas regras que valem para as três rotas e não são negociáveis aqui:
 *
 * 1. **Participação, não papel.** Toda rota resolve a pessoa do token e exige
 *    `GroupMembership` no grupo pedido — inclusive para `pastor` e
 *    `admin_congregation`. É deliberadamente mais estrito que o resto do
 *    módulo (`findByGroup`/`listMaterials` checam só a role do JWT, que é a
 *    PEND-01 do `docs/PLANO.md`): pedido de oração carrega saúde, família e
 *    conflito, e o desenho da célula é que isso fica na célula. Afrouxar é
 *    decisão de produto, não refactor.
 * 2. **Anônimo esconde de gente, não do banco.** `person_id` é sempre
 *    gravado; a resposta é que omite o autor quando `is_anonymous` e quem lê
 *    não é o próprio autor. Sem isso a retenção da seção 5 (LGPD) não teria a
 *    quem vincular a linha e o autor não poderia apagar o que escreveu.
 */

export type PrayerRequestView = {
  id: string;
  content: string;
  is_anonymous: boolean;
  created_at: Date;
  person: { id: string; full_name: string } | null;
  is_mine: boolean;
  // Quem pode apagar sai daqui, não da adivinhação do front: é `is_mine` ou a
  // liderança daquela célula. Sem isso a tela desenharia lixeira em pedido
  // alheio e o clique viraria 403.
  can_delete: boolean;
};

@Injectable()
export class PrayerRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    groupId: string,
    dto: CreatePrayerRequestDto,
    user: JwtPayload,
  ): Promise<PrayerRequest> {
    const { personId } = await this.requireMembership(groupId, user);

    return this.prisma.client.prayerRequest.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        small_group_id: groupId,
        person_id: personId,
        content: dto.content,
        is_anonymous: dto.is_anonymous ?? false,
      },
    });
  }

  async findByGroup(groupId: string, user: JwtPayload): Promise<PrayerRequestView[]> {
    const { personId, role } = await this.requireMembership(groupId, user);
    const isLeader = role === 'leader';

    const requests = await this.prisma.client.prayerRequest.findMany({
      where: { small_group_id: groupId },
      orderBy: { created_at: 'desc' },
      include: { person: { select: { id: true, full_name: true } } },
    });

    return requests.map((r) => {
      const is_mine = r.person_id === personId;
      return {
        id: r.id,
        content: r.content,
        is_anonymous: r.is_anonymous,
        created_at: r.created_at,
        // O autor continua vendo o próprio nome no anônimo: é como ele
        // reconhece o pedido dele na lista para poder apagar.
        person: r.is_anonymous && !is_mine ? null : r.person,
        is_mine,
        can_delete: is_mine || isLeader,
      };
    });
  }

  async remove(groupId: string, requestId: string, user: JwtPayload): Promise<{ id: string }> {
    const { personId, role } = await this.requireMembership(groupId, user);

    const request = await this.prisma.client.prayerRequest.findFirst({
      where: { id: requestId, small_group_id: groupId },
      select: { id: true, person_id: true },
    });
    if (!request) throw new NotFoundException('Pedido de oração não encontrado');

    // Líder do grupo modera o que não é dele; qualquer outro membro, não. A
    // checagem é na `GroupMembership.role`, não no papel do JWT: quem lidera
    // esta célula é o que importa, não quem lidera alguma.
    if (request.person_id !== personId && role !== 'leader') {
      throw new ForbiddenException('Só o autor ou o líder do grupo pode remover o pedido');
    }

    await this.prisma.client.prayerRequest.delete({ where: { id: requestId } });
    return { id: requestId };
  }

  /**
   * Resolve a pessoa do token e prova a participação no grupo. Mesmo padrão de
   * resolução de `SmallGroupsService.findMine` — os módulos não compartilham
   * service base, então é replicado, não importado.
   */
  private async requireMembership(
    groupId: string,
    user: JwtPayload,
  ): Promise<{ personId: string; role: GroupMemberRole }> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const membership = await this.prisma.client.groupMembership.findUnique({
      where: {
        small_group_id_person_id: { small_group_id: groupId, person_id: account.person_id },
      },
      select: { role: true },
    });
    if (!membership) {
      throw new ForbiddenException('Você não participa deste grupo');
    }

    return { personId: account.person_id, role: membership.role };
  }
}
