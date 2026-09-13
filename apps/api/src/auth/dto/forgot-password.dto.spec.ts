import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

describe('ForgotPasswordDto', () => {
  it('aceita email válido, sem tenant_slug', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'a@b.com' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita email malformado', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'x' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
  });

  it('ignora tenant_slug enviado por cliente antigo, em vez de rejeitar', async () => {
    const dto = plainToInstance(ForgotPasswordDto, { email: 'a@b.com', tenant_slug: 'doca' });
    expect(await validate(dto)).toHaveLength(0);
  });
});
