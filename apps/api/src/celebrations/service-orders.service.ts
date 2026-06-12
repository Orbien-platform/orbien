import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ServiceOrder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

@Injectable()
export class ServiceOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateServiceOrderDto,
  ): Promise<ServiceOrder> {
    const instance = await this.prisma.client.celebrationInstance.findFirst({
      where: {
        id: dto.celebration_instance_id,
        tenant_id: tenantId,
        congregation_id: congregationId,
      },
    });
    if (!instance) throw new NotFoundException('Instância de celebração não encontrada');

    const existing = await this.prisma.client.serviceOrder.findUnique({
      where: { celebration_instance_id: dto.celebration_instance_id },
    });
    if (existing) throw new ConflictException('Já existe uma ordem de culto para esta instância');

    return this.prisma.client.serviceOrder.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        celebration_instance_id: dto.celebration_instance_id,
        title: dto.title,
      },
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<ServiceOrder> {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        celebrationInstance: {
          select: {
            id: true,
            scheduled_date: true,
            status: true,
            celebration: { select: { id: true, name: true, type: true } },
          },
        },
        items: {
          orderBy: { sequence: 'asc' },
          include: {
            person: { select: { id: true, full_name: true } },
            ministry: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');
    return order;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateServiceOrderDto,
  ): Promise<ServiceOrder> {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');

    return this.prisma.client.serviceOrder.update({
      where: { id },
      data: { ...(dto.title !== undefined && { title: dto.title }) },
    });
  }

  async publish(tenantId: string, congregationId: string, id: string): Promise<ServiceOrder> {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');
    if (order.published_at) throw new BadRequestException('Ordem de culto já publicada');

    return this.prisma.runInTx(async (tx) => {
      await tx.celebrationInstance.update({
        where: { id: order.celebration_instance_id },
        data: { status: 'published' },
      });
      return tx.serviceOrder.update({
        where: { id },
        data: { published_at: new Date() },
      });
    });
  }

  async finalize(tenantId: string, congregationId: string, id: string): Promise<ServiceOrder> {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');
    if (!order.published_at) throw new BadRequestException('Só é possível finalizar após publicar');

    await this.prisma.client.celebrationInstance.update({
      where: { id: order.celebration_instance_id },
      data: { status: 'finalized' },
    });
    return order;
  }
}
