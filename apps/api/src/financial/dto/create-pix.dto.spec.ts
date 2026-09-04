import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePixDto, CreateDynamicPixDto } from './create-pix.dto';

describe('CreatePixDto', () => {
  const BASE = { tenant_slug: 'igreja-x', amount: 50 };

  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreatePixDto, { ...BASE, ...payload });
    return validate(dto);
  }

  it('aceita tenant_slug e amount, sem os opcionais', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita tenant_slug vazio', async () => {
    const errors = await errorsFor({ tenant_slug: '' });
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });

  it('rejeita amount não numérico', async () => {
    const errors = await errorsFor({ amount: 'dez' });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('rejeita amount negativo ou zero', async () => {
    const errors = await errorsFor({ amount: -1 });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('aceita donor_name como string', async () => {
    expect(await errorsFor({ donor_name: 'Ana' })).toHaveLength(0);
  });

  it('rejeita donor_name que não é string', async () => {
    const errors = await errorsFor({ donor_name: 123 });
    expect(errors.some((e) => e.property === 'donor_name')).toBe(true);
  });

  it('aceita donor_email válido', async () => {
    expect(await errorsFor({ donor_email: 'ana@test.com' })).toHaveLength(0);
  });

  it('rejeita donor_email inválido', async () => {
    const errors = await errorsFor({ donor_email: 'não-é-email' });
    expect(errors.some((e) => e.property === 'donor_email')).toBe(true);
  });

  it('aceita category_slug como string', async () => {
    expect(await errorsFor({ category_slug: 'oferta' })).toHaveLength(0);
  });

  it('rejeita category_slug que não é string', async () => {
    const errors = await errorsFor({ category_slug: 123 });
    expect(errors.some((e) => e.property === 'category_slug')).toBe(true);
  });

  it('aceita website (honeypot) como string', async () => {
    expect(await errorsFor({ website: 'http://spam.com' })).toHaveLength(0);
  });

  it('rejeita website que não é string', async () => {
    const errors = await errorsFor({ website: 123 });
    expect(errors.some((e) => e.property === 'website')).toBe(true);
  });
});

describe('CreateDynamicPixDto', () => {
  const BASE = { amount: 50 };

  async function errorsFor(payload: Record<string, unknown>) {
    const dto = plainToInstance(CreateDynamicPixDto, { ...BASE, ...payload });
    return validate(dto);
  }

  it('aceita apenas amount', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita amount ausente/negativo', async () => {
    const errors = await errorsFor({ amount: -5 });
    expect(errors.some((e) => e.property === 'amount')).toBe(true);
  });

  it('aceita description como string', async () => {
    expect(await errorsFor({ description: 'Oferta de gratidão' })).toHaveLength(0);
  });

  it('rejeita description que não é string', async () => {
    const errors = await errorsFor({ description: 123 });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('aceita donor_person_id UUID válido', async () => {
    expect(await errorsFor({ donor_person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita donor_person_id que não é UUID', async () => {
    const errors = await errorsFor({ donor_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'donor_person_id')).toBe(true);
  });
});
