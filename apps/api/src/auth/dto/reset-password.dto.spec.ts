import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResetPasswordDto } from './reset-password.dto';

describe('ResetPasswordDto', () => {
  it('aceita token e senha com 8+ caracteres', async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: 'tok123', password: 'segredo123' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita token vazio', async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: '', password: 'segredo123' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'token')).toBe(true);
  });

  it('rejeita senha com menos de 8 caracteres', async () => {
    const dto = plainToInstance(ResetPasswordDto, { token: 'tok123', password: '1234567' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
