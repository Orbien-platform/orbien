import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MinistryAvailabilityQueryDto } from './ministry-availability-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(MinistryAvailabilityQueryDto, payload);
  return validate(dto);
}

describe('MinistryAvailabilityQueryDto', () => {
  it('aceita uma data ISO 8601 válida', async () => {
    expect(await errorsFor({ date: '2026-09-06' })).toHaveLength(0);
  });

  it('rejeita data fora do formato ISO 8601', async () => {
    const errors = await errorsFor({ date: '06/09/2026' });
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });

  it('rejeita date ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'date')).toBe(true);
  });
});
