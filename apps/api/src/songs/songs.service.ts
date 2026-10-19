import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Song, SongVersion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSongDto } from './dto/create-song.dto';
import { UpdateSongDto } from './dto/update-song.dto';
import { CreateSongVersionDto } from './dto/create-song-version.dto';
import { UpdateSongVersionDto } from './dto/update-song-version.dto';

export const DEFAULT_VERSION_LABEL = 'Original';

export type SongVersionWithLastPlayedAt = SongVersion & { last_played_at: Date | null };
export type SongWithVersions = Song & { versions: SongVersion[] };
export type SongWithLastPlayedAt = Song & {
  last_played_at: Date | null;
  versions: SongVersionWithLastPlayedAt[];
};

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

  private async findVersion(
    tenantId: string,
    congregationId: string,
    songId: string,
    versionId: string,
  ): Promise<SongVersion> {
    const version = await this.prisma.client.songVersion.findFirst({
      where: {
        id: versionId,
        song_id: songId,
        tenant_id: tenantId,
        congregation_id: congregationId,
      },
    });
    if (!version) throw new NotFoundException('Versão não encontrada');
    return version;
  }

  private versionData(dto: CreateSongVersionDto) {
    return {
      label: dto.label,
      key: dto.key ?? null,
      bpm: dto.bpm ?? null,
      link: dto.link ?? null,
      youtube_link: dto.youtube_link ?? null,
      spotify_link: dto.spotify_link ?? null,
      cifra_club_link: dto.cifra_club_link ?? null,
      notes: dto.notes ?? null,
    };
  }

  async create(
    tenantId: string,
    congregationId: string,
    dto: CreateSongDto,
  ): Promise<SongWithVersions> {
    const version = dto.version ?? { label: DEFAULT_VERSION_LABEL };
    return this.prisma.client.song.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        title: dto.title,
        versions: {
          create: {
            tenant_id: tenantId,
            congregation_id: congregationId,
            ...this.versionData(version),
          },
        },
      },
      include: { versions: { orderBy: { created_at: 'asc' } } },
    });
  }

  async findAll(tenantId: string, congregationId: string): Promise<SongWithLastPlayedAt[]> {
    const songs = await this.prisma.client.song.findMany({
      where: { tenant_id: tenantId, congregation_id: congregationId },
      orderBy: { title: 'asc' },
      include: { versions: { orderBy: { created_at: 'asc' } } },
    });

    const songIds = songs.map((song) => song.id);
    const usages = await this.prisma.client.setlistSong.findMany({
      where: { tenant_id: tenantId, song_id: { in: songIds } },
      select: {
        song_id: true,
        song_version_id: true,
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

    const lastBySong = new Map<string, Date>();
    const lastByVersion = new Map<string, Date>();
    const keepLatest = (map: Map<string, Date>, id: string, date: Date) => {
      const current = map.get(id);
      if (!current || date > current) map.set(id, date);
    };
    for (const usage of usages) {
      const date = usage.setlist.serviceOrderItem.serviceOrder.celebrationInstance.scheduled_date;
      keepLatest(lastBySong, usage.song_id as string, date);
      if (usage.song_version_id) keepLatest(lastByVersion, usage.song_version_id, date);
    }

    return songs.map((song) => ({
      ...song,
      last_played_at: lastBySong.get(song.id) ?? null,
      versions: song.versions.map((v) => ({
        ...v,
        last_played_at: lastByVersion.get(v.id) ?? null,
      })),
    }));
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdateSongDto,
  ): Promise<SongWithVersions> {
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.client.song.update({
      where: { id },
      data: { ...(dto.title !== undefined && { title: dto.title }) },
      include: { versions: { orderBy: { created_at: 'asc' } } },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<Song> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.song.delete({ where: { id } });
  }

  async createVersion(
    tenantId: string,
    congregationId: string,
    songId: string,
    dto: CreateSongVersionDto,
  ): Promise<SongVersion> {
    await this.findOne(tenantId, congregationId, songId);
    return this.prisma.client.songVersion.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        song_id: songId,
        ...this.versionData(dto),
      },
    });
  }

  async updateVersion(
    tenantId: string,
    congregationId: string,
    songId: string,
    versionId: string,
    dto: UpdateSongVersionDto,
  ): Promise<SongVersion> {
    await this.findVersion(tenantId, congregationId, songId, versionId);

    return this.prisma.client.songVersion.update({
      where: { id: versionId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.key !== undefined && { key: dto.key }),
        ...(dto.bpm !== undefined && { bpm: dto.bpm }),
        ...(dto.link !== undefined && { link: dto.link }),
        ...(dto.youtube_link !== undefined && { youtube_link: dto.youtube_link }),
        ...(dto.spotify_link !== undefined && { spotify_link: dto.spotify_link }),
        ...(dto.cifra_club_link !== undefined && { cifra_club_link: dto.cifra_club_link }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async removeVersion(
    tenantId: string,
    congregationId: string,
    songId: string,
    versionId: string,
  ): Promise<SongVersion> {
    await this.findVersion(tenantId, congregationId, songId, versionId);

    const total = await this.prisma.client.songVersion.count({ where: { song_id: songId } });
    if (total <= 1) {
      throw new BadRequestException(
        'A música precisa ter ao menos uma versão. Exclua a música para removê-la.',
      );
    }
    return this.prisma.client.songVersion.delete({ where: { id: versionId } });
  }
}
