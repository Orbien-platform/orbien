import { Injectable, NotFoundException } from '@nestjs/common';
import { AudienceSegment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSegmentDto, user: JwtPayload): Promise<AudienceSegment> {
    return this.prisma.client.audienceSegment.create({
      data: {
        name: dto.name,
        criteria: dto.criteria as object,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  async findAll(user: JwtPayload): Promise<AudienceSegment[]> {
    return this.prisma.client.audienceSegment.findMany({
      where: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        content_post_id: { equals: null }, // standalone segments only
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async findOne(id: string, user: JwtPayload): Promise<AudienceSegment> {
    const segment = await this.prisma.client.audienceSegment.findFirst({
      where: { id, tenant_id: user.tenant_id, congregation_id: user.congregation_id },
    });
    if (!segment) throw new NotFoundException('Segmento não encontrado');
    return segment;
  }

  async update(id: string, dto: UpdateSegmentDto, user: JwtPayload): Promise<AudienceSegment> {
    await this.findOne(id, user);
    const data: { name?: string; criteria?: object } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.criteria !== undefined) data.criteria = dto.criteria as object;
    return this.prisma.client.audienceSegment.update({ where: { id }, data });
  }

  async remove(id: string, user: JwtPayload): Promise<AudienceSegment> {
    await this.findOne(id, user);
    return this.prisma.client.audienceSegment.delete({ where: { id } });
  }
}
