import { Injectable, NotFoundException } from '@nestjs/common';
import { Ministry } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMinistryDto } from './dto/create-ministry.dto';
import { UpdateMinistryDto } from './dto/update-ministry.dto';

@Injectable()
export class MinistriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, congregationId: string, dto: CreateMinistryDto): Promise<Ministry> {
    return this.prisma.client.ministry.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        description: dto.description ?? null,
        color: dto.color ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string): Promise<Ministry[]> {
    return this.prisma.client.ministry.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<Ministry> {
    const ministry = await this.prisma.client.ministry.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!ministry) throw new NotFoundException('Ministério não encontrado');
    return ministry;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateMinistryDto,
  ): Promise<Ministry> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.ministry.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.color !== undefined && { color: dto.color }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Ministry> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.ministry.delete({ where: { id } });
  }
}
