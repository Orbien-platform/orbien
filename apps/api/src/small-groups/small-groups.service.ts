import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupMemberRole,
  GroupMembership,
  GroupType,
  Person,
  Prisma,
  SmallGroup,
  SmallGroupVisitRequest,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSmallGroupDto } from './dto/create-small-group.dto';
import { UpdateSmallGroupDto } from './dto/update-small-group.dto';
import { MultiplySmallGroupDto } from './dto/multiply-small-group.dto';
import { ListSmallGroupsQueryDto } from './dto/list-small-groups-query.dto';
import { AddMemberDto } from './dto/add-member.dto';

// Quem pode multiplicar sem depender de ser o líder desta célula específica
// (design.md, "Permissões de multiply"). cell_leader entra pelo ALERT_ROLES do
// controller (RolesGuard já libera a rota); o service é quem confirma que,
// sendo só cell_leader, é o líder DESTA célula.
const MULTIPLY_MANAGE_ROLES = ['tenant_admin', 'admin_congregation', 'pastor'];

type GroupTypeSummary = Pick<GroupType, 'id' | 'name' | 'color'>;
const GROUP_TYPE_SUMMARY_SELECT = { id: true, name: true, color: true } as const;

type SmallGroupSummary = SmallGroup & {
  leader: Person;
  groupType: GroupTypeSummary;
  _count: { memberships: number };
};

type SmallGroupDetail = SmallGroup & {
  leader: Person;
  groupType: GroupTypeSummary;
  memberships: Array<GroupMembership & { person: Person }>;
  parentGroup: SmallGroup | null;
  childGroups: SmallGroup[];
};

type PaginatedSmallGroups = {
  data: SmallGroupSummary[];
  total: number;
  page: number;
  limit: number;
};

export type SmallGroupMine = {
  id: string;
  name: string;
  meeting_time: string | null;
  recurrence: string | null;
  role: GroupMemberRole;
};

type HierarchyRow = {
  id: string;
  name: string;
  group_type_id: string;
  group_type_name: string | null;
  parent_group_id: string | null;
  leader_person_id: string;
  is_public: boolean;
  meeting_time: string | null;
  recurrence: string | null;
  depth: number;
};

type HierarchyNode = Omit<HierarchyRow, 'depth'> & { children: HierarchyNode[] };

function buildTree(flat: HierarchyRow[], nodeId: string): HierarchyNode | null {
  const node = flat.find((n) => n.id === nodeId);
  if (!node) return null;
  const { depth: _depth, ...rest } = node;
  return {
    ...rest,
    children: flat
      .filter((n) => n.parent_group_id === nodeId)
      .map((c) => buildTree(flat, c.id)!)
      .filter(Boolean),
  };
}

@Injectable()
export class SmallGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSmallGroupDto, user: JwtPayload): Promise<SmallGroup> {
    if (dto.parent_group_id) {
      const parent = await this.prisma.client.smallGroup.findUnique({
        where: { id: dto.parent_group_id },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Grupo pai não encontrado');
    }

    const groupType = await this.prisma.client.groupType.findUnique({
      where: { id: dto.group_type_id },
      select: { id: true },
    });
    if (!groupType) throw new NotFoundException('Tipo de grupo não encontrado');

    return this.prisma.runInTx(
      async (tx) => {
        const group = await tx.smallGroup.create({
          data: {
            ...dto,
            is_public: dto.is_public ?? false,
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
          },
        });

        await tx.groupMembership.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            small_group_id: group.id,
            person_id: dto.leader_person_id,
            role: GroupMemberRole.leader,
          },
        });

        return group;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  // Design.md, "Permissões de multiply": o RolesGuard já liberou a rota por
  // ALERT_ROLES (inclui cell_leader de qualquer célula). Quem tem
  // MULTIPLY_MANAGE_ROLES multiplica qualquer célula do tenant; quem só tem
  // cell_leader precisa ser o líder DESTA célula — por leader_person_id ou
  // por um RoleAssignment escopado a ela (small_group_id).
  private async canMultiply(user: JwtPayload, mother: SmallGroup): Promise<boolean> {
    if (MULTIPLY_MANAGE_ROLES.some((role) => user.roles.includes(role))) return true;

    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });
    if (account?.person_id && account.person_id === mother.leader_person_id) return true;

    const assignment = await this.prisma.client.roleAssignment.findFirst({
      where: {
        user_account_id: user.sub,
        small_group_id: mother.id,
        role_code: 'cell_leader',
      },
      select: { id: true },
    });
    return !!assignment;
  }

  // Multiplicação de célula (PROD-20, CEL20-01 a 03): cria a filha e move os
  // membros escolhidos numa única transação. Validação em duas etapas: antes
  // de abrir a transação (líder existe no tenant) e dentro dela, com
  // recontagem (member_ids ainda pertencem à mãe) — cobre tanto IDs inválidos
  // quanto a corrida de duas multiplicações concorrentes movendo o mesmo
  // person_id (edge case da spec).
  async multiply(
    motherId: string,
    dto: MultiplySmallGroupDto,
    user: JwtPayload,
  ): Promise<SmallGroup> {
    const mother = await this.prisma.client.smallGroup.findUnique({
      where: { id: motherId },
    });
    if (!mother) throw new NotFoundException('Grupo não encontrado');

    if (!(await this.canMultiply(user, mother))) {
      throw new ForbiddenException('Você só pode multiplicar células que lidera');
    }

    // SPEC_DEVIATION: design.md (Error Handling Strategy) descreve
    // NotFoundException (404) para leader_person_id de outro tenant, mas a
    // spec.md AC2 é explícita: "sistema SHALL responder 400" tanto para
    // leader_person_id inválido quanto para member_ids inválidos. spec.md é
    // a fonte de verdade dos critérios de aceite — seguido aqui como 400.
    const leader = await this.prisma.client.person.findUnique({
      where: { id: dto.leader_person_id },
      select: { id: true, tenant_id: true },
    });
    if (!leader || leader.tenant_id !== mother.tenant_id) {
      throw new BadRequestException('Pessoa não encontrada');
    }

    const memberIds = dto.member_ids ?? [];

    return this.prisma.runInTx(
      async (tx) => {
        if (memberIds.length > 0) {
          const activeCount = await tx.groupMembership.count({
            where: { small_group_id: motherId, person_id: { in: memberIds } },
          });
          if (activeCount !== memberIds.length) {
            throw new BadRequestException(
              'Um ou mais membros informados não pertencem a este grupo',
            );
          }
        }

        const child = await tx.smallGroup.create({
          data: {
            name: dto.name,
            group_type_id: mother.group_type_id,
            parent_group_id: motherId,
            tenant_id: mother.tenant_id,
            congregation_id: mother.congregation_id,
            leader_person_id: dto.leader_person_id,
            meeting_time: dto.meeting_time,
            recurrence: dto.recurrence,
            address: dto.address,
          },
        });

        if (memberIds.length > 0) {
          await tx.groupMembership.updateMany({
            where: { small_group_id: motherId, person_id: { in: memberIds } },
            data: { small_group_id: child.id },
          });
        }

        await tx.groupMembership.upsert({
          where: {
            small_group_id_person_id: {
              small_group_id: child.id,
              person_id: dto.leader_person_id,
            },
          },
          create: {
            tenant_id: mother.tenant_id,
            congregation_id: mother.congregation_id,
            small_group_id: child.id,
            person_id: dto.leader_person_id,
            role: GroupMemberRole.leader,
          },
          update: { role: GroupMemberRole.leader },
        });

        return child;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async findAll(
    query: ListSmallGroupsQueryDto,
  ): Promise<PaginatedSmallGroups> {
    const { group_type_id, is_public, search, page, limit } = query;

    const where: Prisma.SmallGroupWhereInput = {};
    if (group_type_id) where.group_type_id = group_type_id;
    if (is_public !== undefined) where.is_public = is_public;
    if (search) where.name = { contains: search, mode: 'insensitive' };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.client.smallGroup.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          leader: true,
          groupType: { select: GROUP_TYPE_SUMMARY_SELECT },
          _count: { select: { memberships: true } },
        },
      }),
      this.prisma.client.smallGroup.count({ where }),
    ]);

    return { data: data as SmallGroupSummary[], total, page, limit };
  }

  async findOne(id: string): Promise<SmallGroupDetail> {
    const group = await this.prisma.client.smallGroup.findUnique({
      where: { id },
      include: {
        leader: true,
        groupType: { select: GROUP_TYPE_SUMMARY_SELECT },
        memberships: { include: { person: true } },
        parentGroup: true,
        childGroups: true,
      },
    });

    if (!group) throw new NotFoundException('Grupo não encontrado');
    return group as SmallGroupDetail;
  }

  // `GroupMembership` é a única fonte comum entre líder e membro (create()
  // já grava uma pro líder, `:103-110`) — "meus grupos" é a mesma consulta
  // pros dois papéis. Mesmo padrão de resolução de pessoa que
  // `CelebrationAssignmentService.resolvePersonId` já usa (módulos não
  // compartilham service base, então replicado aqui). MOB-09-09.
  async findMine(userId: string, tenantId: string, congregationId: string): Promise<SmallGroupMine[]> {
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: userId },
      select: { person_id: true },
    });
    if (!account?.person_id) throw new NotFoundException('Usuário sem vínculo de pessoa');

    const memberships = await this.prisma.client.groupMembership.findMany({
      where: { person_id: account.person_id, tenant_id: tenantId, congregation_id: congregationId },
      include: { smallGroup: { select: { id: true, name: true, meeting_time: true, recurrence: true } } },
    });

    return memberships.map((m) => ({
      id: m.smallGroup.id,
      name: m.smallGroup.name,
      meeting_time: m.smallGroup.meeting_time,
      recurrence: m.smallGroup.recurrence,
      role: m.role,
    }));
  }

  async update(
    id: string,
    dto: UpdateSmallGroupDto,
    user: JwtPayload,
  ): Promise<SmallGroup> {
    const existing = await this.prisma.client.smallGroup.findUnique({
      where: { id },
      select: { id: true, leader_person_id: true },
    });
    if (!existing) throw new NotFoundException('Grupo não encontrado');

    const leaderChanged =
      dto.leader_person_id && dto.leader_person_id !== existing.leader_person_id;

    if (!leaderChanged) {
      return this.prisma.client.smallGroup.update({ where: { id }, data: dto });
    }

    return this.prisma.runInTx(
      async (tx) => {
        await tx.groupMembership.updateMany({
          where: { small_group_id: id, person_id: existing.leader_person_id },
          data: { role: GroupMemberRole.member },
        });

        await tx.groupMembership.upsert({
          where: {
            small_group_id_person_id: {
              small_group_id: id,
              person_id: dto.leader_person_id!,
            },
          },
          create: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            small_group_id: id,
            person_id: dto.leader_person_id!,
            role: GroupMemberRole.leader,
          },
          update: { role: GroupMemberRole.leader },
        });

        return tx.smallGroup.update({ where: { id }, data: dto });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async remove(id: string): Promise<SmallGroup> {
    const existing = await this.prisma.client.smallGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Grupo não encontrado');
    return this.prisma.client.smallGroup.delete({ where: { id } });
  }

  async addMember(
    groupId: string,
    dto: AddMemberDto,
    user: JwtPayload,
  ): Promise<GroupMembership> {
    const role = dto.role ?? GroupMemberRole.member;

    const existing = await this.prisma.client.groupMembership.findUnique({
      where: {
        small_group_id_person_id: {
          small_group_id: groupId,
          person_id: dto.person_id,
        },
      },
    });

    if (existing) {
      if (existing.role === GroupMemberRole.leader && role !== GroupMemberRole.leader) {
        throw new BadRequestException('Remova o líder atual antes de rebaixar');
      }
      return this.prisma.client.groupMembership.update({
        where: { id: existing.id },
        data: { role },
      });
    }

    return this.prisma.client.groupMembership.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        small_group_id: groupId,
        person_id: dto.person_id,
        role,
      },
    });
  }

  async removeMember(groupId: string, personId: string): Promise<GroupMembership> {
    const group = await this.prisma.client.smallGroup.findUnique({
      where: { id: groupId },
      select: { leader_person_id: true },
    });
    if (!group) throw new NotFoundException('Grupo não encontrado');

    if (group.leader_person_id === personId) {
      throw new BadRequestException(
        'Não é possível remover o líder do grupo. Altere o líder antes.',
      );
    }

    const membership = await this.prisma.client.groupMembership.findUnique({
      where: {
        small_group_id_person_id: { small_group_id: groupId, person_id: personId },
      },
    });
    if (!membership) throw new NotFoundException('Membro não encontrado no grupo');

    return this.prisma.client.groupMembership.delete({ where: { id: membership.id } });
  }

  async getHierarchy(groupId: string): Promise<HierarchyNode | null> {
    const rows = await this.prisma.client.$queryRaw<HierarchyRow[]>`
      WITH RECURSIVE hierarchy AS (
        SELECT
          sg.id, sg.name, sg.group_type_id, gt.name AS group_type_name,
          sg.parent_group_id, sg.leader_person_id,
          sg.is_public, sg.meeting_time, sg.recurrence, 1 AS depth
        FROM small_groups sg
        LEFT JOIN group_types gt ON gt.id = sg.group_type_id
        WHERE sg.id = ${groupId}

        UNION ALL

        SELECT
          sg.id, sg.name, sg.group_type_id, gt.name,
          sg.parent_group_id, sg.leader_person_id,
          sg.is_public, sg.meeting_time, sg.recurrence, h.depth + 1
        FROM small_groups sg
        LEFT JOIN group_types gt ON gt.id = sg.group_type_id
        INNER JOIN hierarchy h ON sg.parent_group_id = h.id
        WHERE h.depth < 4
      )
      SELECT * FROM hierarchy
      ORDER BY depth, name
    `;

    return buildTree(rows, groupId);
  }

  async checkAbsenceAlerts(groupId: string): Promise<Person[]> {
    const [memberships, meetings] = await Promise.all([
      this.prisma.client.groupMembership.findMany({
        where: { small_group_id: groupId },
        include: { person: true },
      }),
      this.prisma.client.groupMeeting.findMany({
        where: { small_group_id: groupId },
        orderBy: { occurred_at: 'desc' },
        take: 3,
        select: { id: true },
      }),
    ]);

    if (meetings.length === 0) return [];

    const meetingIds = meetings.map((m) => m.id);

    const attendances = await this.prisma.client.attendanceRecord.findMany({
      where: { group_meeting_id: { in: meetingIds } },
      select: { person_id: true },
      distinct: ['person_id'],
    });

    const presentIds = new Set(attendances.map((a) => a.person_id));

    return memberships
      .filter((m) => !presentIds.has(m.person_id))
      .map((m) => m.person);
  }

  // O outro lado do "Quero visitar" da página pública (PROD-13): a liderança
  // lê aqui os pedidos que chegaram pela célula. O isolamento é o de sempre —
  // contexto do JWT, policy `tenant_congregation_isolation` da tabela — e o
  // `small_group_id` no WHERE é só o recorte, não a autorização: célula de
  // outra congregação já não é visível daqui.
  async listVisitRequests(groupId: string): Promise<SmallGroupVisitRequest[]> {
    return this.prisma.client.smallGroupVisitRequest.findMany({
      where: { small_group_id: groupId },
      orderBy: { created_at: 'desc' },
    });
  }
}
