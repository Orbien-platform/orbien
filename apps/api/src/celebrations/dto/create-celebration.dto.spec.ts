import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCelebrationDto } from './create-celebration.dto';

const BASE = {
  name: 'Culto de Celebração',
  type: 'sunday_service',
  start_time: '19:00',
  recurrence: 'weekly',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateCelebrationDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateCelebrationDto', () => {
  it('aceita os campos obrigatórios sem day_of_week', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita type fora do enum', async () => {
    const errors = await errorsFor({ type: 'invalido' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('aceita day_of_week dentro de 0..6', async () => {
    expect(await errorsFor({ day_of_week: 0 })).toHaveLength(0);
  });

  it('rejeita day_of_week acima de 6', async () => {
    const errors = await errorsFor({ day_of_week: 7 });
    expect(errors.some((e) => e.property === 'day_of_week')).toBe(true);
  });

  it('rejeita day_of_week negativo', async () => {
    const errors = await errorsFor({ day_of_week: -1 });
    expect(errors.some((e) => e.property === 'day_of_week')).toBe(true);
  });

  it('rejeita start_time fora do formato HH:MM', async () => {
    const errors = await errorsFor({ start_time: '7pm' });
    expect(errors.some((e) => e.property === 'start_time')).toBe(true);
  });

  it('rejeita recurrence fora do enum', async () => {
    const errors = await errorsFor({ recurrence: 'invalido' });
    expect(errors.some((e) => e.property === 'recurrence')).toBe(true);
  });
});
