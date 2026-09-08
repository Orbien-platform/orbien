import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSongDto } from './create-song.dto';

const BASE = {
  title: 'Grande é o Senhor',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSongDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateSongDto', () => {
  it('aceita apenas o campo obrigatório (title)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita title ausente', async () => {
    const dto = plainToInstance(CreateSongDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita title que não é string', async () => {
    const errors = await errorsFor({ title: 123 });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita title vazio', async () => {
    const errors = await errorsFor({ title: '' });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita title só com espaço', async () => {
    const errors = await errorsFor({ title: '   ' });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('aceita title válido', async () => {
    expect(await errorsFor({ title: 'Grande é o Senhor' })).toHaveLength(0);
  });

  it('aceita key como string', async () => {
    expect(await errorsFor({ key: 'G' })).toHaveLength(0);
  });

  it('rejeita key que não é string', async () => {
    const errors = await errorsFor({ key: 123 });
    expect(errors.some((e) => e.property === 'key')).toBe(true);
  });

  it('aceita bpm inteiro >= 1', async () => {
    expect(await errorsFor({ bpm: 120 })).toHaveLength(0);
  });

  it('rejeita bpm menor que 1', async () => {
    const errors = await errorsFor({ bpm: 0 });
    expect(errors.some((e) => e.property === 'bpm')).toBe(true);
  });

  it('aceita link como URL válida', async () => {
    expect(await errorsFor({ link: 'https://youtube.com/watch?v=abc' })).toHaveLength(0);
  });

  it('rejeita link que não é URL', async () => {
    const errors = await errorsFor({ link: 'não é url' });
    expect(errors.some((e) => e.property === 'link')).toBe(true);
  });

  it('aceita notes como string', async () => {
    expect(await errorsFor({ notes: 'tocar mais lento' })).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
