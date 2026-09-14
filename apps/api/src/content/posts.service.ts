import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentPost, ContentPostType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from './notifications.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

const ALLOWED_MEDIA_MIME_TYPES = [
  'application/pdf',
  'audio/mpeg',
  'video/mp4',
  'image/jpeg',
  'image/png',
  'image/webp',
];

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    tenantId: string,
    congregationId: string,
    userId: string,
    dto: CreatePostDto,
  ): Promise<ContentPost> {
    const isDraft = dto.is_draft !== false;
    const publishedAt = !isDraft && !dto.publish_at ? new Date() : undefined;

    assertEventFields(dto.type, dto);

    return this.prisma.runInTx(async (tx) => {
      const post = await tx.contentPost.create({
        data: {
          tenant_id: tenantId,
          congregation_id: congregationId,
          created_by_user_id: userId,
          type: dto.type,
          title: dto.title,
          body: dto.body,
          media_url: dto.media_url,
          is_draft: isDraft,
          publish_at: dto.publish_at ?? null,
          published_at: publishedAt ?? null,
          event_starts_at: dto.event_starts_at ?? null,
          event_ends_at: dto.event_ends_at ?? null,
          event_location: dto.event_location ?? null,
          registration_enabled: dto.registration_enabled ?? false,
          registration_limit: dto.registration_limit ?? null,
          registration_deadline: dto.registration_deadline ?? null,
        },
      });

      if (dto.segment_ids?.length) {
        await tx.postSegment.createMany({
          data: dto.segment_ids.map((segId) => ({
            post_id: post.id,
            segment_id: segId,
          })),
          skipDuplicates: true,
        });
      }

      return post;
    });
  }

  async findAll(
    tenantId: string,
    congregationId: string,
    roles: string[],
    query: ListPostsQueryDto,
  ): Promise<{ data: ContentPost[]; total: number }> {
    const isMember = roles.length === 1 && roles[0] === 'member';
    const skip = (query.page - 1) * query.limit;

    const where: Prisma.ContentPostWhereInput = {
      tenant_id: tenantId,
      congregation_id: congregationId,
      ...(isMember ? { published_at: { not: null } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.is_draft !== undefined && !isMember ? { is_draft: query.is_draft } : {}),
      ...(query.since
        ? { published_at: { not: null, gte: new Date(query.since) } }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.contentPost.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: query.limit,
        include: { postSegments: { select: { segment_id: true } } },
      }),
      this.prisma.client.contentPost.count({ where }),
    ]);

    return { data, total };
  }

  // `roles` opcional: chamadas internas (update/remove, sempre WRITE_ROLES)
  // não passam — mantêm acesso total, mesmo comportamento de antes. A rota
  // pública GET /content/posts/:id passa `user.roles` para replicar aqui o
  // mesmo filtro que findAll já aplica a member puro (published_at IS NOT
  // NULL) — sem isso, um rascunho despublicado continuava visível pelo id
  // direto mesmo depois de sumir da listagem (MOB-07, Edge Case da spec:
  // post despublicado entre o disparo da push e o toque do usuário deve
  // parecer "não encontrado", não vazar o rascunho).
  async findOne(
    tenantId: string,
    congregationId: string,
    id: string,
    roles?: string[],
  ): Promise<ContentPost> {
    const isMember = roles !== undefined && roles.length === 1 && roles[0] === 'member';
    const post = await this.prisma.client.contentPost.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        congregation_id: congregationId,
        ...(isMember ? { published_at: { not: null } } : {}),
      },
      include: {
        postSegments: {
          include: { segment: true },
        },
      },
    });
    if (!post) throw new NotFoundException('Post não encontrado');
    return post;
  }

  async update(
    tenantId: string,
    congregationId: string,
    id: string,
    dto: UpdatePostDto,
  ): Promise<ContentPost> {
    const current = await this.findOne(tenantId, congregationId, id);

    // O tipo que vale é o do corpo quando ele vem, senão o que já está
    // gravado: ligar inscrição num post que já é evento não obriga a reenviar
    // `type`, e mudar o tipo para algo que não é evento no mesmo PATCH que
    // manda campo de evento continua sendo recusado.
    assertEventFields(dto.type ?? current.type, dto);

    return this.prisma.runInTx(async (tx) => {
      const data: Record<string, unknown> = {};
      if (dto.type !== undefined) data['type'] = dto.type;
      if (dto.title !== undefined) data['title'] = dto.title;
      if (dto.body !== undefined) data['body'] = dto.body;
      if (dto.media_url !== undefined) data['media_url'] = dto.media_url;
      if (dto.is_draft !== undefined) data['is_draft'] = dto.is_draft;
      if (dto.publish_at !== undefined) data['publish_at'] = dto.publish_at;
      if (dto.event_starts_at !== undefined) data['event_starts_at'] = dto.event_starts_at;
      if (dto.event_ends_at !== undefined) data['event_ends_at'] = dto.event_ends_at;
      if (dto.event_location !== undefined) data['event_location'] = dto.event_location;
      if (dto.registration_enabled !== undefined) {
        data['registration_enabled'] = dto.registration_enabled;
      }
      if (dto.registration_limit !== undefined) {
        data['registration_limit'] = dto.registration_limit;
      }
      if (dto.registration_deadline !== undefined) {
        data['registration_deadline'] = dto.registration_deadline;
      }

      const post = await tx.contentPost.update({ where: { id }, data });

      if (dto.segment_ids !== undefined) {
        await tx.postSegment.deleteMany({ where: { post_id: id } });
        if (dto.segment_ids.length) {
          await tx.postSegment.createMany({
            data: dto.segment_ids.map((segId) => ({ post_id: id, segment_id: segId })),
            skipDuplicates: true,
          });
        }
      }

      return post;
    });
  }

  async publish(tenantId: string, congregationId: string, id: string): Promise<ContentPost> {
    await this.findOne(tenantId, congregationId, id);
    const post = await this.prisma.client.contentPost.update({
      where: { id },
      data: { is_draft: false, published_at: new Date() },
      include: { postSegments: { include: { segment: true } } },
    });
    const segments = post.postSegments.map((ps) => ps.segment);
    // fire-and-forget: notification failure must not roll back the publish
    this.notifications.notifyPost(post, segments).catch((err: unknown) => {
      void err;
    });
    return post;
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<ContentPost> {
    const post = await this.findOne(tenantId, congregationId, id);
    await this.storageService.deleteByUrl(post.media_url);
    return this.prisma.client.contentPost.delete({ where: { id } });
  }

  async uploadMedia(
    tenantId: string,
    congregationId: string,
    id: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ media_url: string }> {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo não suportado.');
    }

    const post = await this.findOne(tenantId, congregationId, id);
    await this.storageService.deleteByUrl(post.media_url);

    const key = `content/${tenantId}/${congregationId}/${id}/${Date.now()}-${file.originalname}`;
    const media_url = await this.storageService.upload(file.buffer, key, file.mimetype);

    await this.prisma.client.contentPost.update({
      where: { id },
      data: { media_url },
    });

    return { media_url };
  }
}

/**
 * Campo de evento em post que não é evento (PROD-16).
 *
 * A checagem é aqui, e não no banco: `ContentPostType` já é o discriminador, e
 * uma CHECK constraint amarrada a um valor de enum é a primeira coisa a
 * envelhecer quando o enum cresce. Sem isto, um `notice` com
 * `registration_enabled: true` gravaria sem reclamar e ficaria com inscrição
 * que nenhuma tela mostra.
 *
 * A validação é só de coerência de tipo. Ordem de datas (`starts` antes de
 * `ends`, prazo antes do evento) fica de fora de propósito: evento
 * remarcado passa por estados temporariamente incoerentes, e recusar o PATCH
 * no meio disso obrigaria o organizador a adivinhar a ordem dos campos.
 */
function assertEventFields(
  type: ContentPostType,
  dto: Pick<
    CreatePostDto,
    | 'event_starts_at'
    | 'event_ends_at'
    | 'event_location'
    | 'registration_enabled'
    | 'registration_limit'
    | 'registration_deadline'
  >,
): void {
  if (type === 'event') return;

  const used = (
    [
      'event_starts_at',
      'event_ends_at',
      'event_location',
      'registration_enabled',
      'registration_limit',
      'registration_deadline',
    ] as const
  ).filter((field) => dto[field] !== undefined);

  if (used.length) {
    throw new BadRequestException(
      `Campos de evento só valem em post do tipo "event": ${used.join(', ')}`,
    );
  }
}
