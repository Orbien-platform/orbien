import { KidsGuardianSearchService, maskPhone } from './kids-guardian-search.service';
import { PrismaService } from '../../prisma/prisma.service';

const ACTOR = { userId: 'u1', tenantId: 't1', congregationId: 'g1', roles: ['ministry_leader'] };

function setup(rows: unknown[] = [], digitIds: string[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const queryRaw = jest.fn().mockResolvedValue(digitIds.map((id) => ({ id })));
  const prisma = { client: { person: { findMany }, $queryRaw: queryRaw } } as unknown as PrismaService;
  return { findMany, queryRaw, service: new KidsGuardianSearchService(prisma) };
}

describe('maskPhone', () => {
  it.each([
    ['(11) 98765-4321', '(**) *****-4321'],
    ['11987654321', '*******4321'],
    ['+55 11 98765-4321', '+** ** *****-4321'],
    ['123', '***'],
    ['', null],
    [null, null],
  ])('%p vira %p (só os 4 últimos dígitos ficam)', (input, expected) => {
    expect(maskPhone(input)).toBe(expected);
  });
});

describe('KidsGuardianSearchService.search (R3-4)', () => {
  it('consulta só adultos vivos da congregação do ator, ordenados, com limite 20', async () => {
    const { service, findMany } = setup();
    await service.search(ACTOR, { q: 'Maria' });

    const arg = findMany.mock.calls[0][0];
    expect(arg.where).toEqual(
      expect.objectContaining({
        tenant_id: 't1',
        congregation_id: 'g1',
        is_child: false,
        deleted_at: null,
        anonymized_at: null,
      }),
    );
    expect(arg.take).toBe(20);
    expect(arg.orderBy).toEqual({ full_name: 'asc' });
  });

  it('procura no nome (sem caixa) e no telefone', async () => {
    const { service, findMany } = setup();
    await service.search(ACTOR, { q: 'Ma' });
    expect(findMany.mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { full_name: { contains: 'Ma', mode: 'insensitive' } },
        { phone: { contains: 'Ma' } },
      ]),
    );
  });

  it('busca só por dígitos casa telefone gravado com pontuação (consulta pelos dígitos)', async () => {
    const { service, findMany, queryRaw } = setup([], ['p1']);
    await service.search(ACTOR, { q: '119876' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([{ id: { in: ['p1'] } }]));
  });

  it('termo sem dígitos suficientes não faz a consulta por dígitos', async () => {
    const { service, queryRaw } = setup();
    await service.search(ACTOR, { q: 'Maria' });
    await service.search(ACTOR, { q: 'a1' });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('só seleciona id, nome e telefone (nada sensível sai do banco)', async () => {
    const { service, findMany } = setup();
    await service.search(ACTOR, { q: 'Maria' });
    expect(findMany.mock.calls[0][0].select).toEqual({ id: true, full_name: true, phone: true });
  });

  it('responde id, nome e telefone mascarado — sem o telefone inteiro', async () => {
    const { service } = setup([{ id: 'p1', full_name: 'Maria Souza', phone: '(11) 98765-4321' }, { id: 'p2', full_name: 'Sem Fone', phone: null }]);
    const out = await service.search(ACTOR, { q: 'ma' });
    expect(out).toEqual([
      { id: 'p1', full_name: 'Maria Souza', phone_masked: '(**) *****-4321' },
      { id: 'p2', full_name: 'Sem Fone', phone_masked: null },
    ]);
    expect(JSON.stringify(out)).not.toContain('98765');
  });
});
