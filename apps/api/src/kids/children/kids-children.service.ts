import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Person } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KidsConsentService } from '../consent/kids-consent.service';
import { KidsChildAccessService, KidsActor } from './kids-child-access.service';
import { CreateKidsChildDto } from './dto/create-kids-child.dto';
import { UpdateKidsChildDto } from './dto/update-kids-child.dto';

export type KidsChildView = {
  id: string;
  full_name: string;
  birth_date: Date | null;
  household_id: string | null;
  allergies: string | null;
  medical_notes: string | null;
};

const MAX_CHILD_AGE_YEARS = 18;

// Nascimento no futuro ou de quem já é maior de idade não é uma criança do
// kids; sem esta trava a faixa etária (calculada em meses) perde o sentido.
function assertBirthDate(birth: Date): void {
  const now = new Date();
  if (birth.getTime() > now.getTime()) {
    throw new BadRequestException('A data de nascimento não pode ser futura');
  }
  const limit = new Date(now);
  limit.setFullYear(limit.getFullYear() - MAX_CHILD_AGE_YEARS);
  if (birth.getTime() <= limit.getTime()) {
    throw new BadRequestException('Cadastro de criança é para menores de 18 anos');
  }
}

/**
 * Criança no Kids (KIDS-04, AD-013): `Person` com `is_child = true`, sem
 * `UserAccount`, no Household do responsável, com `HouseholdMember(child)`.
 * Alergia e observação médica vão para `kids_child_health` (tabela própria),
 * nunca para `Person`.
 */
@Injectable()
export class KidsChildrenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KidsChildAccessService,
    private readonly consent: KidsConsentService,
  ) {}

  async create(
    actor: KidsActor,
    dto: CreateKidsChildDto,
    meta: { ip?: string | null; userAgent?: string | null } = {},
  ): Promise<KidsChildView> {
    assertBirthDate(dto.birth_date);

    const ownId = await this.access.requireOwnPersonId(actor.userId).catch((e: unknown) => {
      // A equipe pode cadastrar por outra pessoa mesmo sem pessoa na conta.
      if (dto.guardian_person_id && this.access.isManager(actor.roles)) return null;
      throw e;
    });
    const guardianId = dto.guardian_person_id ?? ownId!;
    const onBehalf = guardianId !== ownId;
    if (onBehalf && !this.access.isManager(actor.roles)) {
      throw new ForbiddenException('Só a equipe cadastra a criança no lugar do responsável');
    }

    const guardian = await this.prisma.client.person.findFirst({
      where: {
        id: guardianId,
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        is_child: false,
        deleted_at: null,
      },
      select: { id: true, household_id: true, full_name: true },
    });
    if (!guardian) throw new NotFoundException('Responsável não encontrado');

    // Consentimento ANTES de qualquer escrita (AC 2 e 7).
    if (onBehalf && dto.register_consent === true && !(await this.consent.hasValidConsent(guardian.id))) {
      await this.consent.grant(actor.tenantId, actor.congregationId, guardian.id, 'secretaria', meta);
    } else {
      await this.consent.assertValidConsent(guardian.id);
    }

    const householdId = await this.resolveHousehold(actor, guardian);

    const child = await this.prisma.client.person.create({
      data: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        full_name: dto.full_name,
        birth_date: dto.birth_date,
        is_child: true,
        classification: 'attendee',
        household_id: householdId,
      },
    });
    await this.prisma.client.householdMember.create({
      data: { household_id: householdId, person_id: child.id, role: 'child' },
    });
    await this.prisma.client.kidsGuardian.create({
      data: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        child_id: child.id,
        guardian_person_id: guardian.id,
        relationship: dto.relationship ?? 'Responsável',
        can_pickup: true,
        is_primary: true,
      },
    });

    const allergies = dto.allergies ?? null;
    const medicalNotes = dto.medical_notes ?? null;
    if (allergies !== null || medicalNotes !== null) {
      await this.writeHealth(actor, child.id, { allergies, medical_notes: medicalNotes });
    }

    return toView(child, allergies, medicalNotes);
  }

  async update(actor: KidsActor, childId: string, dto: UpdateKidsChildDto): Promise<KidsChildView> {
    const child = await this.access.assertCanAccess(actor, childId);
    if (dto.birth_date) assertBirthDate(dto.birth_date);

    const personData = {
      ...(dto.full_name !== undefined && { full_name: dto.full_name }),
      ...(dto.birth_date !== undefined && { birth_date: dto.birth_date }),
    };
    const updated = Object.keys(personData).length
      ? await this.prisma.client.person.update({ where: { id: childId }, data: personData })
      : child;

    const health: { allergies?: string | null; medical_notes?: string | null } = {
      ...(dto.allergies !== undefined && { allergies: dto.allergies }),
      ...(dto.medical_notes !== undefined && { medical_notes: dto.medical_notes }),
    };
    let row: { allergies: string | null; medical_notes: string | null } | undefined;
    if (Object.keys(health).length) row = await this.writeHealth(actor, childId, health);

    return toView(updated, row?.allergies ?? null, row?.medical_notes ?? null);
  }

  private async writeHealth(
    actor: KidsActor,
    childId: string,
    fields: { allergies?: string | null; medical_notes?: string | null },
  ) {
    return this.prisma.client.kidsChildHealth.upsert({
      where: { person_id: childId },
      create: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        person_id: childId,
        allergies: fields.allergies ?? null,
        medical_notes: fields.medical_notes ?? null,
      },
      update: fields,
    });
  }

  // O Household do responsável: o da pessoa, o de uma participação existente,
  // ou um novo com ele como `head`.
  private async resolveHousehold(
    actor: KidsActor,
    guardian: { id: string; household_id: string | null; full_name: string },
  ): Promise<string> {
    if (guardian.household_id) return guardian.household_id;

    const membership = await this.prisma.client.householdMember.findFirst({
      where: { person_id: guardian.id, role: { not: 'child' } },
      select: { household_id: true },
    });
    if (membership) return membership.household_id;

    const surname = guardian.full_name.trim().split(/\s+/).slice(1).pop() ?? guardian.full_name.trim();
    const household = await this.prisma.client.household.create({
      data: {
        tenant_id: actor.tenantId,
        congregation_id: actor.congregationId,
        name: `Família ${surname}`,
      },
    });
    await this.prisma.client.householdMember.create({
      data: { household_id: household.id, person_id: guardian.id, role: 'head' },
    });
    await this.prisma.client.person.update({ where: { id: guardian.id }, data: { household_id: household.id } });
    return household.id;
  }
}

function toView(child: Person, allergies: string | null, medicalNotes: string | null): KidsChildView {
  return {
    id: child.id,
    full_name: child.full_name,
    birth_date: child.birth_date,
    household_id: child.household_id,
    allergies,
    medical_notes: medicalNotes,
  };
}
