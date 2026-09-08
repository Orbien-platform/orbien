import { Injectable, NotFoundException } from '@nestjs/common';
import { Song } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';

export type SongWithLastPlayedAt = Song & { last_played_at: Date | null };

@Injectable()
export class SongsService {
  constructor(private readonly prisma: PrismaService) {}

  private async findOne(tenantId: string, congregationId: string, id: string): Promise<Song> {
    const song = await this.prisma.client.song.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!song) throw new NotFoundException('Música não encontrada');
    return song;
  }

  async create(tenantId: string, congregationId: string, dto: CreateSongDto): Promise<Song> {
    return this.prisma.client.song.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        title: dto.title,
        key: dto.key ?? null,
        key_alt: dto.key_alt ?? null,
        bpm: dto.bpm ?? null,
        link: dto.link ?? null,
        youtube_link: dto.youtube_link ?? null,
        spotify_link: dto.spotify_link ?? null,
        cifra_club_link: dto.cifra_club_link ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string): Promise<SongWithLastPlayedAt[]> {
    const songs = await this.prisma.client.song.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { title: 'asc' },
    });

    const songIds = songs.map((song) => song.id);
    const usages = await this.prisma.client.setlistSong.findMany({
      where: { tenant_id: tenantId, song_id: { in: songIds } },
      select: {
        song_id: true,
        setlist: {
          select: {
            serviceOrderItem: {
              select: {
                serviceOrder: {
                  select: { celebrationInstance: { select: { scheduled_date: true } } },
                },
              },
            },
          },
        },
      },
    });

    const lastPlayedBySong = new Map<string, Date>();
    for (const usage of usages) {
      const songId = usage.song_id as string;
      const date = usage.setlist.serviceOrderItem.serviceOrder.celebrationInstance.scheduled_date;
      const current = lastPlayedBySong.get(songId);
      if (!current || date > current) {
        lastPlayedBySong.set(songId, date);
      }
    }

    return songs.map((song) => ({
      ...song,
      last_played_at: lastPlayedBySong.get(song.id) ?? null,
    }));
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateSongDto,
  ): Promise<Song> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.song.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.key_alt !== undefined && { key_alt: dto.key_alt }),
        ...(dto.bpm !== undefined && { bpm: dto.bpm }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.youtube_link !== undefined && { youtube_link: dto.youtube_link }),
        ...(dto.spotify_link !== undefined && { spotify_link: dto.spotify_link }),
        ...(dto.cifra_club_link !== undefined && { cifra_club_link: dto.cifra_club_link }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Song> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.song.delete({ where: { id } });
  }
}
