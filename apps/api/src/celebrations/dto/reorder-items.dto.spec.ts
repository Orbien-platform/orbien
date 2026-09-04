import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReorderItemsDto } from './reorder-items.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ReorderItemsDto, payload);
  return validate(dto);
}

describe('ReorderItemsDto', () => {
  it('aceita uma lista de items válida', async () => {
    expect(
      await errorsFor({
        items: [{ id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 1 }],
      }),
    ).toHaveLength(0);
  });

  it('rejeita items que não é array', async () => {
    const errors = await errorsFor({ items: 'não é array' });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('rejeita item com id que não é UUID', async () => {
    const errors = await errorsFor({ items: [{ id: 'not-a-uuid', sequence: 1 }] });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });

  it('rejeita item com sequence menor que 1', async () => {
    const errors = await errorsFor({
      items: [{ id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', sequence: 0 }],
    });
    expect(errors.some((e) => e.property === 'items')).toBe(true);
  });
});
