import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateRecurringRuleDto } from './create-recurring-rule.dto';

const BASE_FIXED = {
  mode: 'fixed',
  frequency: 'monthly',
  amount: 100,
  type: 'income',
  category_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  description: 'Dízimo mensal',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateRecurringRuleDto, payload);
  return validate(dto);
}

describe('CreateRecurringRuleDto', () => {
  it('aceita uma regra fixed sem installments', async () => {
    expect(await errorsFor(BASE_FIXED)).toHaveLength(0);
  });

  it('rejeita mode fora do enum', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, mode: 'invalido' });
    expect(errors.some((e) => e.property === 'mode')).toBe(true);
  });

  it('rejeita frequency fora do enum', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, frequency: 'invalido' });
    expect(errors.some((e) => e.property === 'frequency')).toBe(true);
  });

  it('exige installments quando mode é installment', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, mode: 'installment' });
    expect(errors.some((e) => e.property === 'installments')).toBe(true);
  });

  it('aceita installment com installments >= 2', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, mode: 'installment', installments: 3 });
    expect(errors).toHaveLength(0);
  });

  it('rejeita installments menor que 2', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, mode: 'installment', installments: 1 });
    expect(errors.some((e) => e.property === 'installments')).toBe(true);
  });

  it('ignora installments quando mode é fixed (ValidateIf)', async () => {
    // Mesmo um installments inválido não deve gerar erro quando mode !== installment.
    const errors = await errorsFor({ ...BASE_FIXED, mode: 'fixed', installments: 1 });
    expect(errors.some((e) => e.property === 'installments')).toBe(false);
  });

  it('rejeita amount não positivo', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, amount: 0 });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejeita type fora do enum', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, type: 'invalido' });
    expect(errors.some((e) => e.property === 'type')).toBe(true);
  });

  it('rejeita category_id que não é UUID', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, category_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'category_id')).toBe(true);
  });

  it('rejeita description vazia', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, description: '' });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('aceita notes como string', async () => {
    expect(await errorsFor({ ...BASE_FIXED, notes: 'obs' })).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, notes: 123 });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });

  it('aceita started_at como data ISO', async () => {
    expect(await errorsFor({ ...BASE_FIXED, started_at: '2026-01-01' })).toHaveLength(0);
  });

  it('rejeita started_at inválida', async () => {
    const errors = await errorsFor({ ...BASE_FIXED, started_at: 'não é data' });
    expect(errors.some((e) => e.property === 'started_at')).toBe(true);
  });
});
