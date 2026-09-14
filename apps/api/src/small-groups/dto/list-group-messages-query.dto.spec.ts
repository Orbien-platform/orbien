import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListGroupMessagesQueryDto } from './list-group-messages-query.dto';

const UUID = '11111111-1111-4111-8111-111111111111';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListGroupMessagesQueryDto, payload);
  return validate(dto);
}

describe('ListGroupMessagesQueryDto', () => {
  it('aceita query vazia e usa limit 50', async () => {
    const dto = plainToInstance(ListGroupMessagesQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(50);
  });

  it('converte limit de string de query string para número', async () => {
    const dto = plainToInstance(ListGroupMessagesQueryDto, { limit: '20' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(20);
  });

  it('aceita before e after como uuid', async () => {
    expect(await errorsFor({ before: UUID })).toHaveLength(0);
    expect(await errorsFor({ after: UUID })).toHaveLength(0);
  });

  it('rejeita cursor que não é uuid — id de mensagem é uuid', async () => {
    const errors = await errorsFor({ before: 'ontem' });
    expect(errors.some((e) => e.property === 'before')).toBe(true);
  });

  it('rejeita limit acima de 100', async () => {
    const errors = await errorsFor({ limit: 101 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejeita limit zero ou negativo', async () => {
    expect((await errorsFor({ limit: 0 })).some((e) => e.property === 'limit')).toBe(true);
    expect((await errorsFor({ limit: -1 })).some((e) => e.property === 'limit')).toBe(true);
  });
});
