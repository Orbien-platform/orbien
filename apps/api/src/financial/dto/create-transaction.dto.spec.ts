import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTransactionDto } from './create-transaction.dto';

const BASE = {
  type: 'income',
  amount: 100,
  occurred_at: '2026-01-15',
  category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateTransactionDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateTransactionDto', () => {
  it('aceita os campos obrigatórios, sem os opcionais', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita type fora do enum', async () => {
    const errors = await errorsFor({ type: 'transfer' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita amount não numérico', async () => {
    const errors = await errorsFor({ amount: 'cem' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejeita amount negativo', async () => {
    const errors = await errorsFor({ amount: -10 });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejeita occurred_at ausente', async () => {
    const dto = plainToInstance(CreateTransactionDto, {
      type: 'income',
      amount: 100,
      category_id: BASE.category_id,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'occurred_at')).toBe(true);
  });

  it('rejeita occurred_at inválida', async () => {
    const errors = await errorsFor({ occurred_at: 'não é data' });
    expect(errors.some((e) => e.property === 'occurred_at')).toBe(true);
  });

  it('aceita description como string', async () => {
    expect(await errorsFor({ description: 'Dízimo de janeiro' })).toHaveLength(0);
  });

  it('rejeita description que não é string', async () => {
    const errors = await errorsFor({ description: 123 });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('rejeita category_id que não é UUID', async () => {
    const errors = await errorsFor({ category_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'category_id')).toBe(true);
  });

  it('aceita donor_person_id UUID válido', async () => {
    expect(await errorsFor({ donor_person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita donor_person_id que não é UUID', async () => {
    const errors = await errorsFor({ donor_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'donor_person_id')).toBe(true);
  });

  it('aceita cost_center_id UUID válido', async () => {
    expect(await errorsFor({ cost_center_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita cost_center_id que não é UUID', async () => {
    const errors = await errorsFor({ cost_center_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'cost_center_id')).toBe(true);
  });

  it('aceita source válido', async () => {
    expect(await errorsFor({ source: 'manual' })).toHaveLength(0);
  });

  it('rejeita source fora do enum', async () => {
    const errors = await errorsFor({ source: 'invalido' });
    expect(errors.some((e) => e.property === 'source')).toBe(true);
  });

  it('aceita notes como string', async () => {
    expect(await errorsFor({ notes: 'observação' })).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
