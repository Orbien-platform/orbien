import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  MaterialAudience,
  MaterialVisibility,
  Prisma,
  StudyMaterial,
  StudyMaterialSource,
} from '@prisma/client';
import { assertMaterialFile } from './material-file';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../content/notifications.service';
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
    private readonly notifications: NotificationsService,
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

    // Tudo que pode recusar a requisição vem antes do upload: um 400 depois
    // dele deixaria o arquivo órfão no bucket.
    const ext = file ? assertMaterialFile(file).ext : undefined;
    const { audience, network_id, groupIds } = await this.resolveAudience(dto, user);

    let file_url: string | undefined;
    if (file) {
      const key = `${user.tenant_id}/materials/${randomUUID()}${ext}`;
      file_url = await this.storageService.upload(
        file.buffer,
        key,
        file.mimetype,
      );
    }

    try {
      return await this.prisma.runInTx(
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
              audience,
              network_id,
              visibility: dto.visibility ?? MaterialVisibility.all,
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
    } catch (err) {
      // Sem a linha no banco o arquivo ficaria órfão no bucket.
      await this.storageService.deleteByUrl(file_url);
      throw err;
    }
  }

  /**
   * Transforma o alcance pedido na lista de PGs que vai para `material_targets`.
   * A lista é uma foto do momento da criação (ver `StudyMaterial.audience`).
   * Tudo é filtrado pela congregação do usuário: rede ou PG de outra
   * congregação do tenant é recusado, não ignorado.
   */
  private async resolveAudience(
    dto: CreateStudyMaterialDto,
    user: JwtPayload,
  ): Promise<{ audience: MaterialAudience; network_id: string | null; groupIds: string[] }> {
    const hasTargets = !!dto.target_group_ids && dto.target_group_ids.length > 0;
    const audience =
      dto.audience ?? (hasTargets ? MaterialAudience.group : MaterialAudience.all_networks);

    if (audience === MaterialAudience.group) {
      if (!hasTargets) {
        throw new BadRequestException('Escolha pelo menos um PG para receber o material');
      }
      const found = await this.prisma.client.smallGroup.findMany({
        where: { id: { in: dto.target_group_ids }, congregation_id: user.congregation_id },
        select: { id: true },
      });
      if (found.length !== dto.target_group_ids!.length) {
        throw new BadRequestException('Um ou mais grupos não foram encontrados nesta congregação');
      }
      return { audience, network_id: null, groupIds: dto.target_group_ids! };
    }

    if (audience === MaterialAudience.network) {
      const network = await this.prisma.client.network.findFirst({
        where: { id: dto.network_id, congregation_id: user.congregation_id },
        select: { id: true },
      });
      if (!network) throw new BadRequestException('Rede não encontrada nesta congregação');
      const groups = await this.prisma.client.smallGroup.findMany({
        where: { network_id: network.id, congregation_id: user.congregation_id },
        select: { id: true },
      });
      return { audience, network_id: network.id, groupIds: groups.map((g) => g.id) };
    }

    const all = await this.prisma.client.smallGroup.findMany({
      where: { congregation_id: user.congregation_id },
      select: { id: true },
    });
    return { audience, network_id: null, groupIds: all.map((g) => g.id) };
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
    });
    if (!existing) throw new NotFoundException('Material não encontrado');

    let file_url: string | undefined;
    if (file) {
      await this.storageService.deleteByUrl(existing.file_url);
      const { ext } = assertMaterialFile(file);
      const key = `${user.tenant_id}/materials/${randomUUID()}${ext}`;
      file_url = await this.storageService.upload(
        file.buffer,
        key,
        file.mimetype,
      );
    }

    return this.prisma.runInTx(async (tx) => {
      // Concorrência otimista: só aplica se a versão ainda é a que foi lida
      // acima — evita duas edições simultâneas colidirem no índice único de
      // StudyMaterialVersion (study_material_id, version).
      const { count } = await tx.studyMaterial.updateMany({
        where: { id, version: existing.version },
        data: {
          ...dto,
          ...(dto.publish_at && { publish_at: new Date(dto.publish_at) }),
          ...(dto.expires_at && { expires_at: new Date(dto.expires_at) }),
          ...(file_url && { file_url }),
          version: { increment: 1 },
        },
      });
      if (count === 0) {
        throw new ConflictException(
          'Material foi alterado por outra pessoa nesse meio tempo — recarregue e tente de novo',
        );
      }

      // Snapshot da versão que acabou de ser substituída (PROD-10)
      await tx.studyMaterialVersion.create({
        data: {
          tenant_id: existing.tenant_id,
          congregation_id: existing.congregation_id,
          study_material_id: existing.id,
          version: existing.version,
          title: existing.title,
          description: existing.description,
          author: existing.author,
          source_type: existing.source_type,
          file_url: existing.file_url,
          rich_content: existing.rich_content,
          publish_at: existing.publish_at,
          expires_at: existing.expires_at,
          tags: existing.tags,
          changed_by_user_id: user.sub,
        },
      });

      return tx.studyMaterial.findUniqueOrThrow({ where: { id } });
    });
  }

  async getVersions(materialId: string) {
    const material = await this.prisma.client.studyMaterial.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!material) throw new NotFoundException('Material não encontrado');

    return this.prisma.client.studyMaterialVersion.findMany({
      where: { study_material_id: materialId },
      orderBy: { version: 'desc' },
      include: {
        changedBy: { select: { id: true, email: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.client.studyMaterial.findUnique({
      where: { id },
      select: { id: true, file_url: true },
    });
    if (!existing) throw new NotFoundException('Material não encontrado');
    await this.storageService.deleteByUrl(existing.file_url);
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

  /**
   * Avisa por push quem foi alcançado pelo material, não a congregação toda:
   * os membros dos PGs de `material_targets` — só `leader`/`trainee` quando a
   * visibilidade é `leaders_only`. Material sem PG alvo não tem a quem avisar
   * e fica marcado como avisado.
   */
  async publishPending(): Promise<void> {
    if (!process.env['ONESIGNAL_APP_ID']) {
      this.logger.warn('ONESIGNAL_APP_ID não configurado — notificações desabilitadas');
      return;
    }

    const now = new Date();
    // Janela de 24h: um envio que não passa não é retentado para sempre, e
    // material publicado há mais que isso sem aviso (o job parado, o
    // OneSignal fora) não vira push surpresa quando o job voltar.
    const pending = await this.prisma.system.studyMaterial.findMany({
      where: {
        publish_at: { lte: now, gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        notified_at: null,
      },
      select: {
        id: true,
        title: true,
        tenant_id: true,
        congregation_id: true,
        visibility: true,
        materialTargets: { select: { small_group_id: true } },
      },
    });

    if (pending.length === 0) return;

    this.logger.log(`Notificando ${pending.length} material(is) pendente(s)...`);

    for (const material of pending) {
      try {
        const groupIds = material.materialTargets.map((t) => t.small_group_id);
        const members =
          groupIds.length === 0
            ? []
            : await this.prisma.system.groupMembership.findMany({
                where: {
                  small_group_id: { in: groupIds },
                  ...(material.visibility === MaterialVisibility.leaders_only
                    ? { role: { in: ['leader', 'trainee'] } }
                    : {}),
                },
                select: { person_id: true },
                distinct: ['person_id'],
              });

        const delivered =
          members.length === 0 ||
          (await this.notifications.sendPushToPersons(
            {
              tenantId: material.tenant_id,
              congregationId: material.congregation_id,
              contentPostId: null,
              title: 'Novo material disponível',
              body: `${material.title} foi publicado no seu grupo.`,
              data: { type: 'study_material', material_id: material.id },
            },
            members.map((m) => m.person_id),
          ));
        if (!delivered) {
          this.logger.warn(`OneSignal não aceitou o aviso do material ${material.id}`);
          continue;
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
