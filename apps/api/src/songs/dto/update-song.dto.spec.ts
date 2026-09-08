import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSongDto } from './update-song.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSongDto, payload);
  return validate(dto);
}

describe('UpdateSongDto', () => {
  it('aceita objeto vazio (PartialType torna tudo opcional, inclusive title)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ title: 'Novo título', bpm: 90 })).toHaveLength(0);
  });

  it('rejeita bpm menor que 1 quando informado', async () => {
    const errors = await errorsFor({ bpm: 0 });
    expect(errors.some((e) => e.property === 'bpm')).toBe(true);
  });

  it('rejeita link que não é URL quando informado', async () => {
    const errors = await errorsFor({ link: 'não é url' });
    expect(errors.some((e) => e.property === 'link')).toBe(true);
  });

  it('rejeita title que não é string quando informado', async () => {
    const errors = await errorsFor({ title: 123 });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });
});
