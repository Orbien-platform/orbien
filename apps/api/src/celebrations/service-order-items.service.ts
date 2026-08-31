import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ResponsibleType, ServiceOrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceOrderItemDto } from './dto/create-service-order-item.dto';
import { UpdateServiceOrderItemDto } from './dto/update-service-order-item.dto';
import { ReorderItemsDto } from './dto/reorder-items.dto';

@Injectable()
export class ServiceOrderItemsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOrder(tenantId: string, congregationId: string, serviceOrderId: string) {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id: serviceOrderId, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        celebrationInstance: { select: { scheduled_date: true } },
      },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');
    return order;
  }

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateServiceOrderItemDto,
  ): Promise<ServiceOrderItem> {
    await this.resolveOrder(tenantId, congregationId, dto.service_order_id);

    if (dto.responsible_type === ResponsibleType.person && !dto.person_id) {
      throw new BadRequestException('person_id é obrigatório quando responsible_type = person');
    }
    if (dto.responsible_type === ResponsibleType.ministry && !dto.ministry_id) {
      throw new BadRequestException('ministry_id é obrigatório quando responsible_type = ministry');
    }
    if (dto.responsible_type === ResponsibleType.free_text && !dto.responsible_label) {
      throw new BadRequestException('responsible_label é obrigatório quando responsible_type = free_text');
    }

    if (dto.person_id) {
      const person = await this.prisma.client.person.findFirst({
        where: { id: dto.person_id, tenant_id: tenantId },
      });
      if (!person) throw new NotFoundException('Pessoa não encontrada');
    }

    if (dto.ministry_id) {
      const ministry = await this.prisma.client.ministry.findFirst({
        where: { id: dto.ministry_id, tenant_id: tenantId },
      });
      if (!ministry) throw new NotFoundException('Ministério não encontrado');
    }

    return this.prisma.client.serviceOrderItem.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        service_order_id: dto.service_order_id,
        sequence: dto.sequence,
        name: dto.name,
        start_offset_minutes: dto.start_offset_minutes,
        duration_minutes: dto.duration_minutes,
        responsible_type: dto.responsible_type,
        person_id: dto.person_id ?? null,
        ministry_id: dto.ministry_id ?? null,
        responsible_label: dto.responsible_label ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string, serviceOrderId: string) {
    const order = await this.resolveOrder(tenantId, congregationId, serviceOrderId);
    const scheduleDate = order.celebrationInstance.scheduled_date;

    const dayStart = new Date(scheduleDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduleDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const items = await this.prisma.client.serviceOrderItem.findMany({
      where: { service_order_id: serviceOrderId, tenant_id: tenantId },
      orderBy: { sequence: 'asc' },
      include: {
        person: { select: { id: true, full_name: true } },
        ministry: { select: { id: true, name: true } },
      },
    });

    // For ministry items: attach scheduled volunteers (LEFT JOIN — don't fail if no schedule)
    const ministryIds = [
      ...new Set(
        items
          .filter((i) => i.responsible_type === ResponsibleType.ministry && i.ministry_id)
          .map((i) => i.ministry_id!),
      ),
    ];

    let volunteersByMinistry: Record<string, { id: string; full_name: string }[]> = {};

    if (ministryIds.length > 0) {
      const scheduleAssignments = await this.prisma.client.scheduleAssignment.findMany({
        where: {
          tenant_id: tenantId,
          status: 'confirmed',
          slot: {
            schedule: {
              ministry_id: { in: ministryIds },
              scheduled_date: { gte: dayStart, lte: dayEnd },
            },
          },
        },
        include: {
          volunteerProfile: {
            include: { person: { select: { id: true, full_name: true } } },
          },
          slot: {
            include: {
              schedule: { select: { ministry_id: true } },
            },
          },
        },
      });

      for (const a of scheduleAssignments) {
        const minId = a.slot.schedule.ministry_id;
        if (!volunteersByMinistry[minId]) volunteersByMinistry[minId] = [];
        volunteersByMinistry[minId].push(a.volunteerProfile.person);
      }
    }

    return items.map((item) => ({
      ...item,
      scheduled_volunteers:
        item.responsible_type === ResponsibleType.ministry && item.ministry_id
          ? (volunteersByMinistry[item.ministry_id] ?? [])
          : undefined,
    }));
  }

  async findOne(tenantId: string, congregationId: string, id: string) {
    const item = await this.prisma.client.serviceOrderItem.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        person: { select: { id: true, full_name: true } },
        ministry: { select: { id: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('Item não encontrado');
    return item;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateServiceOrderItemDto,
  ): Promise<ServiceOrderItem> {
    const item = await this.findOne(tenantId, congregationId, id);

    if (dto.person_id && dto.person_id !== item.person_id) {
      const person = await this.prisma.client.person.findFirst({
        where: { id: dto.person_id, tenant_id: tenantId },
      });
      if (!person) throw new NotFoundException('Pessoa não encontrada');
    }

    if (dto.ministry_id && dto.ministry_id !== item.ministry_id) {
      const ministry = await this.prisma.client.ministry.findFirst({
        where: { id: dto.ministry_id, tenant_id: tenantId },
      });
      if (!ministry) throw new NotFoundException('Ministério não encontrado');
    }

    return this.prisma.client.serviceOrderItem.update({
      where: { id },
      data: {
        ...(dto.sequence !== undefined && { sequence: dto.sequence }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.start_offset_minutes !== undefined && { start_offset_minutes: dto.start_offset_minutes }),
        ...(dto.duration_minutes !== undefined && { duration_minutes: dto.duration_minutes }),
        ...(dto.responsible_type !== undefined && { responsible_type: dto.responsible_type }),
        ...(dto.person_id !== undefined && { person_id: dto.person_id }),
        ...(dto.ministry_id !== undefined && { ministry_id: dto.ministry_id }),
        ...(dto.responsible_label !== undefined && { responsible_label: dto.responsible_label }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<ServiceOrderItem> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.serviceOrderItem.delete({ where: { id } });
  }

  async reorder(tenantId: string, congregationId: string, dto: ReorderItemsDto): Promise<void> {
    await this.prisma.runInTx(async (tx) => {
      for (const { id, sequence } of dto.items) {
        const item = await tx.serviceOrderItem.findFirst({
          where: { id, tenant_id: tenantId, congregation_id: congregationId },
        });
        if (!item) throw new NotFoundException(`Item ${id} não encontrado`);
        await tx.serviceOrderItem.update({ where: { id }, data: { sequence } });
      }
    });
  }
}
