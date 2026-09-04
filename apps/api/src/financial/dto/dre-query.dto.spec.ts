import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DreQueryDto } from './dre-query.dto';

const BASE = { period_start: '2026-01-01', period_end: '2026-01-31' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(DreQueryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('DreQueryDto', () => {
  it('aceita apenas o período', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita period_start inválido', async () => {
    const errors = await errorsFor({ period_start: 'não é data' });
    expect(errors.some((e) => e.property === 'period_start')).toBe(true);
  });

  it('rejeita period_end inválido', async () => {
    const errors = await errorsFor({ period_end: 'não é data' });
    expect(errors.some((e) => e.property === 'period_end')).toBe(true);
  });

  it('aceita congregation_id UUID válido', async () => {
    expect(await errorsFor({ congregation_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita congregation_id que não é UUID', async () => {
    const errors = await errorsFor({ congregation_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'congregation_id')).toBe(true);
  });

  it('aceita cost_center como string', async () => {
    expect(await errorsFor({ cost_center: 'Missões' })).toHaveLength(0);
  });

  it('rejeita cost_center que não é string', async () => {
    const errors = await errorsFor({ cost_center: 123 });
    expect(errors.some((e) => e.property === 'cost_center')).toBe(true);
  });
});
