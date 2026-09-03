import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceOrderDto } from './create-service-order.dto';

const BASE = {
  celebration_instance_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  title: 'Ordem de Culto — 06/09',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateServiceOrderDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateServiceOrderDto', () => {
  it('aceita celebration_instance_id e title válidos', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita celebration_instance_id que não é UUID', async () => {
    const errors = await errorsFor({ celebration_instance_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'celebration_instance_id')).toBe(true);
  });

  it('rejeita title que não é string', async () => {
    const errors = await errorsFor({ title: 123 });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });
});
