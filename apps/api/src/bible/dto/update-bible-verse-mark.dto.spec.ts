import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBibleVerseMarkDto } from './update-bible-verse-mark.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateBibleVerseMarkDto, payload);
  return validate(dto);
}

describe('UpdateBibleVerseMarkDto', () => {
  it('aceita um comentário válido', async () => {
    expect(await errorsFor({ comment: 'Texto revisado do comentário' })).toHaveLength(0);
  });

  it('rejeita comentário ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita comentário curto demais', async () => {
    const errors = await errorsFor({ comment: 'oi' });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita comentário acima de 2000 caracteres', async () => {
    const errors = await errorsFor({ comment: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('aceita exatamente 3 e exatamente 2000 caracteres — limites inclusivos', async () => {
    expect(await errorsFor({ comment: 'abc' })).toHaveLength(0);
    expect(await errorsFor({ comment: 'a'.repeat(2000) })).toHaveLength(0);
  });

  it('rejeita comentário que não é string', async () => {
    const errors = await errorsFor({ comment: 123 });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });
});
