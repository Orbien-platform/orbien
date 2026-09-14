import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateGroupMessageDto } from './dto/create-group-message.dto';
import { ListGroupMessagesQueryDto } from './dto/list-group-messages-query.dto';

/**
 * Chat fechado da célula (PROD-09).
 *
 * "Fechado" é a regra inteira, e é a mesma de `PrayerRequestsService`
 * (PROD-01): toda rota resolve a pessoa do token e exige `GroupMembership`
 * no grupo pedido — inclusive para `pastor`, `admin_congregation` e
 * `tenant_admin`. Papel alto no JWT entra na célula participando dela, não
 * por cima dela. O RLS de `012_rls_group_messages.sql` é o piso (tenant +
 * congregação) e não conhece participação em grupo; quem fecha o chat na
 * célula é este service.
 *
 * Apagar é soft delete (`deleted_at`): a mensagem vira lápide na conversa em
 * vez de abrir buraco no meio do histórico, e a moderação do líder deixa
 * rastro. O conteúdo some da resposta, não da tabela.
 */

export type GroupMessageView = {
  id: string;
  content: string;
  created_at: Date;
  person: { id: string; full_name: string };
  is_mine: boolean;
  is_deleted: boolean;
  // Quem pode apagar sai daqui, não da adivinhação do front — mesmo contrato
  // de `PrayerRequestView.can_delete`: é o autor ou a liderança daquela
  // célula.
  can_delete: boolean;
};

export type GroupMessagePage = {
  messages: GroupMessageView[];
  // Só responde pela janela pedida: `true` quando ainda há mensagem mais
  // antiga que a primeira desta página. Em consulta com `after` (o polling)
  // é sempre `false` — ali não se rola histórico.
  has_more: boolean;
};

type MessageRow = {
  id: string;
  content: string;
  deleted_at: Date | null;
  created_at: Date;
  person_id: string;
  person: { id: string; full_name: string };
};

@Injectable()
export class GroupMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    groupId: string,
    dto: CreateGroupMessageDto,
    user: JwtPayload,
  ): Promise<GroupMessageView> {
    const { personId, role } = await this.requireMembership(groupId, user);

    const message = await this.prisma.client.groupMessage.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        small_group_id: groupId,
        person_id: personId,
        content: dto.content.trim(),
      },
      include: { person: { select: { id: true, full_name: true } } },
    });

    return this.toView(message, personId, role === 'leader');
  }

  async findByGroup(
    groupId: string,
    query: ListGroupMessagesQueryDto,
    user: JwtPayload,
  ): Promise<GroupMessagePage> {
    const { personId, role } = await this.requireMembership(groupId, user);
    const isLeader = role === 'leader';

    if (query.before && query.after) {
      throw new BadRequestException('Use `before` ou `after`, não os dois');
    }

    // `limit` chega sempre preenchido: o default é do DTO, aplicado pelo
    // ValidationPipe — não há caminho em que ele falte.
    const limit = query.limit;

    // `after` é o caminho do polling: devolve em ordem crescente só o que
    // chegou depois do cursor, sem `has_more` — quem chama já tem o resto.
    if (query.after) {
      const cursor = await this.requireCursor(groupId, query.after);
      const rows = await this.prisma.client.groupMessage.findMany({
        where: { small_group_id: groupId, ...this.newerThan(cursor) },
        orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
        take: limit,
        include: { person: { select: { id: true, full_name: true } } },
      });
      return {
        messages: rows.map((r) => this.toView(r, personId, isLeader)),
        has_more: false,
      };
    }

    // Histórico: busca do mais novo para o mais antigo (é o fim da conversa
    // que interessa primeiro) e devolve invertido, em ordem de leitura. O
    // `take: limit + 1` é o que responde `has_more` sem um count à parte.
    const cursor = query.before ? await this.requireCursor(groupId, query.before) : null;
    const rows = await this.prisma.client.groupMessage.findMany({
      where: {
        small_group_id: groupId,
        ...(cursor ? this.olderThan(cursor) : {}),
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { person: { select: { id: true, full_name: true } } },
    });

    const has_more = rows.length > limit;
    const page = has_more ? rows.slice(0, limit) : rows;

    return {
      messages: page.reverse().map((r) => this.toView(r, personId, isLeader)),
      has_more,
    };
  }

  async remove(
    groupId: string,
    messageId: string,
    user: JwtPayload,
  ): Promise<{ id: string }> {
    const { personId, role } = await this.requireMembership(groupId, user);

    const message = await this.prisma.client.groupMessage.findFirst({
      where: { id: messageId, small_group_id: groupId },
      select: { id: true, person_id: true, deleted_at: true },
    });
    if (!message) throw new NotFoundException('Mensagem não encontrada');

    // Líder do grupo modera o que não é dele; qualquer outro membro, não. A
    // checagem é na `GroupMembership.role`, não no papel do JWT: quem lidera
    // esta célula é o que importa, não quem lidera alguma.
    if (message.person_id !== personId && role !== 'leader') {
      throw new ForbiddenException('Só o autor ou o líder do grupo pode remover a mensagem');
    }

    // Apagar de novo é no-op, não erro: dois cliques na mesma lixeira (ou o
    // autor e o líder ao mesmo tempo) não devem virar 404 nem mexer na data
    // do primeiro apagamento.
    if (!message.deleted_at) {
      await this.prisma.client.groupMessage.update({
        where: { id: messageId },
        data: { deleted_at: new Date() },
      });
    }

    return { id: messageId };
  }

  /**
   * Resolve a mensagem-cursor dentro do grupo. Ela é buscada, e não aceita
   * como data crua vinda do cliente, por dois motivos: o par
   * (`created_at`, `id`) desempata mensagens do mesmo milissegundo, e um id
   * de outro grupo não pode virar janela de leitura aqui.
   */
  private async requireCursor(
    groupId: string,
    messageId: string,
  ): Promise<{ id: string; created_at: Date }> {
    const cursor = await this.prisma.client.groupMessage.findFirst({
      where: { id: messageId, small_group_id: groupId },
      select: { id: true, created_at: true },
    });
    if (!cursor) throw new NotFoundException('Mensagem do cursor não encontrada');
    return cursor;
  }

  private olderThan(cursor: { id: string; created_at: Date }) {
    return {
      OR: [
        { created_at: { lt: cursor.created_at } },
        { created_at: cursor.created_at, id: { lt: cursor.id } },
      ],
    };
  }

  private newerThan(cursor: { id: string; created_at: Date }) {
    return {
      OR: [
        { created_at: { gt: cursor.created_at } },
        { created_at: cursor.created_at, id: { gt: cursor.id } },
      ],
    };
  }

  private toView(row: MessageRow, personId: string, isLeader: boolean): GroupMessageView {
    const is_mine = row.person_id === personId;
    const is_deleted = row.deleted_at !== null;
    return {
      id: row.id,
      // A lápide não carrega o texto: soft delete é para o histórico não
      // perder o fio, não para o conteúdo continuar legível na API.
      content: is_deleted ? '' : row.content,
      created_at: row.created_at,
      person: row.person,
      is_mine,
      is_deleted,
      can_delete: !is_deleted && (is_mine || isLeader),
    };
  }

  /**
   * Resolve a pessoa do token e prova a participação no grupo. Mesmo padrão de
   * `PrayerRequestsService.requireMembership` — os módulos não compartilham
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
