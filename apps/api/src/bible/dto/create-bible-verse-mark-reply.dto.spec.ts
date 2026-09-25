import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBibleVerseMarkReplyDto } from './create-bible-verse-mark-reply.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateBibleVerseMarkReplyDto, payload));
}

describe('CreateBibleVerseMarkReplyDto', () => {
  it('aceita exatamente 3 e exatamente 1000 caracteres — limites inclusivos', async () => {
    expect(await errorsFor({ comment: 'abc' })).toHaveLength(0);
    expect(await errorsFor({ comment: 'a'.repeat(1000) })).toHaveLength(0);
  });

  it('rejeita resposta acima de 1000 caracteres', async () => {
    const errors = await errorsFor({ comment: 'a'.repeat(1001) });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita resposta só com espaço em branco — o trim roda antes do MinLength', async () => {
    const errors = await errorsFor({ comment: '     ' });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });

  it('rejeita resposta que não é string, sem tentar aparar', async () => {
    const errors = await errorsFor({ comment: 123 });
    expect(errors.some((e) => e.property === 'comment')).toBe(true);
  });
});
