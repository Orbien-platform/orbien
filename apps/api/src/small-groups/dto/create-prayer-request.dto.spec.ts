import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePrayerRequestDto } from './create-prayer-request.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreatePrayerRequestDto, payload);
  return validate(dto);
}

describe('CreatePrayerRequestDto', () => {
  it('aceita só o conteúdo', async () => {
    expect(await errorsFor({ content: 'orem pela minha mãe' })).toHaveLength(0);
  });

  it('aceita is_anonymous booleano', async () => {
    expect(await errorsFor({ content: 'assunto delicado', is_anonymous: true })).toHaveLength(0);
  });

  it('rejeita conteúdo ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejeita conteúdo curto demais para ser um pedido', async () => {
    const errors = await errorsFor({ content: 'ok' });
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejeita conteúdo acima de 2000 caracteres', async () => {
    const errors = await errorsFor({ content: 'a'.repeat(2001) });
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('aceita exatamente 2000 caracteres — o limite é inclusivo', async () => {
    expect(await errorsFor({ content: 'a'.repeat(2000) })).toHaveLength(0);
  });

  it('rejeita is_anonymous que não é booleano', async () => {
    const errors = await errorsFor({ content: 'orem por mim', is_anonymous: 'sim' });
    expect(errors.some((e) => e.property === 'is_anonymous')).toBe(true);
  });
});
