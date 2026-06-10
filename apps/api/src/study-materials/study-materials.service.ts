import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StudyMaterial, StudyMaterialSource } from '@prisma/client';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateStudyMaterialDto } from './dto/create-study-material.dto';
import { UpdateStudyMaterialDto } from './dto/update-study-material.dto';
import { ListStudyMaterialsQueryDto, MaterialStatus } from './dto/list-study-materials-query.dto';

function computeStatus(m: StudyMaterial): MaterialStatus {
  const now = new Date();
  if (m.publish_at > now) return 'scheduled';
  if (m.expires_at && m.expires_at <= now) return 'expired';
  return 'published';
}

@Injectable()
export class StudyMaterialsService {
  private readonly logger = new Logger(StudyMaterialsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async create(
    dto: CreateStudyMaterialDto,
    file: Express.Multer.File | undefined,
    user: JwtPayload,
  ) {
    const needsFile =
      dto.source_type === StudyMaterialSource.pdf ||
      dto.source_type === StudyMaterialSource.doc;

    if (needsFile && !file) {
      throw new BadRequestException(
        'Arquivo é obrigatório para source_type pdf ou doc',
      );
    }
    if (dto.source_type === StudyMaterialSource.rich_text && !dto.rich_content) {
      throw new BadRequestException(
        'rich_content é obrigatório para source_type rich_text',
      );
    }

    let file_url: string | undefined;
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      const key = `${user.tenant_id}/materials/${randomUUID()}${ext}`;
      file_url = await this.storageService.upload(
        file.buffer,
        key,
        file.mimetype,
      );
    }

    // Resolve target groups
    let groupIds: string[];
    if (dto.target_group_ids && dto.target_group_ids.length > 0) {
      const found = await this.prisma.client.smallGroup.findMany({
        where: {
          id: { in: dto.target_group_ids },
          congregation_id: user.congregation_id,
        },
        select: { id: true },
      });
      if (found.length !== dto.target_group_ids.length) {
        throw new BadRequestException('Um ou mais grupos não foram encontrados nesta congregação');
      }
      groupIds = dto.target_group_ids;
    } else {
      const allGroups = await this.prisma.client.smallGroup.findMany({
        where: { congregation_id: user.congregation_id },
        select: { id: true },
      });
      groupIds = allGroups.map((g) => g.id);
    }

    return this.prisma.runInTx(
      async (tx) => {
        const material = await tx.studyMaterial.create({
          data: {
            tenant_id: user.tenant_id,
            congregation_id: user.congregation_id,
            title: dto.title,
            description: dto.description,
            author: dto.author,
            source_type: dto.source_type,
            rich_content: dto.rich_content,
            file_url,
            publish_at: new Date(dto.publish_at),
            expires_at: dto.expires_at ? new Date(dto.expires_at) : undefined,
            tags: dto.tags ?? [],
          },
        });

        if (groupIds.length > 0) {
          await tx.materialTarget.createMany({
            data: groupIds.map((small_group_id) => ({
              study_material_id: material.id,
              small_group_id,
            })),
            skipDuplicates: true,
          });
        }

        return tx.studyMaterial.findUnique({
          where: { id: material.id },
          include: {
            materialTargets: { include: { smallGroup: true } },
          },
        });
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
  }

  async findAll(query: ListStudyMaterialsQueryDto) {
    const { status, search, page, limit } = query;
    const now = new Date();

    const where: Prisma.StudyMaterialWhereInput = {};

    if (search) where.title = { contains: search, mode: 'insensitive' };

    if (status === 'scheduled') {
      where.publish_at = { gt: now };
    } else if (status === 'published') {
      where.publish_at = { lte: now };
      where.OR = [{ expires_at: null }, { expires_at: { gt: now } }];
    } else if (status === 'expired') {
      where.expires_at = { lte: now };
    }

    const skip = (page - 1) * limit;

    const [raw, total] = await Promise.all([
      this.prisma.client.studyMaterial.findMany({
        where,
        skip,
        take: limit,
        orderBy: { publish_at: 'desc' },
        include: {
          _count: { select: { openRecords: true } },
        },
      }),
      this.prisma.client.studyMaterial.count({ where }),
    ]);

    const data = raw.map((m) => ({ ...m, status: computeStatus(m) }));
    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const material = await this.prisma.client.studyMaterial.findUnique({
      where: { id },
      include: {
        materialTargets: { include: { smallGroup: true } },
        _count: { select: { openRecords: true } },
      },
    });
    if (!material) throw new NotFoundException('Material não encontrado');
    return { ...material, status: computeStatus(material) };
  }

  async update(
    id: string,
    dto: UpdateStudyMaterialDto,
    file: Express.Multer.File | undefined,
    user: JwtPayload,
  ) {
    const existing = await this.prisma.client.studyMaterial.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Material não encontrado');

    let file_url: string | undefined;
    if (file) {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      const key = `${user.tenant_id}/materials/${randomUUID()}${ext}`;
      file_url = await this.storageService.upload(
        file.buffer,
        key,
        file.mimetype,
      );
    }

    return this.prisma.client.studyMaterial.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.publish_at && { publish_at: new Date(dto.publish_at) }),
        ...(dto.expires_at && { expires_at: new Date(dto.expires_at) }),
        ...(file_url && { file_url }),
        version: { increment: 1 },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.studyMaterial.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Material não encontrado');
    return this.prisma.client.studyMaterial.delete({ where: { id } });
  }

  async recordOpen(materialId: string, user: JwtPayload) {
    // Resolve person_id from the logged-in user account
    const account = await this.prisma.client.userAccount.findUnique({
      where: { id: user.sub },
      select: { person_id: true },
    });

    const personId = account?.person_id;
    if (!personId) {
      // User account not linked to a person — skip silently
      return { recorded: false, reason: 'user_account_not_linked_to_person' };
    }

    const existing = await this.prisma.client.materialOpenRecord.findFirst({
      where: { study_material_id: materialId, person_id: personId },
    });

    if (existing) return { recorded: false, already_opened: true };

    const record = await this.prisma.client.materialOpenRecord.create({
      data: {
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
        study_material_id: materialId,
        person_id: personId,
      },
    });

    return { recorded: true, record };
  }

  async getOpenStats(materialId: string) {
    const material = await this.prisma.client.studyMaterial.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!material) throw new NotFoundException('Material não encontrado');

    const targets = await this.prisma.client.materialTarget.findMany({
      where: { study_material_id: materialId },
      select: { small_group_id: true },
    });

    const groupIds = targets.map((t) => t.small_group_id);

    const memberships = await this.prisma.client.groupMembership.findMany({
      where: { small_group_id: { in: groupIds } },
      select: { person_id: true },
      distinct: ['person_id'],
    });

    const total_targets = memberships.length;

    const opened = await this.prisma.client.materialOpenRecord.count({
      where: { study_material_id: materialId },
    });

    const percentage =
      total_targets > 0 ? Math.round((opened / total_targets) * 100) : 0;

    return { total_targets, opened, percentage };
  }

  async publishPending(): Promise<void> {
    if (!process.env['ONESIGNAL_APP_ID']) {
      this.logger.warn('ONESIGNAL_APP_ID não configurado — notificações desabilitadas');
      return;
    }

    const now = new Date();
    const pending = await this.prisma.system.studyMaterial.findMany({
      where: { publish_at: { lte: now }, notified_at: null },
      select: { id: true, title: true, congregation_id: true },
    });

    if (pending.length === 0) return;

    this.logger.log(`Notificando ${pending.length} material(is) pendente(s)...`);

    for (const material of pending) {
      try {
        const res = await fetch('https://onesignal.com/api/v1/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${process.env['ONESIGNAL_REST_API_KEY']}`,
          },
          body: JSON.stringify({
            app_id: process.env['ONESIGNAL_APP_ID'],
            filters: [
              {
                field: 'tag',
                key: 'congregation_id',
                relation: '=',
                value: material.congregation_id,
              },
            ],
            headings: { pt: 'Novo material disponível' },
            contents: { pt: `${material.title} foi publicado no seu grupo.` },
            data: { type: 'study_material', material_id: material.id },
          }),
        });

        if (!res.ok) {
          this.logger.warn(`OneSignal retornou ${res.status} para material ${material.id}`);
        }

        await this.prisma.system.studyMaterial.update({
          where: { id: material.id },
          data: { notified_at: now },
        });
      } catch (err) {
        this.logger.error(`Falha ao notificar material ${material.id}: ${String(err)}`);
      }
    }
  }
}
