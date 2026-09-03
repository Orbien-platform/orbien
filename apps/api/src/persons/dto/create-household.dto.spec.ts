import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHouseholdDto } from './create-household.dto';

describe('CreateHouseholdDto', () => {
  it('aceita nome válido', async () => {
    const dto = plainToInstance(CreateHouseholdDto, { name: 'Família Silva' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita nome vazio', async () => {
    const dto = plainToInstance(CreateHouseholdDto, { name: '' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita nome ausente', async () => {
    const dto = plainToInstance(CreateHouseholdDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });
});
