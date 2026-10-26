import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KidsRoom } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKidsRoomDto } from './dto/create-kids-room.dto';
import { UpdateKidsRoomDto } from './dto/update-kids-room.dto';
import { ListKidsRoomsQueryDto } from './dto/list-kids-rooms-query.dto';

function assertAgeRange(min: number, max: number): void {
  if (min > max) {
    throw new BadRequestException('A idade mínima não pode ser maior que a máxima');
  }
}

@Injectable()
export class KidsRoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, congregationId: string, dto: CreateKidsRoomDto): Promise<KidsRoom> {
    assertAgeRange(dto.min_age_months, dto.max_age_months);

    // A congregação vem sempre do contexto do usuário, nunca do corpo.
    return this.prisma.client.kidsRoom.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        name: dto.name,
        min_age_months: dto.min_age_months,
        max_age_months: dto.max_age_months,
        allows_out_of_range: dto.allows_out_of_range ?? false,
        capacity: dto.capacity ?? null,
        min_volunteers: dto.min_volunteers ?? 0,
      },
    });
  }

  findAll(tenantId: string, congregationId: string, query: ListKidsRoomsQueryDto): Promise<KidsRoom[]> {
    return this.prisma.client.kidsRoom.findMany({
      where: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(!query.include_inactive && { is_active: true }),
      },
      orderBy: [{ min_age_months: 'asc' }, { max_age_months: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<KidsRoom> {
    const room = await this.prisma.client.kidsRoom.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!room) throw new NotFoundException('Turma não encontrada');
    return room;
  }

  async update(tenantId: string, congregationId: string, id: string, dto: UpdateKidsRoomDto): Promise<KidsRoom> {
    const room = await this.findOne(tenantId, congregationId, id);
    // O par é validado contra o que está gravado: mexer só no min não pode
    // furar o max.
    assertAgeRange(dto.min_age_months ?? room.min_age_months, dto.max_age_months ?? room.max_age_months);

    return this.prisma.client.kidsRoom.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.min_age_months !== undefined && { min_age_months: dto.min_age_months }),
        ...(dto.max_age_months !== undefined && { max_age_months: dto.max_age_months }),
        ...(dto.allows_out_of_range !== undefined && { allows_out_of_range: dto.allows_out_of_range }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...(dto.min_volunteers !== undefined && { min_volunteers: dto.min_volunteers }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });
  }

  // Desativa em vez de apagar: sessões e check-ins passados apontam para a turma.
  async deactivate(tenantId: string, congregationId: string, id: string): Promise<KidsRoom> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.kidsRoom.update({ where: { id }, data: { is_active: false } });
  }
}
