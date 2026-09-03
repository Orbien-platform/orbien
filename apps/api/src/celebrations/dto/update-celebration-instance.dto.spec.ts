import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCelebrationInstanceDto } from './update-celebration-instance.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateCelebrationInstanceDto, payload);
  return validate(dto);
}

describe('UpdateCelebrationInstanceDto', () => {
  it('aceita objeto vazio (tudo opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita notes como string', async () => {
    expect(await errorsFor({ notes: 'Ceia especial' })).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  it('aceita status válido do enum', async () => {
    expect(await errorsFor({ status: 'published' })).toHaveLength(0);
  });

  it('rejeita status fora do enum', async () => {
    const errors = await errorsFor({ status: 'invalido' });
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
