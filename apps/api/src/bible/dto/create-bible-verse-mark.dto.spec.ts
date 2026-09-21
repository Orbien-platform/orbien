import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBibleVerseMarkDto } from './create-bible-verse-mark.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateBibleVerseMarkDto, payload);
  return validate(dto);
}

const VALID = {
  book_code: 'JHN',
  chapter: 3,
  verse_start: 16,
  verse_end: 18,
  comment: 'Deus amou o mundo de tal maneira...',
};

describe('CreateBibleVerseMarkDto', () => {
  it('aceita um payload válido completo', async () => {
    expect(await errorsFor(VALID)).toHaveLength(0);
  });

  it('rejeita book_code ausente', async () => {
    const { book_code: _book_code, ...rest } = VALID;
    const errors = await errorsFor(rest);
    expect(errors.some((e) => e.property === 'book_code')).toBe(true);
  });

  it('rejeita book_code que não é string', async () => {
    const errors = await errorsFor({ ...VALID, book_code: 123 });
    expect(errors.some((e) => e.property === 'book_code')).toBe(true);
  });

  it('rejeita chapter ausente', async () => {
    const { chapter: _chapter, ...rest } = VALID;
    const errors = await errorsFor(rest);
    expect(errors.some((e) => e.property === 'chapter')).toBe(true);
  });

  it('rejeita chapter não inteiro', async () => {
    const errors = await errorsFor({ ...VALID, chapter: 1.5 });
    expect(errors.some((e) => e.property === 'chapter')).toBe(true);
  });

  it('rejeita chapter menor que 1', async () => {
    const errors = await errorsFor({ ...VALID, chapter: 0 });
    expect(errors.some((e) => e.property === 'chapter')).toBe(true);
  });

  it('rejeita verse_start menor que 1', async () => {
    const errors = await errorsFor({ ...VALID, verse_start: 0 });
    expect(errors.some((e) => e.property === 'verse_start')).toBe(true);
  });

  it('rejeita verse_end menor que 1', async () => {
    const errors = await errorsFor({ ...VALID, verse_end: 0 });
    expect(errors.some((e) => e.property === 'verse_end')).toBe(true);
  });

  it('rejeita verse_start/verse_end não inteiros', async () => {
    expect(
      (await errorsFor({ ...VALID, verse_start: 1.2 })).some((e) => e.property === 'verse_start'),
    ).toBe(true);
    expect(
      (await errorsFor({ ...VALID, verse_end: 2.2 })).some((e) => e.property === 'verse_end'),
    ).toBe(true);
  });

  it('rejeita comentário ausente', async () => {
    const { comment: _comment, ...rest } = VALID;
    const errors = await errorsFor(rest);
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita comentário curto demais (menos de 3 caracteres)', async () => {
    const errors = await errorsFor({ ...VALID, comment: 'oi' });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita comentário acima de 2000 caracteres', async () => {
    const errors = await errorsFor({ ...VALID, comment: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('aceita comentário com exatamente 3 e exatamente 2000 caracteres — limites inclusivos', async () => {
    expect(await errorsFor({ ...VALID, comment: 'abc' })).toHaveLength(0);
    expect(await errorsFor({ ...VALID, comment: 'a'.repeat(2000) })).toHaveLength(0);
  });

  it('rejeita comentário só com espaço em branco — trim reduz a menos de 3 caracteres (spec.md, Edge Cases)', async () => {
    const errors = await errorsFor({ ...VALID, comment: '     ' });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('aparara espaço nas bordas antes de validar — "  abc  " sobra "abc", válido', async () => {
    expect(await errorsFor({ ...VALID, comment: '  abc  ' })).toHaveLength(0);
  });
});
