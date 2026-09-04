import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UnavailabilityQueryDto } from './unavailability-query.dto';

const BASE = { month: '9', year: '2026' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UnavailabilityQueryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('UnavailabilityQueryDto', () => {
  it('aceita month e year válidos vindos como string de query param', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita month acima de 12', async () => {
    const errors = await errorsFor({ month: '13' });
    expect(errors.some((e) => e.property === 'month')).toBe(true);
  });

  it('rejeita month abaixo de 1', async () => {
    const errors = await errorsFor({ month: '0' });
    expect(errors.some((e) => e.property === 'month')).toBe(true);
  });

  it('rejeita year abaixo de 2000', async () => {
    const errors = await errorsFor({ year: '1999' });
    expect(errors.some((e) => e.property === 'year')).toBe(true);
  });
});
