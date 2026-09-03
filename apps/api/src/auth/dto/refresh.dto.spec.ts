import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RefreshDto } from './refresh.dto';

describe('RefreshDto', () => {
  it('aceita refresh_token não vazio', async () => {
    const dto = plainToInstance(RefreshDto, { refresh_token: 'abc123' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita refresh_token vazio', async () => {
    const dto = plainToInstance(RefreshDto, { refresh_token: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'refresh_token')).toBe(true);
  });

  it('rejeita refresh_token ausente', async () => {
    const dto = plainToInstance(RefreshDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'refresh_token')).toBe(true);
  });
});
