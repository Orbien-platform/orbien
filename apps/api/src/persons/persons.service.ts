import {
  BadRequestException,
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

    const where: Prisma.PersonWhereInput = {};
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

  async update(id: string, dto: UpdatePersonDto, user: JwtPayload): Promise<Person> {
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

  async remove(id: string): Promise<Person> {
    const existing = await this.prisma.client.person.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) throw new NotFoundException('Pessoa não encontrada');

    return this.prisma.client.person.delete({ where: { id } });
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
