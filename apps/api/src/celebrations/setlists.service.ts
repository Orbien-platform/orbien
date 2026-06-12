import { Injectable, NotFoundException } from '@nestjs/common';
import { Setlist } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSetlistDto } from './dto/create-setlist.dto';

@Injectable()
export class SetlistsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, congregationId: string, dto: CreateSetlistDto): Promise<Setlist> {
    const item = await this.prisma.client.serviceOrderItem.findFirst({
      where: { id: dto.service_order_item_id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!item) throw new NotFoundException('Item de ordem de culto não encontrado');

    // Idempotent: se já existe, retorna a setlist existente
    const existing = await this.prisma.client.setlist.findUnique({
      where: { service_order_item_id: dto.service_order_item_id },
      include: { songs: { orderBy: { sequence: 'asc' } } },
    });
    if (existing) return existing;

    return this.prisma.client.setlist.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_item_id: dto.service_order_item_id,
      },
      include: { songs: { orderBy: { sequence: 'asc' } } },
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<Setlist> {
    const setlist = await this.prisma.client.setlist.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: { songs: { orderBy: { sequence: 'asc' } } },
    });
    if (!setlist) throw new NotFoundException('Setlist não encontrada');
    return setlist;
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Setlist> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.setlist.delete({ where: { id } });
  }
}
