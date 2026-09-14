import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateGroupMessageDto } from './create-group-message.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateGroupMessageDto, payload);
  return validate(dto);
}

describe('CreateGroupMessageDto', () => {
  it('aceita uma mensagem comum', async () => {
    expect(await errorsFor({ content: 'chegamos às 20h' })).toHaveLength(0);
  });

  it('aceita mensagem de um caractere — "?" é mensagem', async () => {
    expect(await errorsFor({ content: '?' })).toHaveLength(0);
  });

  it('rejeita conteúdo ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejeita string vazia', async () => {
    const errors = await errorsFor({ content: '' });
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('rejeita conteúdo acima de 1000 caracteres', async () => {
    const errors = await errorsFor({ content: 'a'.repeat(1001) });
    expect(errors.some((e) => e.property === 'content')).toBe(true);
  });

  it('aceita exatamente 1000 caracteres — o limite é inclusivo', async () => {
    expect(await errorsFor({ content: 'a'.repeat(1000) })).toHaveLength(0);
  });
});
