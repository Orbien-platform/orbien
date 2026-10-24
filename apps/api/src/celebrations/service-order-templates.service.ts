import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResponsibleType, ServiceOrderTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceOrderTemplateDto } from './dto/create-service-order-template.dto';
import { UpdateServiceOrderTemplateDto } from './dto/update-service-order-template.dto';
import { ApplyServiceOrderTemplateDto } from './dto/apply-service-order-template.dto';

const ITEMS_INCLUDE = {
  items: {
    orderBy: [{ phase: 'asc' }, { sequence: 'asc' }],
    include: {
      person: { select: { id: true, full_name: true } },
      ministry: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ServiceOrderTemplateInclude;

/**
 * Moldes de OC: o roteiro de etapas de um culto, salvo para reaproveitar. O
 * molde copia as etapas (horário, duração, momento, tipo, responsável, notas)
 * e deixa de fora a setlist — as músicas mudam a cada culto — e a escala.
 */
@Injectable()
export class ServiceOrderTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, congregationId: string) {
    return this.prisma.client.serviceOrderTemplate.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { name: 'asc' },
      include: ITEMS_INCLUDE,
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string) {
    const template = await this.prisma.client.serviceOrderTemplate.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: ITEMS_INCLUDE,
    });
    if (!template) throw new NotFoundException('Molde de OC não encontrado');
    return template;
  }

  async createFromOrder(tenantId: string, congregationId: string, dto: CreateServiceOrderTemplateDto) {
    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id: dto.service_order_id, tenant_id: tenantId, congregation_id: congregationId },
      include: {
        items: {
          orderBy: [{ phase: 'asc' }, { sequence: 'asc' }],
          include: {
            person: { select: { full_name: true } },
            ministry: { select: { name: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');
    if (order.items.length === 0) {
      throw new BadRequestException('A ordem de culto não tem etapas para salvar como molde');
    }

    return this.prisma.client.serviceOrderTemplate.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        description: dto.description,
        items: {
          create: order.items.map((i) => ({
            tenant_id: tenantId,
            congregation_id: congregationId,
            sequence: i.sequence,
            name: i.name,
            type: i.type,
            start_offset_minutes: i.start_offset_minutes,
            duration_minutes: i.duration_minutes,
            phase: i.phase,
            entry_kind: i.entry_kind,
            responsible_type: i.responsible_type,
            person_id: i.person_id,
            ministry_id: i.ministry_id,
            // Guarda o nome de quem era o responsável: se a pessoa ou o
            // ministério sumir, a etapa aplicada ainda diz quem era.
            responsible_label: i.person?.full_name ?? i.ministry?.name ?? i.responsible_label,
            notes: i.notes,
          })),
        },
      },
      include: ITEMS_INCLUDE,
    });
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateServiceOrderTemplateDto,
  ) {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.serviceOrderTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
      include: ITEMS_INCLUDE,
    });
  }

  /** As OCs já montadas a partir do molde não mudam: aplicar copia as etapas. */
  async remove(tenantId: string, congregationId: string, id: string): Promise<ServiceOrderTemplate> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.serviceOrderTemplate.delete({ where: { id } });
  }

  async apply(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: ApplyServiceOrderTemplateDto,
  ): Promise<{ created: number; replaced: number }> {
    const template = await this.findOne(tenantId, congregationId, id);

    const order = await this.prisma.client.serviceOrder.findFirst({
      where: { id: dto.service_order_id, tenant_id: tenantId, congregation_id: congregationId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Ordem de culto não encontrada');

    return this.prisma.runInTx(async (tx) => {
      let replaced = 0;
      let sequenceBase = 0;

      if (dto.replace) {
        const removed = await tx.serviceOrderItem.deleteMany({ where: { service_order_id: order.id } });
        replaced = removed.count;
      } else {
        const last = await tx.serviceOrderItem.aggregate({
          where: { service_order_id: order.id },
          _max: { sequence: true },
        });
        sequenceBase = last._max.sequence ?? 0;
      }

      await tx.serviceOrderItem.createMany({
        data: template.items.map((i) => {
          // Pessoa ou ministério que saiu do cadastro depois de o molde ser
          // salvo (`SetNull`): a etapa continua útil como texto livre.
          const orphaned =
            (i.responsible_type === ResponsibleType.person && !i.person_id) ||
            (i.responsible_type === ResponsibleType.ministry && !i.ministry_id);
          return {
            tenant_id: tenantId,
            congregation_id: congregationId,
            service_order_id: order.id,
            sequence: sequenceBase + i.sequence,
            name: i.name,
            type: i.type,
            start_offset_minutes: i.start_offset_minutes,
            duration_minutes: i.duration_minutes,
            phase: i.phase,
            entry_kind: i.entry_kind,
            responsible_type: orphaned ? ResponsibleType.free_text : i.responsible_type,
            person_id: orphaned ? null : i.person_id,
            ministry_id: orphaned ? null : i.ministry_id,
            // O nome guardado no molde só vira rótulo quando a etapa perdeu o
            // vínculo; com pessoa/ministério vivo, a tela já mostra o cadastro.
            responsible_label: orphaned
              ? (i.responsible_label ?? 'Responsável removido')
              : i.responsible_type === ResponsibleType.free_text
                ? i.responsible_label
                : null,
            notes: i.notes,
          };
        }),
      });

      return { created: template.items.length, replaced };
    });
  }
}
