import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, payload);
  return validate(dto);
}

describe('LoginDto', () => {
  it('aceita email, senha e slug do tenant válidos', async () => {
    const errors = await errorsFor({
      email: 'a@b.com',
      password: 'segredo123',
      tenant_slug: 'doca',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejeita email malformado', async () => {
    const errors = await errorsFor({ email: 'não-é-email', password: 'x', tenant_slug: 'doca' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejeita senha vazia', async () => {
    const errors = await errorsFor({ email: 'a@b.com', password: '', tenant_slug: 'doca' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('rejeita tenant_slug ausente', async () => {
    const errors = await errorsFor({ email: 'a@b.com', password: 'x' });
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });
});
