import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterVisitorDto } from './register-visitor.dto';

const BASE = { token: 'tok-123', full_name: 'Ana Silva', lgpd_consent: true };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(RegisterVisitorDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('RegisterVisitorDto', () => {
  it('aceita os campos obrigatórios mínimos', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita token ausente', async () => {
    const dto = plainToInstance(RegisterVisitorDto, { full_name: 'Ana', lgpd_consent: true });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('rejeita full_name com menos de 2 caracteres', async () => {
    const errors = await errorsFor({ full_name: 'A' });
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

  it('aceita gender válido', async () => {
    expect(await errorsFor({ gender: 'male' })).toHaveLength(0);
  });

  it('rejeita gender fora do enum', async () => {
    const errors = await errorsFor({ gender: 'inválido' });
    expect(errors.some((e) => e.property === 'gender')).toBe(true);
  });

  it('rejeita lgpd_consent ausente', async () => {
    const dto = plainToInstance(RegisterVisitorDto, { token: 'tok', full_name: 'Ana Silva' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'lgpd_consent')).toBe(true);
  });

  it('rejeita lgpd_consent falso — é preciso aceitar os termos', async () => {
    const errors = await errorsFor({ lgpd_consent: false });
    expect(errors.some((e) => e.property === 'lgpd_consent')).toBe(true);
  });
});
