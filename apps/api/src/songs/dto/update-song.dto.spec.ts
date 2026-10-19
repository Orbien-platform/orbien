import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSongDto } from './update-song.dto';
import { UpdateSongVersionDto } from './update-song-version.dto';

describe('UpdateSongDto', () => {
  it('aceita objeto vazio e título novo', async () => {
    expect(await validate(plainToInstance(UpdateSongDto, {}))).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateSongDto, { title: 'Novo título' }))).toHaveLength(0);
  });

  it.each([123, '   '])('rejeita title inválido (%p)', async (title) => {
    const errors = await validate(plainToInstance(UpdateSongDto, { title }));
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });
});

describe('UpdateSongVersionDto', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validate(plainToInstance(UpdateSongVersionDto, payload));

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ key: 'E', bpm: 90 })).toHaveLength(0);
  });

  it('rejeita bpm menor que 1, link que não é URL e rótulo vazio', async () => {
    expect((await errorsFor({ bpm: 0 })).some((e) => e.property === 'bpm')).toBe(true);
    expect((await errorsFor({ link: 'não é url' })).some((e) => e.property === 'link')).toBe(true);
    expect((await errorsFor({ label: '  ' })).some((e) => e.property === 'label')).toBe(true);
  });
});
