import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListDonationReceiptsQueryDto } from './list-donation-receipts-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListDonationReceiptsQueryDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('ListDonationReceiptsQueryDto', () => {
  it('aceita vazio e aplica os defaults de paginação', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.page_size).toBe(20);
  });

  it('aceita page e page_size dentro do limite, convertendo string em number', async () => {
    const { dto, errors } = await errorsFor({ page: '2', page_size: '50' });
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.page_size).toBe(50);
  });

  it('rejeita page menor que 1', async () => {
    const { errors } = await errorsFor({ page: 0 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita page_size menor que 1', async () => {
    const { errors } = await errorsFor({ page_size: 0 });
    expect(errors.some((e) => e.property === 'page_size')).toBe(true);
  });

  it('rejeita page_size maior que 100', async () => {
    const { errors } = await errorsFor({ page_size: 101 });
    expect(errors.some((e) => e.property === 'page_size')).toBe(true);
  });
});
