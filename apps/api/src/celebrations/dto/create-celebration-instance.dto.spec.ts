import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCelebrationInstanceDto } from './create-celebration-instance.dto';

const BASE = {
  celebration_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  scheduled_date: '2026-09-06',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateCelebrationInstanceDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateCelebrationInstanceDto', () => {
  it('aceita celebration_id e scheduled_date válidos, sem notes', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita celebration_id que não é UUID', async () => {
    const errors = await errorsFor({ celebration_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'celebration_id')).toBe(true);
  });

  it('rejeita scheduled_date inválida', async () => {
    const errors = await errorsFor({ scheduled_date: 'não é data' });
    expect(errors.some((e) => e.property === 'scheduled_date')).toBe(true);
  });

  it('aceita notes como string', async () => {
    expect(await errorsFor({ notes: 'Culto especial' })).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
