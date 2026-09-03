import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderSongsDto } from './reorder-songs.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ReorderSongsDto, payload);
  return validate(dto);
}

describe('ReorderSongsDto', () => {
  it('aceita uma lista de songs válida', async () => {
    expect(
      await errorsFor({
        songs: [{ id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 1 }],
      }),
    ).toHaveLength(0);
  });

  it('rejeita songs que não é array', async () => {
    const errors = await errorsFor({ songs: 'não é array' });
    expect(errors.some((e) => e.property === 'songs')).toBe(true);
  });

  it('rejeita item com id que não é UUID', async () => {
    const errors = await errorsFor({ songs: [{ id: 'not-a-uuid', sequence: 1 }] });
    expect(errors.some((e) => e.property === 'songs')).toBe(true);
  });

  it('rejeita item com sequence menor que 1', async () => {
    const errors = await errorsFor({
      songs: [{ id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 0 }],
    });
    expect(errors.some((e) => e.property === 'songs')).toBe(true);
  });
});
