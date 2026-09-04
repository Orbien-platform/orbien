import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AddScheduleMinistryDto } from './add-schedule-ministry.dto';

const BASE = { ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', slots: 2 };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(AddScheduleMinistryDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('AddScheduleMinistryDto', () => {
  it('aceita ministry_id e slots válidos', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita ministry_id que não é UUID', async () => {
    const errors = await errorsFor({ ministry_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'ministry_id')).toBe(true);
  });

  it('rejeita slots menor que 1', async () => {
    const errors = await errorsFor({ slots: 0 });
    expect(errors.some((e) => e.property === 'slots')).toBe(true);
  });

  it('rejeita slots que não é inteiro', async () => {
    const errors = await errorsFor({ slots: 1.5 });
    expect(errors.some((e) => e.property === 'slots')).toBe(true);
  });
});
