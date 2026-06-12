import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ServiceOrder } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService, OneSignalFilter } from '../content/notifications.service';
import { CreateServiceOrderDto } from './dto/create-service-order.dto';
import { UpdateServiceOrderDto } from './dto/update-service-order.dto';

@Injectable()
export class ServiceOrdersService {
  private readonly logger = new Logger(ServiceOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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
            setlist: {
              include: { songs: { orderBy: { sequence: 'asc' } } },
            },
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

    const published = await this.prisma.runInTx(async (tx) => {
      await tx.celebrationInstance.update({
        where: { id: order.celebration_instance_id },
        data: { status: 'published' },
      });
      return tx.serviceOrder.update({
        where: { id },
        data: { published_at: new Date() },
      });
    });

    // Fire-and-forget: notification failure must not roll back the publish
    this.notifyOrderPublished(tenantId, congregationId, order.celebration_instance_id, id).catch(
      (err: unknown) => this.logger.error(`Notificação de publicação falhou (order=${id}): ${String(err)}`),
    );

    return published;
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

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async notifyOrderPublished(
    tenantId: string,
    congregationId: string,
    instanceId: string,
    serviceOrderId: string,
  ): Promise<void> {
    const instance = await this.prisma.client.celebrationInstance.findUnique({
      where: { id: instanceId },
      include: { celebration: { select: { name: true } } },
    });
    if (!instance) return;

    // Find ministry-type items for this order
    const ministryItems = await this.prisma.client.serviceOrderItem.findMany({
      where: { service_order_id: serviceOrderId, ministry_id: { not: null } },
      select: { ministry_id: true },
    });
    if (!ministryItems.length) return;

    const ministryIds = [...new Set(ministryItems.map((i) => i.ministry_id!))];
    const dayStart = new Date(instance.scheduled_date);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(instance.scheduled_date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Find confirmed assignments for those ministries on the celebration date
    const assignments = await this.prisma.client.scheduleAssignment.findMany({
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
      include: { volunteerProfile: { select: { person_id: true } } },
    });
    if (!assignments.length) return;

    const personIds = [...new Set(assignments.map((a) => a.volunteerProfile.person_id))];

    // Build OR filter: one tag per person_id
    const filters: OneSignalFilter[] = personIds.flatMap((pid, i) => {
      const f: OneSignalFilter = { field: 'tag', key: 'person_id', relation: '=', value: pid };
      return i === 0 ? [f] : [{ operator: 'OR' }, f];
    });

    const dateLabel = instance.scheduled_date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });

    await this.notifications.sendPush({
      tenantId,
      congregationId,
      contentPostId: null,
      title: 'Ordem de Culto publicada',
      body: `A Ordem de Celebração de ${instance.celebration.name} do dia ${dateLabel} foi publicada.`,
      filters,
      data: { type: 'service_order_published', service_order_id: serviceOrderId },
    });
  }
}
