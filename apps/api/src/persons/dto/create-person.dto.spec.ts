import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePersonDto } from './create-person.dto';

const BASE = { full_name: 'Ana Silva' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreatePersonDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreatePersonDto', () => {
  it('aceita apenas o nome completo (todo o resto é opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita full_name ausente/vazio', async () => {
    const dto = plainToInstance(CreatePersonDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'full_name')).toBe(true);
  });

  it('aceita phone como string', async () => {
    expect(await errorsFor({ phone: '+5511999999999' })).toHaveLength(0);
  });

  it('rejeita phone que não é string', async () => {
    const errors = await errorsFor({ phone: 123 });
    expect(errors.some((e) => e.property === 'phone')).toBe(true);
  });

  it('aceita email válido', async () => {
    expect(await errorsFor({ email: 'ana@test.com' })).toHaveLength(0);
  });

  it('rejeita email inválido', async () => {
    const errors = await errorsFor({ email: 'não-é-email' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('aceita birth_date válida', async () => {
    expect(await errorsFor({ birth_date: '1990-01-15' })).toHaveLength(0);
  });

  it('rejeita birth_date inválida', async () => {
    const errors = await errorsFor({ birth_date: 'não é data' });
    expect(errors.some((e) => e.property === 'birth_date')).toBe(true);
  });

  it('aceita gender válido', async () => {
    expect(await errorsFor({ gender: 'female' })).toHaveLength(0);
  });

  it('rejeita gender fora do enum', async () => {
    const errors = await errorsFor({ gender: 'inválido' });
    expect(errors.some((e) => e.property === 'gender')).toBe(true);
  });

  it('aceita marital_status válido', async () => {
    expect(await errorsFor({ marital_status: 'single' })).toHaveLength(0);
  });

  it('rejeita marital_status fora do enum', async () => {
    const errors = await errorsFor({ marital_status: 'inválido' });
    expect(errors.some((e) => e.property === 'marital_status')).toBe(true);
  });

  it('aceita profession como string', async () => {
    expect(await errorsFor({ profession: 'Engenheira' })).toHaveLength(0);
  });

  it('rejeita profession que não é string', async () => {
    const errors = await errorsFor({ profession: 123 });
    expect(errors.some((e) => e.property === 'profession')).toBe(true);
  });

  it('aceita os campos de endereço como string', async () => {
    expect(
      await errorsFor({
        address_street: 'Rua A',
        address_number: '100',
        address_complement: 'Apto 1',
        address_neighborhood: 'Centro',
        address_city: 'São Paulo',
        address_state: 'SP',
        address_zip: '01000-000',
      }),
    ).toHaveLength(0);
  });

  it('rejeita address_street que não é string', async () => {
    const errors = await errorsFor({ address_street: 123 });
    expect(errors.some((e) => e.property === 'address_street')).toBe(true);
  });

  it('rejeita address_number que não é string', async () => {
    const errors = await errorsFor({ address_number: 123 });
    expect(errors.some((e) => e.property === 'address_number')).toBe(true);
  });

  it('rejeita address_complement que não é string', async () => {
    const errors = await errorsFor({ address_complement: 123 });
    expect(errors.some((e) => e.property === 'address_complement')).toBe(true);
  });

  it('rejeita address_neighborhood que não é string', async () => {
    const errors = await errorsFor({ address_neighborhood: 123 });
    expect(errors.some((e) => e.property === 'address_neighborhood')).toBe(true);
  });

  it('rejeita address_city que não é string', async () => {
    const errors = await errorsFor({ address_city: 123 });
    expect(errors.some((e) => e.property === 'address_city')).toBe(true);
  });

  it('rejeita address_state que não é string', async () => {
    const errors = await errorsFor({ address_state: 123 });
    expect(errors.some((e) => e.property === 'address_state')).toBe(true);
  });

  it('rejeita address_zip que não é string', async () => {
    const errors = await errorsFor({ address_zip: 123 });
    expect(errors.some((e) => e.property === 'address_zip')).toBe(true);
  });

  it('aceita baptism_date válida', async () => {
    expect(await errorsFor({ baptism_date: '2010-05-20' })).toHaveLength(0);
  });

  it('rejeita baptism_date inválida', async () => {
    const errors = await errorsFor({ baptism_date: 'não é data' });
    expect(errors.some((e) => e.property === 'baptism_date')).toBe(true);
  });

  it('exige membership_date quando classification é member', async () => {
    const errors = await errorsFor({ classification: 'member' });
    expect(errors.some((e) => e.property === 'membership_date')).toBe(true);
  });

  it('aceita classification member com membership_date presente', async () => {
    expect(
      await errorsFor({ classification: 'member', membership_date: '2020-01-01' }),
    ).toHaveLength(0);
  });

  it('não exige membership_date quando classification não é member', async () => {
    expect(await errorsFor({ classification: 'visitor' })).toHaveLength(0);
  });

  it('rejeita membership_date que não é data ISO válida', async () => {
    const errors = await errorsFor({ classification: 'member', membership_date: 'não é data' });
    expect(errors.some((e) => e.property === 'membership_date')).toBe(true);
  });

  it('aceita former_denomination como string', async () => {
    expect(await errorsFor({ former_denomination: 'Batista' })).toHaveLength(0);
  });

  it('rejeita former_denomination que não é string', async () => {
    const errors = await errorsFor({ former_denomination: 123 });
    expect(errors.some((e) => e.property === 'former_denomination')).toBe(true);
  });

  it('aceita origin_congregation como string', async () => {
    expect(await errorsFor({ origin_congregation: 'Igreja X' })).toHaveLength(0);
  });

  it('rejeita origin_congregation que não é string', async () => {
    const errors = await errorsFor({ origin_congregation: 123 });
    expect(errors.some((e) => e.property === 'origin_congregation')).toBe(true);
  });

  it('rejeita classification fora do enum', async () => {
    const errors = await errorsFor({ classification: 'inválida' });
    expect(errors.some((e) => e.property === 'classification')).toBe(true);
  });

  it('aceita household_id UUID válido', async () => {
    expect(await errorsFor({ household_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita household_id que não é UUID', async () => {
    const errors = await errorsFor({ household_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'household_id')).toBe(true);
  });
});
