import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { UpdateWaitlistDto } from './dto/update-waitlist.dto';
import { ListWaitlistQueryDto } from './dto/list-waitlist-query.dto';
import { Prisma, WaitlistStatus } from '@prisma/client';

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(dto: CreateWaitlistDto, ip: string, userAgent: string) {
    try {
      await this.prisma.waitlistSubscriber.create({
        data: {
          email: dto.email,
          pastor_name: dto.pastor_name,
          church_name: dto.church_name,
          city: dto.city,
          state: dto.state,
          size_range: dto.size_range,
          lgpd_consent: dto.lgpd_consent,
          source: dto.source,
          utm_source: dto.utm_source,
          utm_medium: dto.utm_medium,
          utm_campaign: dto.utm_campaign,
          ip,
          user_agent: userAgent,
        },
      });
    } catch (err) {
      // P2002 = unique constraint — email já cadastrado; retorna success sem vazar informação
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { success: true };
      }
      throw err;
    }
    return { success: true };
  }

  async findAll(query: ListWaitlistQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WaitlistSubscriberWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.size_range ? { size_range: query.size_range } : {}),
      ...(query.source ? { source: query.source } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.waitlistSubscriber.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.waitlistSubscriber.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const subscriber = await this.prisma.waitlistSubscriber.findUnique({ where: { id } });
    if (!subscriber) throw new NotFoundException('Waitlist subscriber not found');
    return subscriber;
  }

  async update(id: string, dto: UpdateWaitlistDto) {
    await this.findOne(id);

    const now = new Date();
    const data: Prisma.WaitlistSubscriberUpdateInput = { ...dto };

    if (dto.status === WaitlistStatus.contacted && !dto.contacted_at) {
      const current = await this.prisma.waitlistSubscriber.findUnique({
        where: { id },
        select: { contacted_at: true },
      });
      if (!current?.contacted_at) data.contacted_at = now;
    }

    if (dto.status === WaitlistStatus.activated && !dto.activated_at) {
      const current = await this.prisma.waitlistSubscriber.findUnique({
        where: { id },
        select: { activated_at: true },
      });
      if (!current?.activated_at) data.activated_at = now;
    }

    return this.prisma.waitlistSubscriber.update({ where: { id }, data });
  }
}
