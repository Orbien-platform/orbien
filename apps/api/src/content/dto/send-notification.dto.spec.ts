import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendNotificationDto } from './send-notification.dto';

const BASE = {
  title: 'Aviso',
  body: 'Conteúdo do aviso',
  segment_ids: ['11111111-1111-4111-8111-111111111111'],
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(SendNotificationDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('SendNotificationDto', () => {
  it('aceita os campos obrigatórios, incluindo segment_ids vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
    expect(await errorsFor({ segment_ids: [] })).toHaveLength(0);
  });

  it('rejeita title ausente', async () => {
    const errors = await errorsFor({ title: undefined });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita body ausente', async () => {
    const errors = await errorsFor({ body: undefined });
    expect(errors.some((e) => e.property === 'body')).toBe(true);
  });

  it('rejeita segment_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ segment_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'segment_ids')).toBe(true);
  });
});
