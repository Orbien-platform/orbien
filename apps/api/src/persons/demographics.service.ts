import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { DemographicsQueryDto } from './dto/demographics-query.dto';

const AGE_RANGES_IN_ORDER = [
  '0-2', '3-6', '7-9', '10-12', '13-17',
  '18-24', '25-34', '35-44', '45-59', '60+', 'not_informed',
] as const;

const AGE_CASE_SQL = Prisma.sql`
  CASE
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 0  AND 2  THEN '0-2'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 3  AND 6  THEN '3-6'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 7  AND 9  THEN '7-9'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 10 AND 12 THEN '10-12'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 13 AND 17 THEN '13-17'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 18 AND 24 THEN '18-24'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 25 AND 34 THEN '25-34'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 35 AND 44 THEN '35-44'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) BETWEEN 45 AND 59 THEN '45-59'
    WHEN EXTRACT(YEAR FROM AGE(birth_date)) >= 60             THEN '60+'
    ELSE 'not_informed'
  END
`;

type ClassificationRow = { classification: string; total: bigint };
type GenderRow = { gender: string | null; total: bigint };
type AgeRangeRow = { range: string; total: bigint };
type CrossRow = { range: string; gender: string | null; total: bigint };

export interface DemographicsStats {
  totals: {
    visitor: number;
    attendee: number;
    member: number;
    total: number;
  };
  by_gender: {
    male: number;
    female: number;
    other: number;
    prefer_not_to_say: number;
    not_informed: number;
  };
  by_age_range: Array<{ range: string; total: number }>;
  by_gender_and_age: Array<{
    range: string;
    male: number;
    female: number;
    other: number;
    not_informed: number;
  }>;
  filters_applied: {
    classification?: string;
    since?: string;
    until?: string;
  };
  generated_at: string;
}

@Injectable()
export class DemographicsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(user: JwtPayload, query: DemographicsQueryDto): Promise<DemographicsStats> {
    const { tenant_id, congregation_id } = user;
    const { classification, since, until } = query;

    const classFilter = classification
      ? Prisma.sql`AND classification::text = ${classification}`
      : Prisma.empty;
    const sinceFilter = since
      ? Prisma.sql`AND created_at >= ${new Date(since)}`
      : Prisma.empty;
    const untilFilter = until
      ? Prisma.sql`AND created_at <= ${new Date(until)}`
      : Prisma.empty;

    const [classRows, genderRows, ageRows, crossRows] = await Promise.all([
      this.prisma.$queryRaw<ClassificationRow[]>`
        SELECT classification::text, COUNT(*) AS total
        FROM persons
        WHERE tenant_id = ${tenant_id}
          AND congregation_id = ${congregation_id}
          ${classFilter} ${sinceFilter} ${untilFilter}
        GROUP BY classification
      `,
      this.prisma.$queryRaw<GenderRow[]>`
        SELECT gender::text, COUNT(*) AS total
        FROM persons
        WHERE tenant_id = ${tenant_id}
          AND congregation_id = ${congregation_id}
          ${classFilter} ${sinceFilter} ${untilFilter}
        GROUP BY gender
      `,
      this.prisma.$queryRaw<AgeRangeRow[]>`
        SELECT ${AGE_CASE_SQL} AS range, COUNT(*) AS total
        FROM persons
        WHERE tenant_id = ${tenant_id}
          AND congregation_id = ${congregation_id}
          ${classFilter} ${sinceFilter} ${untilFilter}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<CrossRow[]>`
        SELECT ${AGE_CASE_SQL} AS range, gender::text, COUNT(*) AS total
        FROM persons
        WHERE tenant_id = ${tenant_id}
          AND congregation_id = ${congregation_id}
          ${classFilter} ${sinceFilter} ${untilFilter}
        GROUP BY 1, 2
      `,
    ]);

    const totals = { visitor: 0, attendee: 0, member: 0, total: 0 };
    for (const row of classRows) {
      const count = Number(row.total);
      if (row.classification === 'visitor') totals.visitor = count;
      else if (row.classification === 'attendee') totals.attendee = count;
      else if (row.classification === 'member') totals.member = count;
      totals.total += count;
    }

    const by_gender = { male: 0, female: 0, other: 0, prefer_not_to_say: 0, not_informed: 0 };
    for (const row of genderRows) {
      const count = Number(row.total);
      if (row.gender === null) by_gender.not_informed = count;
      else if (row.gender === 'male') by_gender.male = count;
      else if (row.gender === 'female') by_gender.female = count;
      else if (row.gender === 'other') by_gender.other = count;
      else if (row.gender === 'prefer_not_to_say') by_gender.prefer_not_to_say = count;
    }

    const ageMap = new Map<string, number>(AGE_RANGES_IN_ORDER.map((r) => [r, 0]));
    for (const row of ageRows) {
      ageMap.set(row.range, Number(row.total));
    }
    const by_age_range = AGE_RANGES_IN_ORDER.map((r) => ({ range: r, total: ageMap.get(r) ?? 0 }));

    type CrossBucket = { range: string; male: number; female: number; other: number; not_informed: number };
    const crossMap = new Map<string, CrossBucket>(
      AGE_RANGES_IN_ORDER.map((r) => [
        r,
        { range: r, male: 0, female: 0, other: 0, not_informed: 0 },
      ]),
    );
    for (const row of crossRows) {
      const bucket = crossMap.get(row.range);
      if (!bucket) continue;
      const count = Number(row.total);
      if (row.gender === 'male') bucket.male += count;
      else if (row.gender === 'female') bucket.female += count;
      else if (row.gender === 'other') bucket.other += count;
      else bucket.not_informed += count;
    }
    const by_gender_and_age = AGE_RANGES_IN_ORDER.map((r) => crossMap.get(r)!);

    const filters_applied: DemographicsStats['filters_applied'] = {};
    if (classification) filters_applied.classification = classification;
    if (since) filters_applied.since = since;
    if (until) filters_applied.until = until;

    return {
      totals,
      by_gender,
      by_age_range,
      by_gender_and_age,
      filters_applied,
      generated_at: new Date().toISOString(),
    };
  }
}
