import { Injectable, NotFoundException } from '@nestjs/common';
import { Celebration, CelebrationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCelebrationDto } from './dto/create-celebration.dto';
import { UpdateCelebrationDto } from './dto/update-celebration.dto';
import { ListCelebrationsQueryDto } from './dto/list-celebrations-query.dto';

@Injectable()
export class CelebrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateCelebrationDto,
  ): Promise<Celebration> {
    return this.prisma.client.celebration.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        type: dto.type,
        day_of_week: dto.day_of_week ?? null,
        start_time: dto.start_time,
        recurrence: dto.recurrence,
      },
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
    query: ListCelebrationsQueryDto,
  ): Promise<Celebration[]> {
    return this.prisma.client.celebration.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(query.type !== undefined && { type: query.type as CelebrationType }),
        is_active: query.is_active ?? true,
      },
      orderBy: [{ day_of_week: 'asc' }, { start_time: 'asc' }],
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<Celebration> {
    const celebration = await this.prisma.client.celebration.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!celebration) throw new NotFoundException('Celebração não encontrada');
    return celebration;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateCelebrationDto,
  ): Promise<Celebration> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.celebration.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.day_of_week !== undefined && { day_of_week: dto.day_of_week }),
        ...(dto.start_time !== undefined && { start_time: dto.start_time }),
        ...(dto.recurrence !== undefined && { recurrence: dto.recurrence }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Celebration> {
    await this.findOne(tenantId, congregationId, id);
    // Soft delete: mark inactive rather than hard delete to preserve instance history
    return this.prisma.client.celebration.update({
      where: { id },
      data: { is_active: false },
    });
  }
}
