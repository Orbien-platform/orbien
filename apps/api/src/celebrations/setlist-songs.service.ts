import { Injectable, NotFoundException } from '@nestjs/common';
import { SetlistSong } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSetlistSongDto } from './dto/create-setlist-song.dto';
import { UpdateSetlistSongDto } from './dto/update-setlist-song.dto';
import { ReorderSongsDto } from './dto/reorder-songs.dto';

@Injectable()
export class SetlistSongsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveSetlist(tenantId: string, congregationId: string, setlistId: string) {
    const setlist = await this.prisma.client.setlist.findFirst({
      where: { id: setlistId, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!setlist) throw new NotFoundException('Setlist não encontrada');
    return setlist;
  }

  async create(tenantId: string, congregationId: string, dto: CreateSetlistSongDto): Promise<SetlistSong> {
    await this.resolveSetlist(tenantId, congregationId, dto.setlist_id);

    return this.prisma.client.setlistSong.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        setlist_id: dto.setlist_id,
        sequence: dto.sequence,
        title: dto.title,
        key: dto.key ?? null,
        bpm: dto.bpm ?? null,
        link: dto.link ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string, setlistId: string): Promise<SetlistSong[]> {
    await this.resolveSetlist(tenantId, congregationId, setlistId);
    return this.prisma.client.setlistSong.findMany({
      where: { setlist_id: setlistId, tenant_id: tenantId },
      orderBy: { sequence: 'asc' },
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<SetlistSong> {
    const song = await this.prisma.client.setlistSong.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!song) throw new NotFoundException('Música não encontrada');
    return song;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateSetlistSongDto,
  ): Promise<SetlistSong> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.setlistSong.update({
      where: { id },
      data: {
        ...(dto.sequence !== undefined && { sequence: dto.sequence }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.bpm !== undefined && { bpm: dto.bpm }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<SetlistSong> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.setlistSong.delete({ where: { id } });
  }

  async reorder(tenantId: string, congregationId: string, dto: ReorderSongsDto): Promise<void> {
    await this.prisma.runInTx(async (tx) => {
      for (const { id, sequence } of dto.songs) {
        const song = await tx.setlistSong.findFirst({
          where: { id, tenant_id: tenantId, congregation_id: congregationId },
        });
        if (!song) throw new NotFoundException(`Música ${id} não encontrada`);
        await tx.setlistSong.update({ where: { id }, data: { sequence } });
      }
    });
  }
}
