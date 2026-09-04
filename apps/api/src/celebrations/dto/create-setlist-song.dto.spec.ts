import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSetlistSongDto } from './create-setlist-song.dto';

const BASE = {
  setlist_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  sequence: 1,
  title: 'Grande é o Senhor',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSetlistSongDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateSetlistSongDto', () => {
  it('aceita apenas os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita setlist_id que não é UUID', async () => {
    const errors = await errorsFor({ setlist_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'setlist_id')).toBe(true);
  });

  it('rejeita sequence menor que 1', async () => {
    const errors = await errorsFor({ sequence: 0 });
    expect(errors.some((e) => e.property === 'sequence')).toBe(true);
  });

  it('rejeita title que não é string', async () => {
    const errors = await errorsFor({ title: 123 });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
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
