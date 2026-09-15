import { Injectable, NotFoundException } from '@nestjs/common';
import { Network } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateNetworkDto } from './dto/create-network.dto';
import { UpdateNetworkDto } from './dto/update-network.dto';

// CRUD de Network (PROD-20, CEL20-07) — mesmo padrão de SmallGroupsService:
// tenant/congregação vêm do JwtPayload, NotFoundException em
// findOne/update/remove quando o id não existe.
@Injectable()
export class NetworksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNetworkDto, user: JwtPayload): Promise<Network> {
    return this.prisma.client.network.create({
      data: {
        ...dto,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  async findAll(): Promise<Network[]> {
    return this.prisma.client.network.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Network> {
    const network = await this.prisma.client.network.findUnique({ where: { id } });
    if (!network) throw new NotFoundException('Rede não encontrada');
    return network;
  }

  async update(id: string, dto: UpdateNetworkDto): Promise<Network> {
    const existing = await this.prisma.client.network.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Rede não encontrada');

    return this.prisma.client.network.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<Network> {
    const existing = await this.prisma.client.network.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Rede não encontrada');
    return this.prisma.client.network.delete({ where: { id } });
  }
}
