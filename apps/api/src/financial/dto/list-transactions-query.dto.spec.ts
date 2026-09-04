import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTransactionsQueryDto } from './list-transactions-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListTransactionsQueryDto, payload);
  return { dto, errors: await validate(dto) };
}

describe('ListTransactionsQueryDto', () => {
  it('aceita vazio e aplica os defaults de paginação', async () => {
    const { dto, errors } = await errorsFor({});
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita type válido', async () => {
    const { errors } = await errorsFor({ type: 'income' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita type fora do enum', async () => {
    const { errors } = await errorsFor({ type: 'transfer' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('aceita category_id UUID válido', async () => {
    const { errors } = await errorsFor({ category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita category_id que não é UUID', async () => {
    const { errors } = await errorsFor({ category_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'category_id')).toBe(true);
  });

  it('aceita donor_person_id UUID válido', async () => {
    const { errors } = await errorsFor({ donor_person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita donor_person_id que não é UUID', async () => {
    const { errors } = await errorsFor({ donor_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'donor_person_id')).toBe(true);
  });

  it('aceita since e until válidas', async () => {
    const { errors } = await errorsFor({ since: '2026-01-01', until: '2026-01-31' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita since inválida', async () => {
    const { errors } = await errorsFor({ since: 'não é data' });
    expect(errors.some((e) => e.property === 'since')).toBe(true);
  });

  it('rejeita until inválida', async () => {
    const { errors } = await errorsFor({ until: 'não é data' });
    expect(errors.some((e) => e.property === 'until')).toBe(true);
  });

  it('aceita page dentro do limite', async () => {
    const { errors } = await errorsFor({ page: 2 });
    expect(errors).toHaveLength(0);
  });

  it('rejeita page menor que 1', async () => {
    const { errors } = await errorsFor({ page: 0 });
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('aceita limit dentro do intervalo', async () => {
    const { errors } = await errorsFor({ limit: 50 });
    expect(errors).toHaveLength(0);
  });

  it('rejeita limit menor que 1', async () => {
    const { errors } = await errorsFor({ limit: 0 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejeita limit maior que 100', async () => {
    const { errors } = await errorsFor({ limit: 101 });
    expect(errors.some((e) => e.property === 'limit')).toBe(true);
  });
});
