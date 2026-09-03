import { DemographicsService } from './demographics.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['pastor'],
  plan: 'premium',
};

// `$queryRaw` é chamado quatro vezes num `Promise.all`, na ordem:
// classificação, gênero, faixa etária, cruzamento gênero×faixa. O mock
// devolve, na mesma ordem, uma fixture "grande" o bastante para exercitar
// todos os ramos de agregação do serviço.
function serviceWithRows(rows: {
  classRows?: { classification: string; total: bigint }[];
  genderRows?: { gender: string | null; total: bigint }[];
  ageRows?: { range: string; total: bigint }[];
  crossRows?: { range: string; gender: string | null; total: bigint }[];
}) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(rows.classRows ?? [])
    .mockResolvedValueOnce(rows.genderRows ?? [])
    .mockResolvedValueOnce(rows.ageRows ?? [])
    .mockResolvedValueOnce(rows.crossRows ?? []);

  const prisma = { client: { $queryRaw: queryRaw } } as unknown as PrismaService;
  return { service: new DemographicsService(prisma), queryRaw };
}

describe('DemographicsService', () => {
  it('agrega totals, by_gender, by_age_range e by_gender_and_age a partir de uma base grande', async () => {
    const { service } = serviceWithRows({
      classRows: [
        { classification: 'visitor', total: 40n },
        { classification: 'attendee', total: 25n },
        { classification: 'member', total: 60n },
        // Categoria desconhecida: entra no total geral, mas em nenhum balde
        // específico — cobre o `else` final do encadeamento de ifs.
        { classification: 'unknown_bucket', total: 2n },
      ],
      genderRows: [
        { gender: 'male', total: 55n },
        { gender: 'female', total: 58n },
        { gender: 'other', total: 3n },
        { gender: 'prefer_not_to_say', total: 4n },
        { gender: null, total: 5n },
        // Idem: valor de gênero fora dos cinco baldes conhecidos.
        { gender: 'unknown_gender', total: 1n },
      ],
      ageRows: [
        { range: '0-2', total: 4n },
        { range: '3-6', total: 6n },
        { range: '18-24', total: 30n },
        { range: '60+', total: 12n },
      ],
      crossRows: [
        { range: '18-24', gender: 'male', total: 14n },
        { range: '18-24', gender: 'female', total: 15n },
        { range: '18-24', gender: 'other', total: 1n },
        { range: '60+', gender: null, total: 12n },
        // Faixa que o SQL nunca deveria produzir (fora de AGE_RANGES_IN_ORDER)
        // — cobre a guarda `if (!bucket) continue`.
        { range: 'faixa_inexistente', gender: 'male', total: 1n },
      ],
    });

    const result = await service.getStats(user, {} as never);

    expect(result.totals).toEqual({ visitor: 40, attendee: 25, member: 60, total: 127 });
    expect(result.by_gender).toEqual({
      male: 55,
      female: 58,
      other: 3,
      prefer_not_to_say: 4,
      not_informed: 5,
    });

    const ageMap = Object.fromEntries(result.by_age_range.map((r) => [r.range, r.total]));
    expect(ageMap).toMatchObject({ '0-2': 4, '3-6': 6, '18-24': 30, '60+': 12, '7-9': 0, not_informed: 0 });
    // Todas as onze faixas aparecem, mesmo as sem dados.
    expect(result.by_age_range).toHaveLength(11);

    const cross1824 = result.by_gender_and_age.find((r) => r.range === '18-24')!;
    expect(cross1824).toEqual({ range: '18-24', male: 14, female: 15, other: 1, not_informed: 0 });
    const cross60 = result.by_gender_and_age.find((r) => r.range === '60+')!;
    expect(cross60).toEqual({ range: '60+', male: 0, female: 0, other: 0, not_informed: 12 });
  });

  it('sem linhas, devolve zeros em todas as faixas e classificações', async () => {
    const { service } = serviceWithRows({});

    const result = await service.getStats(user, {} as never);

    expect(result.totals).toEqual({ visitor: 0, attendee: 0, member: 0, total: 0 });
    expect(result.by_gender).toEqual({
      male: 0,
      female: 0,
      other: 0,
      prefer_not_to_say: 0,
      not_informed: 0,
    });
    expect(result.by_age_range.every((r) => r.total === 0)).toBe(true);
  });

  it('registra apenas os filtros efetivamente aplicados', async () => {
    const noFilters = await serviceWithRows({}).service.getStats(user, {} as never);
    expect(noFilters.filters_applied).toEqual({});

    const withFilters = await serviceWithRows({}).service.getStats(user, {
      classification: 'member',
      since: '2026-01-01',
      until: '2026-06-01',
    } as never);
    expect(withFilters.filters_applied).toEqual({
      classification: 'member',
      since: '2026-01-01',
      until: '2026-06-01',
    });
  });

  it('gera generated_at como um ISO string válido', async () => {
    const { service } = serviceWithRows({});

    const result = await service.getStats(user, {} as never);

    expect(() => new Date(result.generated_at).toISOString()).not.toThrow();
  });

  it('usa 0 como fallback se o Map de faixa etária não tiver a chave (guarda defensiva)', async () => {
    // `ageMap` é pré-semeado com todas as faixas de AGE_RANGES_IN_ORDER, então
    // `.get(r)` nunca deveria devolver `undefined` em uso normal — o `?? 0` é
    // puramente defensivo. Simula essa falha forçando o primeiro `Map#get` a
    // devolver `undefined`, exatamente a chamada de `by_age_range`.
    const { service } = serviceWithRows({ ageRows: [{ range: '0-2', total: 9n }] });
    const getSpy = jest.spyOn(Map.prototype, 'get').mockReturnValueOnce(undefined);

    try {
      const result = await service.getStats(user, {} as never);
      expect(result.by_age_range[0]!.total).toBe(0);
    } finally {
      getSpy.mockRestore();
    }
  });
});
