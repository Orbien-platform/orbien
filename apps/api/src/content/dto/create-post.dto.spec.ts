import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePostDto } from './create-post.dto';

const BASE = {
  type: 'post',
  title: 'Bem-vindos',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreatePostDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreatePostDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        body: 'Texto do post',
        media_url: 'https://cdn.exemplo.com/a.png',
        publish_at: '2026-09-10T10:00:00.000Z',
        is_draft: false,
        segment_ids: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).toHaveLength(0);
  });

  it('rejeita type ausente ou inválido', async () => {
    const errors = await errorsFor({ type: 'nao-existe' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita title ausente', async () => {
    const errors = await errorsFor({ title: undefined });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita body que não é string', async () => {
    const errors = await errorsFor({ body: 42 });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejeita media_url que não é string', async () => {
    const errors = await errorsFor({ media_url: 42 });
    expect(errors.some((e) => e.property === 'media_url')).toBe(true);
  });

  it('rejeita is_draft que não é boolean', async () => {
    const errors = await errorsFor({ is_draft: 'sim' });
    expect(errors.some((e) => e.property === 'is_draft')).toBe(true);
  });

  it('rejeita segment_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ segment_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'segment_ids')).toBe(true);
  });
});
