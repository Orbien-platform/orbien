import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGroupTypeDto } from './dto/create-group-type.dto';
import { UpdateGroupTypeDto } from './dto/update-group-type.dto';

@Injectable()
export class GroupTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    congregationId: string,
    includeInactive = false,
  ): Promise<GroupType[]> {
    return this.prisma.client.groupType.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<GroupType> {
    const groupType = await this.prisma.client.groupType.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!groupType) throw new NotFoundException('Tipo de grupo não encontrado');
    return groupType;
  }

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateGroupTypeDto,
  ): Promise<GroupType> {
    return this.prisma.client.groupType.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        color: dto.color ?? null,
      },
    });
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateGroupTypeDto,
  ): Promise<GroupType> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.groupType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async deactivate(tenantId: string, congregationId: string, id: string): Promise<GroupType> {
    await this.findOne(tenantId, congregationId, id);

    const linkedGroups = await this.prisma.client.smallGroup.count({
      where: { group_type_id: id },
    });
    if (linkedGroups > 0) {
      throw new ConflictException(
        `Não é possível desativar: ${linkedGroups} grupo(s) ainda vinculado(s) a este tipo.`,
      );
    }

    return this.prisma.client.groupType.update({
      where: { id },
      data: { is_active: false },
    });
  }
}
