import { Injectable, NotFoundException } from '@nestjs/common';
import { CelebrationInstance, CelebrationInstanceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCelebrationInstanceDto } from './dto/create-celebration-instance.dto';
import { UpdateCelebrationInstanceDto } from './dto/update-celebration-instance.dto';
import { ListCelebrationInstancesQueryDto } from './dto/list-celebration-instances-query.dto';

@Injectable()
export class CelebrationInstancesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateCelebrationInstanceDto,
  ): Promise<CelebrationInstance> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id: dto.celebration_id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');

    return this.prisma.client.celebrationInstance.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_id: dto.celebration_id,
        scheduled_date: new Date(dto.scheduled_date),
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
    query: ListCelebrationInstancesQueryDto,
  ): Promise<CelebrationInstance[]> {
    return this.prisma.client.celebrationInstance.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(query.celebration_id && { celebration_id: query.celebration_id }),
        ...(query.status && { status: query.status as CelebrationInstanceStatus }),
        ...(query.date_from || query.date_to
          ? {
              scheduled_date: {
                ...(query.date_from && { gte: new Date(query.date_from) }),
                ...(query.date_to && { lte: new Date(query.date_to) }),
              },
            }
          : {}),
      },
      orderBy: { scheduled_date: 'asc' },
      include: {
        celebration: { select: { id: true, name: true, type: true } },
      },
    });
  }

  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<CelebrationInstance> {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        celebration: { select: { id: true, name: true, type: true } },
      },
    });
    if (!instance) throw new NotFoundException('Instância não encontrada');
    return instance;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateCelebrationInstanceDto,
  ): Promise<CelebrationInstance> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.celebrationInstance.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async remove(
    tenantId: string,
    congregationId: string,
    id: string,
  ): Promise<CelebrationInstance> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.celebrationInstance.delete({ where: { id } });
  }
}
