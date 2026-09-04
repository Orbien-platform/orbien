import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSegmentDto } from './update-segment.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSegmentDto, payload);
  return validate(dto);
}

describe('UpdateSegmentDto', () => {
  it('aceita objeto vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ name: 'Novo nome' })).toHaveLength(0);
  });

  it('rejeita criteria inválido quando informado', async () => {
    const errors = await errorsFor({ criteria: { roles: [42] } });
    expect(errors.some((e) => e.property === 'criteria')).toBe(true);
  });
});
