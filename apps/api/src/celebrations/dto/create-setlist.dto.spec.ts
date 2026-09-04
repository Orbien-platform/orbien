import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSetlistDto } from './create-setlist.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSetlistDto, payload);
  return validate(dto);
}

describe('CreateSetlistDto', () => {
  it('aceita service_order_item_id UUID válido', async () => {
    expect(
      await errorsFor({ service_order_item_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    ).toHaveLength(0);
  });

  it('rejeita service_order_item_id que não é UUID', async () => {
    const errors = await errorsFor({ service_order_item_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'service_order_item_id')).toBe(true);
  });
});
