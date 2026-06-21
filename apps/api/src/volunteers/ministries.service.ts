import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Ministry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';

type MinistryNode = Ministry & { children: MinistryNode[] };

@Injectable()
export class MinistriesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertNoRootExists(
    tenantId: string,
    congregationId: string,
    excludeId?: string,
  ): Promise<void> {
    const existingRoot = await this.prisma.client.ministry.findFirst({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        parent_ministry_id: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (existingRoot) {
      throw new ConflictException('Já existe um ministério raiz. Apenas um ministério principal é permitido.');
    }
  }

  // Verifica que o pai existe, pertence ao mesmo tenant/congregação, não é o
  // próprio ministério, e não é um descendente dele (evitaria ciclo na árvore).
  private async assertValidParent(
    tenantId: string,
    congregationId: string,
    parentId: string,
    selfId?: string,
  ): Promise<void> {
    if (parentId === selfId) {
      throw new BadRequestException('Um ministério não pode ser pai de si mesmo.');
    }

    const parent = await this.prisma.client.ministry.findFirst({
      where: { id: parentId, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Ministério pai não encontrado');

    if (selfId) {
      let current: { id: string; parent_ministry_id: string | null } | null = await this.prisma.client.ministry.findUnique({
        where: { id: parentId },
        select: { id: true, parent_ministry_id: true },
      });
      while (current) {
        if (current.id === selfId) {
          throw new BadRequestException('Não é possível definir um descendente como pai (criaria um ciclo).');
        }
        if (!current.parent_ministry_id) break;
        current = await this.prisma.client.ministry.findUnique({
          where: { id: current.parent_ministry_id },
          select: { id: true, parent_ministry_id: true },
        });
      }
    }
  }

  async create(tenantId: string, congregationId: string, dto: CreateMinistryDto): Promise<Ministry> {
    if (!dto.parent_ministry_id) {
      await this.assertNoRootExists(tenantId, congregationId);
    } else {
      await this.assertValidParent(tenantId, congregationId, dto.parent_ministry_id);
    }

    return this.prisma.client.ministry.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color ?? null,
        parent_ministry_id: dto.parent_ministry_id ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string): Promise<MinistryNode[]> {
    const ministries = await this.prisma.client.ministry.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { name: 'asc' },
    });

    const byId = new Map<string, MinistryNode>(
      ministries.map((m) => [m.id, { ...m, children: [] }]),
    );

    const roots: MinistryNode[] = [];
    for (const node of byId.values()) {
      if (node.parent_ministry_id && byId.has(node.parent_ministry_id)) {
        byId.get(node.parent_ministry_id)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<Ministry> {
    const ministry = await this.prisma.client.ministry.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!ministry) throw new NotFoundException('Ministério não encontrado');
    return ministry;
  }

  async findOneWithMembers(tenantId: string, congregationId: string, id: string) {
    const ministry = await this.findOne(tenantId, congregationId, id);

    const memberships = await this.prisma.client.volunteerMinistry.findMany({
      where: { ministry_id: id },
      include: {
        volunteerProfile: {
          include: {
            person: {
              select: { id: true, full_name: true, email: true, phone: true, photo_url: true, classification: true },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const leaders = memberships.filter((m) => m.role === 'leader');
    const volunteers = memberships.filter((m) => m.role === 'volunteer');

    return { ...ministry, leaders, volunteers };
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateMinistryDto,
  ): Promise<Ministry> {
    await this.findOne(tenantId, congregationId, id);

    if (dto.parent_ministry_id !== undefined) {
      if (dto.parent_ministry_id === null) {
        await this.assertNoRootExists(tenantId, congregationId, id);
      } else {
        await this.assertValidParent(tenantId, congregationId, dto.parent_ministry_id, id);
      }
    }

    return this.prisma.client.ministry.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
        ...(dto.parent_ministry_id !== undefined && { parent_ministry_id: dto.parent_ministry_id }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Ministry> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.ministry.delete({ where: { id } });
  }
}
