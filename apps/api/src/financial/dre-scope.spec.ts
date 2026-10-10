/**
 * `dre-scope.ts` é a única definição de "o que entra no resultado" (design.md):
 * DRE, matriz por centro, Balancete e série mensal consomem o mesmo recorte,
 * e é isso que garante o critério de sucesso "DRE = soma da matriz = Balancete".
 */
import {
  REALIZED_STATUSES,
  buildScope,
  resultLabel,
  round2,
} from './dre-scope';

const UUID_A = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const UUID_B = '9b2f8c1e-1d3a-4c55-8a7e-0f6a2b9d4c11';
const start = new Date('2026-01-01T00:00:00.000Z');
const end = new Date('2026-01-31T23:59:59.999Z');

const base = { tenantId: 't1', start, end, statuses: REALIZED_STATUSES };

describe('REALIZED_STATUSES', () => {
  it('é resultado realizado: paid + confirmed, e só', () => {
    expect([...REALIZED_STATUSES]).toEqual(['paid', 'confirmed']);
  });
});

describe('buildScope', () => {
  it('fixa tenant, período e status', () => {
    const where = buildScope(base);

    expect(where).toEqual({
      tenant_id: 't1',
      occurred_at: { gte: start, lte: end },
      status: { in: ['paid', 'confirmed'] },
    });
  });

  it('aceita outro conjunto de status (ex.: pending para "A realizar")', () => {
    const where = buildScope({ ...base, statuses: ['pending'] });

    expect(where.status).toEqual({ in: ['pending'] });
  });

  it('sem congregação e sem centro, essas chaves não vão para o where', () => {
    const where = buildScope(base);

    expect(where).not.toHaveProperty('congregation_id');
    expect(where).not.toHaveProperty('cost_center_id');
    expect(where).not.toHaveProperty('costCenter');
  });

  it('inclui congregation_id quando informado', () => {
    expect(buildScope({ ...base, congregationId: 'cong-1' }).congregation_id).toBe('cong-1');
  });

  it('costCenterId="none" filtra lançamentos sem centro (cost_center_id: null)', () => {
    const where = buildScope({ ...base, costCenterId: 'none' });

    expect(where.cost_center_id).toBeNull();
    expect(where).not.toHaveProperty('costCenter');
  });

  it('costCenterId UUID filtra por cost_center_id', () => {
    const where = buildScope({ ...base, costCenterId: UUID_A });

    expect(where.cost_center_id).toBe(UUID_A);
    expect(where).not.toHaveProperty('costCenter');
  });

  it('o UUID vence o nome do centro', () => {
    const where = buildScope({ ...base, costCenterId: UUID_B, costCenterName: 'Missões' });

    expect(where.cost_center_id).toBe(UUID_B);
    expect(where).not.toHaveProperty('costCenter');
  });

  it('"none" também vence o nome do centro', () => {
    const where = buildScope({ ...base, costCenterId: 'none', costCenterName: 'Missões' });

    expect(where.cost_center_id).toBeNull();
    expect(where).not.toHaveProperty('costCenter');
  });

  it('só o nome (compatibilidade) filtra pela relação costCenter', () => {
    const where = buildScope({ ...base, costCenterName: 'Missões' });

    expect(where.costCenter).toEqual({ name: 'Missões' });
    expect(where).not.toHaveProperty('cost_center_id');
  });
});

describe('round2', () => {
  it('0,10 + 0,20 − 0,30 vira 0, sem resíduo de ponto flutuante', () => {
    expect(round2(0.1 + 0.2 - 0.3)).toBe(0);
  });

  it('resíduo negativo também vira 0 (e não -0)', () => {
    expect(Object.is(round2(0.3 - 0.1 - 0.2), 0)).toBe(true);
  });

  it('arredonda a 2 casas', () => {
    expect(round2(10.456)).toBe(10.46);
    expect(round2(-10.456)).toBe(-10.46);
    expect(round2(100.5)).toBe(100.5);
  });
});

describe('resultLabel', () => {
  it('net > 0 → Lucro', () => {
    expect(resultLabel(0.01)).toBe('Lucro');
  });

  it('net < 0 → Prejuízo', () => {
    expect(resultLabel(-0.01)).toBe('Prejuízo');
  });

  it('net = 0 → Resultado zerado', () => {
    expect(resultLabel(0)).toBe('Resultado zerado');
  });
});
