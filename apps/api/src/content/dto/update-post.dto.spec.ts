import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePostDto } from './update-post.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdatePostDto, payload);
  return validate(dto);
}

describe('UpdatePostDto', () => {
  it('aceita objeto vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ title: 'Novo título' })).toHaveLength(0);
  });

  it('rejeita type inválido quando informado', async () => {
    const errors = await errorsFor({ type: 'nao-existe' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });
});
