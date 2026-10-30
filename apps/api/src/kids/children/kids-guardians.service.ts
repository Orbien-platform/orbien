import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { KidsGuardian } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsChildAccessService, KidsActor } from './kids-child-access.service';
import { AddKidsGuardianDto } from './dto/add-kids-guardian.dto';
import { UpdateKidsGuardianDto } from './dto/update-kids-guardian.dto';

export type KidsGuardianView = {
  id: string;
  guardian_person_id: string;
  full_name: string;
  phone: string | null;
  photo_url: string | null;
  relationship: string;
  can_pickup: boolean;
  is_primary: boolean;
};

/**
 * Responsáveis e terceiros autorizados (KIDS-05). A retirada exige a lista
 * explícita daqui, não só o Household (AD-013 item 3). Terceiro sem conta é uma
 * `Person` (nome + telefone, foto opcional) cadastrada pelo responsável.
 * Invariante: a criança sempre tem ao menos um responsável primário.
 */
@Injectable()
export class KidsGuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
  ) {}

  async add(actor: KidsActor, childId: string, dto: AddKidsGuardianDto): Promise<KidsGuardian> {
    await this.access.assertCanAccess(actor, childId);

    const isPrimary = dto.is_primary ?? false;
    const canPickup = dto.can_pickup ?? true;
    if (isPrimary && !canPickup) {
      throw new BadRequestException('O responsável primário precisa poder retirar a criança');
    }
    if (!dto.guardian_person_id && (!dto.full_name || !dto.phone)) {
      throw new BadRequestException('Informe a pessoa autorizada ou nome e telefone do terceiro');
    }

    const guardianId = dto.guardian_person_id
      ? await this.existingGuardian(actor, dto.guardian_person_id)
      : (await this.createThirdParty(actor, dto)).id;

    const duplicate = await this.prisma.client.kidsGuardian.findFirst({
      where: { child_id: childId, guardian_person_id: guardianId },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Esta pessoa já é responsável ou autorizada desta criança');

    return this.prisma.client.kidsGuardian.create({
      data: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        child_id: childId,
        guardian_person_id: guardianId,
        relationship: dto.relationship,
        can_pickup: canPickup,
        is_primary: isPrimary,
      },
    });
  }

  /**
   * Edita parentesco, permissão de retirada e primário de um responsável. Só o
   * responsável primário da criança (ou a gestão) pode; a criança mantém ao
   * menos um primário. Marcar alguém como primário rebaixa os demais na mesma
   * transação, com as linhas da criança travadas para duas edições simultâneas
   * não deixarem a criança sem primário.
   */
  async update(actor: KidsActor, guardianRowId: string, dto: UpdateKidsGuardianDto): Promise<KidsGuardian> {
    if (dto.relationship === undefined && dto.can_pickup === undefined && dto.is_primary === undefined) {
      throw new BadRequestException('Informe ao menos um campo para alterar');
    }
    const relationship = dto.relationship?.trim();
    if (dto.relationship !== undefined && !relationship) {
      throw new BadRequestException('Informe o parentesco');
    }

    const row = await this.prisma.client.kidsGuardian.findFirst({
      where: { id: guardianRowId, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
    });
    if (!row) throw new NotFoundException('Autorizado não encontrado');
    await this.access.assertCanAccess(actor, row.child_id);
    if (!this.access.isManager(actor.roles)) await this.assertIsPrimaryGuardian(actor, row.child_id);

    return this.prisma.runInTx(async () => {
      // ORDER BY id: o Postgres trava as linhas na ordem em que as devolve, e a
      // ordem física muda a cada UPDATE. Sem ordem fixa, duas edições travam as
      // mesmas linhas em sequências opostas e dão deadlock (40P01 -> 500).
      await this.prisma.client
        .$queryRaw`SELECT id FROM kids_guardians WHERE child_id = ${row.child_id} ORDER BY id FOR UPDATE`;

      // `row` foi lido antes do lock: outra edição pode ter promovido ou rebaixado
      // este responsável enquanto esperávamos. O estado que vale é o de depois do lock.
      const current = await this.prisma.client.kidsGuardian.findUnique({ where: { id: row.id } });
      if (!current) throw new NotFoundException('Autorizado não encontrado');

      const isPrimary = dto.is_primary ?? current.is_primary;
      const canPickup = dto.can_pickup ?? current.can_pickup;
      if (isPrimary && !canPickup) {
        throw new BadRequestException('O responsável primário precisa poder retirar a criança');
      }

      if (current.is_primary && !isPrimary) {
        const others = await this.prisma.client.kidsGuardian.count({
          where: { child_id: current.child_id, is_primary: true, id: { not: current.id } },
        });
        if (others === 0) {
          throw new UnprocessableEntityException('A criança precisa de ao menos um responsável primário');
        }
      }
      if (!current.is_primary && isPrimary) {
        await this.prisma.client.kidsGuardian.updateMany({
          where: { child_id: current.child_id, is_primary: true, id: { not: current.id } },
          data: { is_primary: false },
        });
      }

      return this.prisma.client.kidsGuardian.update({
        where: { id: current.id },
        data: {
          ...(relationship !== undefined && { relationship }),
          ...(dto.can_pickup !== undefined && { can_pickup: dto.can_pickup }),
          ...(dto.is_primary !== undefined && { is_primary: dto.is_primary }),
        },
      });
    });
  }

  async remove(actor: KidsActor, guardianRowId: string): Promise<void> {
    const row = await this.prisma.client.kidsGuardian.findFirst({
      where: { id: guardianRowId, tenant_id: actor.tenantId, congregation_id: actor.congregationId },
    });
    if (!row) throw new NotFoundException('Autorizado não encontrado');
    await this.access.assertCanAccess(actor, row.child_id);

    if (row.is_primary) {
      const others = await this.prisma.client.kidsGuardian.count({
        where: { child_id: row.child_id, is_primary: true, id: { not: row.id } },
      });
      if (others === 0) {
        throw new UnprocessableEntityException('A criança precisa de ao menos um responsável primário');
      }
    }
    await this.prisma.client.kidsGuardian.delete({ where: { id: row.id } });
  }

  async list(actor: KidsActor, childId: string): Promise<KidsGuardianView[]> {
    await this.access.assertCanAccess(actor, childId);
    const rows = await this.prisma.client.kidsGuardian.findMany({
      where: { child_id: childId },
      orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
      include: { guardian: { select: { full_name: true, phone: true, photo_url: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      guardian_person_id: r.guardian_person_id,
      full_name: r.guardian.full_name,
      phone: r.guardian.phone,
      photo_url: r.guardian.photo_url,
      relationship: r.relationship,
      can_pickup: r.can_pickup,
      is_primary: r.is_primary,
    }));
  }

  // Quem edita sem ser da gestão precisa ser o responsável primário da criança.
  // Ser do Household não basta: um autorizado não-primário só lê.
  private async assertIsPrimaryGuardian(actor: KidsActor, childId: string): Promise<void> {
    const ownId = await this.access.ownPersonId(actor.userId);
    const mine = ownId
      ? await this.prisma.client.kidsGuardian.findFirst({
          where: { child_id: childId, guardian_person_id: ownId, is_primary: true },
          select: { id: true },
        })
      : null;
    if (!mine) throw new ForbiddenException('Só o responsável primário pode alterar os autorizados');
  }

  private async existingGuardian(actor: KidsActor, personId: string): Promise<string> {
    const person = await this.prisma.client.person.findFirst({
      where: {
        id: personId,
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        is_child: false,
        deleted_at: null,
      },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('Pessoa não encontrada');
    return person.id;
  }

  private createThirdParty(actor: KidsActor, dto: AddKidsGuardianDto) {
    return this.prisma.client.person.create({
      data: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        full_name: dto.full_name!,
        phone: dto.phone!,
        photo_url: dto.photo_url ?? null,
        is_child: false,
      },
    });
  }
}
