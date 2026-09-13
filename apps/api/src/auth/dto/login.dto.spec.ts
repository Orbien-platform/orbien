import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto } from './login.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(LoginDto, payload);
  return validate(dto);
}

describe('LoginDto', () => {
  it('aceita email e senha válidos, sem tenant_slug', async () => {
    const errors = await errorsFor({ email: 'a@b.com', password: 'segredo123' });
    expect(errors).toHaveLength(0);
  });

  it('rejeita email malformado', async () => {
    const errors = await errorsFor({ email: 'não-é-email', password: 'x' });
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejeita senha vazia', async () => {
    const errors = await errorsFor({ email: 'a@b.com', password: '' });
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('ignora tenant_slug enviado por cliente antigo, em vez de rejeitar', async () => {
    const errors = await errorsFor({
      email: 'a@b.com',
      password: 'segredo123',
      tenant_slug: 'doca',
    });
    expect(errors).toHaveLength(0);
  });
});
