import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceOrderDto } from './update-service-order.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateServiceOrderDto, payload);
  return validate(dto);
}

describe('UpdateServiceOrderDto', () => {
  it('aceita objeto vazio (title é opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita title como string', async () => {
    expect(await errorsFor({ title: 'Novo título' })).toHaveLength(0);
  });

  it('rejeita title que não é string', async () => {
    const errors = await errorsFor({ title: 123 });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });
});
