import { Injectable, NotFoundException } from '@nestjs/common';
import { SetlistSong } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSetlistSongDto } from './dto/create-setlist-song.dto';
import { UpdateSetlistSongDto } from './dto/update-setlist-song.dto';
import { ReorderSongsDto } from './dto/reorder-songs.dto';

// Campos da referência do catálogo devolvidos junto da SetlistSong (SETREP-04 AC1).
// Constante compartilhada com o ServiceOrdersService para os dois não divergirem.
export const SONG_REFERENCE_SELECT = {
  id: true,
  title: true,
} as const;

// A versão carrega o que varia entre versões: rótulo, tom e referências.
export const SONG_VERSION_REFERENCE_SELECT = {
  id: true,
  label: true,
  key: true,
  bpm: true,
  youtube_link: true,
  spotify_link: true,
  cifra_club_link: true,
} as const;

const SETLIST_SONG_INCLUDE = {
  song: { select: SONG_REFERENCE_SELECT },
  songVersion: { select: SONG_VERSION_REFERENCE_SELECT },
} as const;

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

  private async resolveCatalogSong(tenantId: string, congregationId: string, songId: string) {
    const song = await this.prisma.client.song.findFirst({
      where: { id: songId, tenant_id: tenantId, congregation_id: congregationId },
    });
    if (!song) throw new NotFoundException('Música não encontrada');
    return song;
  }

  /** A versão tem que existir na congregação e, se a música foi dada, ser dela. */
  private async resolveCatalogVersion(
    tenantId: string,
    congregationId: string,
    versionId: string,
    songId?: string | null,
  ) {
    const version = await this.prisma.client.songVersion.findFirst({
      where: {
        id: versionId,
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(songId && { song_id: songId }),
      },
    });
    if (!version) throw new NotFoundException('Versão não encontrada');
    return version;
  }

  async create(tenantId: string, congregationId: string, dto: CreateSetlistSongDto): Promise<SetlistSong> {
    await this.resolveSetlist(tenantId, congregationId, dto.setlist_id);

    if (dto.song_id) await this.resolveCatalogSong(tenantId, congregationId, dto.song_id);

    const version = dto.song_version_id
      ? await this.resolveCatalogVersion(tenantId, congregationId, dto.song_version_id, dto.song_id)
      : null;

    return this.prisma.client.setlistSong.create({
      data: {
        tenant_id: tenantId,
        congregation_id: congregationId,
        setlist_id: dto.setlist_id,
        song_id: dto.song_id ?? version?.song_id ?? null,
        song_version_id: version?.id ?? null,
        version_label: version?.label ?? null,
        sequence: dto.sequence,
        title: dto.title,
        key: dto.key ?? version?.key ?? null,
        bpm: dto.bpm ?? version?.bpm ?? null,
        link: dto.link ?? version?.link ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async findAll(tenantId: string, congregationId: string, setlistId: string): Promise<SetlistSong[]> {
    await this.resolveSetlist(tenantId, congregationId, setlistId);
    return this.prisma.client.setlistSong.findMany({
      where: { setlist_id: setlistId, tenant_id: tenantId },
      orderBy: { sequence: 'asc' },
      include: SETLIST_SONG_INCLUDE,
    });
  }

  async findOne(tenantId: string, congregationId: string, id: string): Promise<SetlistSong> {
    const song = await this.prisma.client.setlistSong.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
      include: SETLIST_SONG_INCLUDE,
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

    // song_id ausente não entra no data; null desvincula sem consultar o catálogo.
    const songId = dto.song_id as string | null | undefined;
    if (songId) await this.resolveCatalogSong(tenantId, congregationId, songId);

    // A versão acompanha a música: desvincular leva a versão junto, e trocar de
    // música sem dizer a versão a limpa — nunca fica versão de outra música.
    // Sem mexer em `song_id`, a versão só muda se vier no corpo.
    const versionId = (
      songId === undefined ? dto.song_version_id : songId === null ? null : (dto.song_version_id ?? null)
    ) as string | null | undefined;
    const version = versionId
      ? await this.resolveCatalogVersion(tenantId, congregationId, versionId, songId)
      : null;

    return this.prisma.client.setlistSong.update({
      where: { id },
      data: {
        ...(songId !== undefined && { song_id: songId }),
        ...(versionId !== undefined && {
          song_version_id: version?.id ?? null,
          version_label: version?.label ?? null,
        }),
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
