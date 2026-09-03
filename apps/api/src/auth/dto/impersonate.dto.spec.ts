import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImpersonateDto } from './impersonate.dto';

describe('ImpersonateDto', () => {
  it('aceita um UUID válido', async () => {
    const dto = plainToInstance(ImpersonateDto, {
      target_tenant_id: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita valor que não é UUID', async () => {
    const dto = plainToInstance(ImpersonateDto, { target_tenant_id: 'não-é-uuid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'target_tenant_id')).toBe(true);
  });
});
