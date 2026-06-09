import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentPost, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    congregationId: string,
    userId: string,
    dto: CreatePostDto,
  ): Promise<ContentPost> {
    const isDraft = dto.is_draft !== false;
    const publishedAt = !isDraft && !dto.publish_at ? new Date() : undefined;

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

  async findOne(tenantId: string, congregationId: string, id: string): Promise<ContentPost> {
    const post = await this.prisma.client.contentPost.findFirst({
      where: { id, tenant_id: tenantId, congregation_id: congregationId },
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
    await this.findOne(tenantId, congregationId, id);

    return this.prisma.runInTx(async (tx) => {
      const data: Record<string, unknown> = {};
      if (dto.type !== undefined) data['type'] = dto.type;
      if (dto.title !== undefined) data['title'] = dto.title;
      if (dto.body !== undefined) data['body'] = dto.body;
      if (dto.media_url !== undefined) data['media_url'] = dto.media_url;
      if (dto.is_draft !== undefined) data['is_draft'] = dto.is_draft;
      if (dto.publish_at !== undefined) data['publish_at'] = dto.publish_at;

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
    return this.prisma.client.contentPost.update({
      where: { id },
      data: { is_draft: false, published_at: new Date() },
    });
  }

  async remove(tenantId: string, congregationId: string, id: string): Promise<ContentPost> {
    await this.findOne(tenantId, congregationId, id);
    return this.prisma.client.contentPost.delete({ where: { id } });
  }
}
