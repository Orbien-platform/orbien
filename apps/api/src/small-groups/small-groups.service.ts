import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GroupMemberRole,
  GroupMembership,
  Person,
  Prisma,
  SmallGroup,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSmallGroupDto } from './dto/create-small-group.dto';
import { UpdateSmallGroupDto } from './dto/update-small-group.dto';
import { ListSmallGroupsQueryDto } from './dto/list-small-groups-query.dto';
import { AddMemberDto } from './dto/add-member.dto';

type SmallGroupSummary = SmallGroup & {
  leader: Person;
  _count: { memberships: number };
};

type SmallGroupDetail = SmallGroup & {
  leader: Person;
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

type HierarchyRow = {
  id: string;
  name: string;
  type: string;
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

  async findAll(
    query: ListSmallGroupsQueryDto,
  ): Promise<PaginatedSmallGroups> {
    const { type, is_public, search, page, limit } = query;

    const where: Prisma.SmallGroupWhereInput = {};
    if (type) where.type = type;
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
        memberships: { include: { person: true } },
        parentGroup: true,
        childGroups: true,
      },
    });

    if (!group) throw new NotFoundException('Grupo não encontrado');
    return group as SmallGroupDetail;
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
          id, name, type::text AS type, parent_group_id, leader_person_id,
          is_public, meeting_time, recurrence, 1 AS depth
        FROM small_groups
        WHERE id = ${groupId}

        UNION ALL

        SELECT
          sg.id, sg.name, sg.type::text, sg.parent_group_id, sg.leader_person_id,
          sg.is_public, sg.meeting_time, sg.recurrence, h.depth + 1
        FROM small_groups sg
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
}
