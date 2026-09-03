import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateCelebrationDto } from './update-celebration.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateCelebrationDto, payload);
  return validate(dto);
}

describe('UpdateCelebrationDto', () => {
  it('aceita objeto vazio (PartialType torna tudo opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ name: 'Novo nome' })).toHaveLength(0);
  });

  it('rejeita type fora do enum quando informado', async () => {
    const errors = await errorsFor({ type: 'invalido' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita start_time fora do formato HH:MM quando informado', async () => {
    const errors = await errorsFor({ start_time: '7pm' });
    expect(errors.some((e) => e.property === 'start_time')).toBe(true);
  });
});
