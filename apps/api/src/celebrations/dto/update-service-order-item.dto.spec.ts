import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateServiceOrderItemDto } from './update-service-order-item.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateServiceOrderItemDto, payload);
  return validate(dto);
}

describe('UpdateServiceOrderItemDto', () => {
  it('aceita objeto vazio (PartialType torna tudo opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ name: 'Novo nome do item' })).toHaveLength(0);
  });

  it('rejeita sequence menor que 1 quando informado', async () => {
    const errors = await errorsFor({ sequence: 0 });
    expect(errors.some((e) => e.property === 'sequence')).toBe(true);
  });

  it('rejeita responsible_type fora do enum quando informado', async () => {
    const errors = await errorsFor({ responsible_type: 'invalido' });
    expect(errors.some((e) => e.property === 'responsible_type')).toBe(true);
  });
});
