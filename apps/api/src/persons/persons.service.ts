import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Household,
  HouseholdMember,
  Person,
  PersonClassification,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { ListPersonsQueryDto } from './dto/list-persons-query.dto';
import { CreateHouseholdDto } from './dto/create-household.dto';
import { AddHouseholdMemberDto } from './dto/add-household-member.dto';

type DuplicateHit = Pick<Person, 'id' | 'full_name' | 'phone' | 'classification'>;

type CreatePersonResult = {
  person: Person;
  possible_duplicates: DuplicateHit[];
};

type PaginatedPersons = {
  data: Person[];
  total: number;
  page: number;
  limit: number;
};

type HouseholdWithMembers = Household & {
  members: Array<HouseholdMember & { person: Person }>;
};

@Injectable()
export class PersonsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePersonDto, user: JwtPayload): Promise<CreatePersonResult> {
    const person = await this.prisma.client.person.create({
      data: {
        ...dto,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });

    let possible_duplicates: DuplicateHit[] = [];

    if (dto.phone) {
      possible_duplicates = await this.prisma.client.person.findMany({
        where: { phone: dto.phone, id: { not: person.id } },
        select: { id: true, full_name: true, phone: true, classification: true },
      });
    }

    return { person, possible_duplicates };
  }

  async findAll(query: ListPersonsQueryDto): Promise<PaginatedPersons> {
    const { classification, gender, tag, search, page, limit } = query;

    const where: Prisma.PersonWhereInput = { deleted_at: null };
    if (classification) where.classification = classification;
    if (gender) where.gender = gender;
    if (search) where.full_name = { contains: search, mode: 'insensitive' };
    if (tag) where.personTags = { some: { tag: { equals: tag, mode: 'insensitive' } } };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.client.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { full_name: 'asc' },
      }),
      this.prisma.client.person.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<Person & { householdMemberships: HouseholdMember[] }> {
    const person = await this.prisma.client.person.findUnique({
      where: { id },
      include: { householdMemberships: true },
    });

    if (!person) throw new NotFoundException('Pessoa não encontrada');
    return person;
  }

  // Sem `user`: o escopo de tenant e congregação é do RLS, não deste método —
  // `tenant_congregation_isolation` avalia USING na linha antiga e WITH CHECK
  // na nova (ver prisma/migrations/003_rls_admin_write.sql). `remove`, logo
  // abaixo, já seguia essa convenção.
  async update(id: string, dto: UpdatePersonDto): Promise<Person> {
    const existing = await this.prisma.client.person.findUnique({
      where: { id },
      select: { id: true, membership_date: true },
    });

    if (!existing) throw new NotFoundException('Pessoa não encontrada');

    if (
      dto.classification === PersonClassification.member &&
      !dto.membership_date &&
      !existing.membership_date
    ) {
      throw new BadRequestException('Data de membresia é obrigatória para membros');
    }

    return this.prisma.client.person.update({ where: { id }, data: dto });
  }

  // DT-05 (LGPD, Art. 18): soft delete, não hard delete. Pessoa com doação
  // vinculada não pode ser removida — só anonimizada, porque
  // `financial_transaction.donor_person_id` precisa continuar íntegro para
  // relatórios contábeis e prestação de contas.
  async remove(id: string, user: JwtPayload): Promise<Person> {
    const existing = await this.prisma.client.person.findUnique({
      where: { id },
      select: { id: true, tenant_id: true, congregation_id: true, deleted_at: true },
    });

    if (!existing || existing.deleted_at) throw new NotFoundException('Pessoa não encontrada');

    const hasDonations = await this.prisma.client.financialTransaction.findFirst({
      where: { donor_person_id: id },
      select: { id: true },
    });
    if (hasDonations) {
      throw new ConflictException('Pessoa tem histórico financeiro. Use anonimização.');
    }

    const person = await this.prisma.client.person.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenant_id: existing.tenant_id,
        congregation_id: existing.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: id,
        entity: 'person',
        action: 'person.deleted',
      },
    });

    return person;
  }

  // DT-05 (LGPD, Art. 18, IV): zera os dados de identificação e revoga os
  // consentimentos. `donor_person_id` em financial_transaction permanece —
  // o join volta com a pessoa já anonimizada.
  async anonymize(id: string, user: JwtPayload): Promise<Person> {
    const existing = await this.prisma.client.person.findUnique({
      where: { id },
      select: { id: true, tenant_id: true, congregation_id: true },
    });

    if (!existing) throw new NotFoundException('Pessoa não encontrada');

    const person = await this.prisma.client.person.update({
      where: { id },
      data: this.anonymizedFields('Solicitação do titular - Art. 18, LGPD'),
    });

    await this.prisma.client.consentRecord.updateMany({
      where: { person_id: id, revoked_at: null },
      data: { revoked_at: new Date(), revocation_reason: 'Anonimização solicitada' },
    });

    await this.prisma.client.auditLog.create({
      data: {
        tenant_id: existing.tenant_id,
        congregation_id: existing.congregation_id,
        actor_user_id: user.sub,
        subject_person_id: id,
        entity: 'person',
        action: 'person.anonymized',
      },
    });

    return person;
  }

  // Chamado também pelo job de retenção (30 dias após o soft delete), com o
  // mesmo formato de campos — a diferença é só o motivo registrado.
  private anonymizedFields(reason: string): Prisma.PersonUpdateInput {
    return {
      full_name: 'ANONIMIZADO',
      phone: null,
      email: null,
      photo_url: null,
      birth_date: null,
      anonymized_at: new Date(),
      anonymization_reason: reason,
    };
  }

  // Job cron diário (ver PersonsRetentionScheduler): pessoas soft-deletadas
  // há mais de `retentionDays` e ainda não anonimizadas têm os dados
  // sensíveis eliminados, mas o registro permanece — é o que preserva a
  // integridade referencial com financial_transaction e audit_logs.
  async purgeExpiredSoftDeletes(retentionDays = 30): Promise<{ purged: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const expired = await this.prisma.system.person.findMany({
      where: { deleted_at: { lte: cutoff }, anonymized_at: null },
      select: { id: true },
    });

    for (const { id } of expired) {
      await this.prisma.system.person.update({
        where: { id },
        data: this.anonymizedFields('Eliminação automática — 30 dias após solicitação de exclusão'),
      });
    }

    return { purged: expired.length };
  }

  async createHousehold(dto: CreateHouseholdDto, user: JwtPayload): Promise<Household> {
    return this.prisma.client.household.create({
      data: {
        name: dto.name,
        tenant_id: user.tenant_id,
        congregation_id: user.congregation_id,
      },
    });
  }

  async findHousehold(id: string): Promise<HouseholdWithMembers> {
    const household = await this.prisma.client.household.findUnique({
      where: { id },
      include: {
        members: { include: { person: true } },
      },
    });

    if (!household) throw new NotFoundException('Família não encontrada');
    return household;
  }

  async addHouseholdMember(
    householdId: string,
    dto: AddHouseholdMemberDto,
  ): Promise<HouseholdMember> {
    await this.findHousehold(householdId);

    try {
      return await this.prisma.client.householdMember.create({
        data: {
          household_id: householdId,
          person_id: dto.person_id,
          role: dto.role,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('Pessoa já pertence a esta família');
      }
      throw e;
    }
  }
}
