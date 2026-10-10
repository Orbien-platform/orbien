import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BalanceteQueryDto } from './balancete-query.dto';

const BASE = { period_start: '2026-01-01', period_end: '2026-01-31' };

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(BalanceteQueryDto, { ...BASE, ...payload }));
}

describe('BalanceteQueryDto', () => {
  it('aceita apenas o período', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita period_end anterior a period_start', async () => {
    const errors = await errorsFor({ period_start: '2026-02-01', period_end: '2026-01-31' });
    expect(errors.some((e) => e.property === 'period_end')).toBe(true);
  });

  it('aceita period_end igual a period_start', async () => {
    expect(await errorsFor({ period_start: '2026-01-10', period_end: '2026-01-10' })).toHaveLength(0);
  });

  it('rejeita congregation_id que não é UUID', async () => {
    const errors = await errorsFor({ congregation_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'congregation_id')).toBe(true);
  });
});
