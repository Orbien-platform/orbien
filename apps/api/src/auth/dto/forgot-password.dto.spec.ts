import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

describe('ForgotPasswordDto', () => {
  it('aceita email e tenant_slug válidos', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'a@b.com', tenant_slug: 'doca' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita email malformado', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'x', tenant_slug: 'doca' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('rejeita tenant_slug vazio', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'a@b.com', tenant_slug: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });
});
